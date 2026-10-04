import {
  createHash,
  createPublicKey,
  randomBytes,
  timingSafeEqual,
  verify,
  type JsonWebKey,
} from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { query, transaction } from "./db";
import type { Role } from "./domain";
import { claimVerifiedAccount, lockEmailIdentity } from "./auth-ownership";
import {
  authConfig,
  authCookieOptions,
  authJson,
  authOrigin,
  authRoleSchema,
  authTokenSchema,
  limitAuthRequest,
  requireAuthDatabase,
} from "./auth";
import {
  checkOrigin,
  createSession,
  HttpError,
  requestJson,
  tokenHash,
} from "./security";

const discoveryUrl =
  "https://accounts.google.com/.well-known/openid-configuration";
const discoverySchema = z.object({
  issuer: z.literal("https://accounts.google.com"),
  authorization_endpoint: z.url(),
  token_endpoint: z.url(),
  jwks_uri: z.url(),
});
type Discovery = z.infer<typeof discoverySchema>;
const keySchema = z.object({
  kid: z.string().min(1).max(200),
  kty: z.literal("RSA"),
  use: z.literal("sig").optional(),
  alg: z.literal("RS256").optional(),
  n: z.string().min(1),
  e: z.string().min(1),
});
type SigningKey = z.infer<typeof keySchema>;
const claimsSchema = z.object({
  iss: z.enum(["https://accounts.google.com", "accounts.google.com"]),
  aud: z.union([z.string(), z.array(z.string()).min(1)]),
  azp: z.string().optional(),
  sub: z.string().min(1).max(255),
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
  email_verified: z.literal(true),
  name: z.string().trim().min(1).max(200).optional(),
  hd: z.string().min(1).max(253).optional(),
  nonce: z.string().min(1).max(256),
  iat: z.number().int().positive(),
  exp: z.number().int().positive(),
});
export type GoogleIdentity = z.infer<typeof claimsSchema>;
let cachedDiscovery: { value: Discovery; expires: number } | undefined;
let cachedKeys:
  { uri: string; value: SigningKey[]; expires: number } | undefined;

class GoogleFlowError extends HttpError {
  constructor(
    public code: "google_expired" | "google_cancelled" | "email_link_required",
  ) {
    super(400, "Google sign-in could not complete.");
  }
}

function cacheExpiry(response: Response) {
  const directive = response.headers
    .get("cache-control")
    ?.match(/(?:^|,)\s*max-age=(\d+)/i);
  const seconds = directive ? Number(directive[1]) : 300;
  const age = Number(response.headers.get("age") ?? 0);
  return Date.now() + Math.max(0, Math.min(seconds - age, 86400)) * 1000;
}

async function providerJson(url: string) {
  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    });
  } catch {
    throw new HttpError(503, "Google sign-in is temporarily unavailable.");
  }
  if (!response.ok)
    throw new HttpError(503, "Google sign-in is temporarily unavailable.");
  try {
    const text = await response.text();
    if (text.length > 128000) throw new Error("Provider response too large");
    return { response, data: JSON.parse(text) as unknown };
  } catch {
    throw new HttpError(503, "Google sign-in is temporarily unavailable.");
  }
}

async function discovery() {
  if (cachedDiscovery && cachedDiscovery.expires > Date.now())
    return cachedDiscovery.value;
  const { data, response } = await providerJson(discoveryUrl);
  const parsed = discoverySchema.safeParse(data);
  if (!parsed.success)
    throw new HttpError(503, "Google sign-in is temporarily unavailable.");
  // Endpoint URLs come from Google's HTTPS discovery document. Restrict their
  // origins before using them for redirects or authenticated server requests.
  for (const [endpoint, origin] of [
    [parsed.data.authorization_endpoint, "https://accounts.google.com"],
    [parsed.data.token_endpoint, "https://oauth2.googleapis.com"],
    [parsed.data.jwks_uri, "https://www.googleapis.com"],
  ]) {
    const url = new URL(endpoint);
    if (url.origin !== origin || url.username || url.password)
      throw new HttpError(503, "Google sign-in is temporarily unavailable.");
  }
  cachedDiscovery = { value: parsed.data, expires: cacheExpiry(response) };
  return parsed.data;
}

async function signingKeys(uri: string, refresh = false) {
  if (!refresh && cachedKeys?.uri === uri && cachedKeys.expires > Date.now())
    return cachedKeys.value;
  const { data, response } = await providerJson(uri);
  const parsed = z
    .object({ keys: z.array(z.unknown()).max(20) })
    .safeParse(data);
  if (!parsed.success)
    throw new HttpError(503, "Google sign-in is temporarily unavailable.");
  const keys = parsed.data.keys.flatMap((value) => {
    const key = keySchema.safeParse(value);
    return key.success ? [key.data] : [];
  });
  cachedKeys = { uri, value: keys, expires: cacheExpiry(response) };
  return keys;
}

function invalidToken(): never {
  throw new HttpError(401, "The Google account could not be verified.");
}

export async function verifyGoogleToken(token: string, expectedNonce: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId)
    throw new HttpError(503, "Google sign-in is being configured.");
  if (token.length > 16000) invalidToken();
  const parts = token.split(".");
  if (
    parts.length !== 3 ||
    parts.some((part) => !/^[a-zA-Z0-9_-]+$/.test(part))
  )
    invalidToken();
  let header: Record<string, unknown>;
  let data: unknown;
  try {
    header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    data = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    invalidToken();
  }
  if (
    !header ||
    header.alg !== "RS256" ||
    typeof header.kid !== "string" ||
    !header.kid ||
    header.kid.length > 200 ||
    header.crit !== undefined
  )
    invalidToken();
  const provider = await discovery();
  let key = (await signingKeys(provider.jwks_uri)).find(
    (key) => key.kid === header.kid,
  );
  if (!key)
    key = (await signingKeys(provider.jwks_uri, true)).find(
      (key) => key.kid === header.kid,
    );
  if (!key) invalidToken();
  try {
    const publicKey = createPublicKey({
      key: key as JsonWebKey,
      format: "jwk",
    });
    if (
      !verify(
        "RSA-SHA256",
        Buffer.from(`${parts[0]}.${parts[1]}`),
        publicKey,
        Buffer.from(parts[2], "base64url"),
      )
    )
      invalidToken();
  } catch {
    invalidToken();
  }
  const parsed = claimsSchema.safeParse(data);
  if (!parsed.success) invalidToken();
  const claims = parsed.data;
  const audience = typeof claims.aud === "string" ? [claims.aud] : claims.aud;
  const now = Math.floor(Date.now() / 1000);
  if (
    !audience.includes(clientId) ||
    (audience.length > 1 && claims.azp !== clientId) ||
    (claims.azp !== undefined && claims.azp !== clientId) ||
    claims.exp <= now ||
    claims.iat > now + 60 ||
    claims.exp <= claims.iat ||
    !timingSafeEqual(
      Buffer.from(tokenHash(claims.nonce), "hex"),
      Buffer.from(tokenHash(expectedNonce), "hex"),
    )
  )
    invalidToken();
  return claims;
}

async function resolveGoogleUser(identity: GoogleIdentity, role: Role) {
  return transaction(async (db) => {
    // Serialize two callbacks for the same permanent Google subject.
    await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `google:${identity.sub}`,
    ]);
    const {
      rows: [linked],
    } = await db.query<{ user_id: string; email: string }>(
      "SELECT a.user_id,u.email FROM auth_identities a JOIN users u ON u.id=a.user_id WHERE a.provider='google' AND a.subject=$1",
      [identity.sub],
    );
    if (linked) {
      await lockEmailIdentity(db, linked.email);
      await createSession(linked.user_id, db);
      return linked.user_id;
    }
    // Google is authoritative only for Gmail and managed Workspace addresses.
    // A third-party email may have changed owners since Google verified it.
    const authoritative =
      identity.email.endsWith("@gmail.com") || !!identity.hd;
    if (!authoritative) throw new GoogleFlowError("email_link_required");
    const userId = await claimVerifiedAccount(db, {
      email: identity.email,
      name:
        identity.name?.slice(0, 80) ??
        identity.email.split("@")[0].slice(0, 80),
      role,
    });
    await db.query(
      "INSERT INTO auth_identities(provider,subject,user_id) VALUES('google',$1,$2)",
      [identity.sub, userId],
    );
    await createSession(userId, db);
    return userId;
  });
}

export async function startGoogleSignIn(request: Request) {
  requireAuthDatabase();
  if (!authConfig().google)
    throw new HttpError(503, "Google sign-in is being configured.");
  checkOrigin(request);
  await limitAuthRequest(request, "google-start");
  const { role } = z
    .object({ role: authRoleSchema })
    .parse(await requestJson(request));
  const provider = await discovery();
  const state = randomBytes(32).toString("hex");
  const browser = randomBytes(32).toString("hex");
  const nonce = randomBytes(32).toString("hex");
  const verifier = randomBytes(32).toString("base64url");
  await query("DELETE FROM oauth_challenges WHERE expires_at <= now()");
  await query(
    "INSERT INTO oauth_challenges(state_hash,browser_hash,nonce,code_verifier,role,expires_at) VALUES($1,$2,$3,$4,$5,now()+interval '10 minutes')",
    [tokenHash(state), tokenHash(browser), nonce, verifier, role],
  );
  (await cookies()).set("fs_google_flow", browser, authCookieOptions(10 * 60));
  const url = new URL(provider.authorization_endpoint);
  url.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: `${authOrigin()}/api/auth/google/callback`,
    response_type: "code",
    scope: "openid email profile",
    state,
    nonce,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return authJson({ url: url.toString() });
}

export async function googleCallback(request: Request) {
  let redirect: URL;
  try {
    redirect = new URL("/account", authOrigin());
  } catch {
    return authJson({ error: "Google sign-in is being configured." }, 503);
  }
  const jar = await cookies();
  try {
    requireAuthDatabase();
    if (!authConfig().google)
      throw new HttpError(503, "Google sign-in is being configured.");
    await limitAuthRequest(request, "google-callback");
    const url = new URL(request.url);
    const state = url.searchParams.get("state");
    const browser = jar.get("fs_google_flow")?.value;
    if (
      !state ||
      !browser ||
      !authTokenSchema.safeParse(state).success ||
      !authTokenSchema.safeParse(browser).success
    )
      throw new GoogleFlowError("google_expired");
    const [challenge] = await query<{
      nonce: string;
      code_verifier: string;
      role: Role;
    }>(
      "DELETE FROM oauth_challenges WHERE state_hash=$1 AND browser_hash=$2 AND expires_at > now() RETURNING nonce,code_verifier,role",
      [tokenHash(state), tokenHash(browser)],
    );
    if (!challenge) throw new GoogleFlowError("google_expired");
    if (url.searchParams.has("error"))
      throw new GoogleFlowError("google_cancelled");
    const code = url.searchParams.get("code");
    if (!code || code.length > 4096)
      throw new GoogleFlowError("google_expired");
    const provider = await discovery();
    const response = await fetch(provider.token_endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      signal: AbortSignal.timeout(10000),
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: `${authOrigin()}/api/auth/google/callback`,
        grant_type: "authorization_code",
        code_verifier: challenge.code_verifier,
      }).toString(),
    });
    if (!response.ok)
      throw new HttpError(503, "Google sign-in is temporarily unavailable.");
    const token = z
      .object({ id_token: z.string().max(16000) })
      .parse(await response.json());
    const identity = await verifyGoogleToken(token.id_token, challenge.nonce);
    const userId = await resolveGoogleUser(identity, challenge.role);
    await query(
      "INSERT INTO audit_events(actor_id,action) VALUES($1,'google_signin')",
      [userId],
    );
    redirect = new URL("/workspace", authOrigin());
  } catch (error) {
    const code =
      error instanceof GoogleFlowError ? error.code : "google_unavailable";
    redirect.searchParams.set("authError", code);
  }
  jar.delete("fs_google_flow");
  return NextResponse.redirect(redirect, {
    status: 303,
    headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
}
