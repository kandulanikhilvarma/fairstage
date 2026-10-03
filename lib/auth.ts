import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { query, transaction } from "./db";
import type { Role } from "./domain";
import { claimVerifiedAccount } from "./auth-ownership";
import {
  checkOrigin,
  createSession,
  HttpError,
  rateLimit,
  requestJson,
  tokenHash,
} from "./security";

export const authRoleSchema = z.enum(["candidate", "employer"]);
export const authTokenSchema = z.string().regex(/^[a-f0-9]{64}$/);
const magicInputSchema = z.object({
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
  role: authRoleSchema,
  name: z.string().trim().min(2).max(80).optional(),
});
export const magicSentMessage =
  "Check your inbox for a sign-in link. Open it in this browser within 15 minutes.";

export function authConfig() {
  const database = !!process.env.DATABASE_URL && !!process.env.APP_URL;
  return {
    google:
      database &&
      !!process.env.GOOGLE_CLIENT_ID &&
      !!process.env.GOOGLE_CLIENT_SECRET,
    magic: database && !!process.env.RESEND_API_KEY && !!process.env.EMAIL_FROM,
  };
}

export function authOrigin() {
  const value = process.env.APP_URL;
  if (!value) throw new HttpError(503, "Sign-in is being configured.");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new HttpError(503, "Sign-in is being configured.");
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
    url.username ||
    url.password
  )
    throw new HttpError(503, "Sign-in is being configured.");
  return url.origin;
}

export function requireAuthDatabase() {
  if (!process.env.DATABASE_URL)
    throw new HttpError(503, "Sign-in is being configured.");
  authOrigin();
}

export function authCookieOptions(seconds: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: seconds,
  };
}

export async function limitAuthRequest(request: Request, method: string) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  await rateLimit(`auth:${method}:${ip}`, 20, 900);
}

export function authJson(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
}

export async function authRoute(action: () => Promise<Response>) {
  try {
    return await action();
  } catch (error) {
    if (error instanceof HttpError)
      return authJson({ error: error.message }, error.status);
    if (error instanceof ZodError)
      return authJson({ error: "Check the sign-in form values." }, 400);
    // Never log link tokens, authorization codes, or provider responses.
    console.error(JSON.stringify({ event: "authentication_failed" }));
    return authJson({ error: "Sign-in could not complete. Try again." }, 500);
  }
}

export async function startMagicLink(request: Request) {
  requireAuthDatabase();
  if (!authConfig().magic)
    throw new HttpError(503, "Email sign-in is being configured.");
  checkOrigin(request);
  await limitAuthRequest(request, "magic-start");
  const input = magicInputSchema.parse(await requestJson(request));
  await rateLimit(`magic-email:${input.email}`, 3, 900);
  const token = randomBytes(32).toString("hex");
  const browser = randomBytes(32).toString("hex");
  const name = input.name ?? input.email.split("@")[0].slice(0, 80);
  await query("DELETE FROM magic_links WHERE expires_at <= now()");
  await query(
    "INSERT INTO magic_links(token_hash,browser_hash,email,name,role,expires_at) VALUES($1,$2,$3,$4,$5,now()+interval '15 minutes')",
    [tokenHash(token), tokenHash(browser), input.email, name, input.role],
  );
  const link = new URL("/account", authOrigin());
  link.searchParams.set("action", "magic");
  link.searchParams.set("token", token);
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: input.email,
        subject: "Your Fairstage sign-in link",
        text: `Continue to Fairstage:\n${link.toString()}\n\nOpen this link in the browser where you requested it. It expires in 15 minutes and can be used once. If you did not request it, ignore this email.`,
      }),
    });
    if (!response.ok) throw new Error("Email delivery rejected");
  } catch {
    await query("DELETE FROM magic_links WHERE token_hash=$1", [
      tokenHash(token),
    ]);
    throw new HttpError(503, "The email could not be sent. Try again later.");
  }
  (await cookies()).set("fs_magic_flow", browser, authCookieOptions(15 * 60));
  return authJson({ message: magicSentMessage });
}

export async function verifyMagicLink(request: Request) {
  requireAuthDatabase();
  checkOrigin(request);
  await limitAuthRequest(request, "magic-verify");
  const { token } = z
    .object({ token: authTokenSchema })
    .parse(await requestJson(request));
  const jar = await cookies();
  const browser = jar.get("fs_magic_flow")?.value;
  if (!browser || !authTokenSchema.safeParse(browser).success)
    throw new HttpError(400, "Request a new link in this browser to sign in.");
  await transaction(async (db) => {
    const {
      rows: [link],
    } = await db.query<{
      email: string;
      name: string;
      role: Role;
    }>(
      "DELETE FROM magic_links WHERE token_hash=$1 AND browser_hash=$2 AND expires_at > now() RETURNING email,name,role",
      [tokenHash(token), tokenHash(browser)],
    );
    if (!link)
      throw new HttpError(
        400,
        "This link expired or was used. Request a new link.",
      );
    const userId = await claimVerifiedAccount(db, link);
    await db.query(
      "INSERT INTO audit_events(actor_id,action) VALUES($1,'magic_signin')",
      [userId],
    );
    await createSession(userId, db);
  });
  jar.delete("fs_magic_flow");
  return authJson({ message: "Signed in.", redirect: "/workspace" });
}
