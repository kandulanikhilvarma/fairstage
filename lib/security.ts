import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { query } from "./db";
import type { User } from "./domain";

const derive = promisify(scrypt);
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const key = (await derive(password, salt, 64)) as Buffer;
  return `${salt}:${key.toString("hex")}`;
}
export async function verifyPassword(password: string, hash: string) {
  const [salt, encoded] = hash.split(":");
  if (!salt || !encoded || encoded.length !== 128) return false;
  const expected = Buffer.from(encoded, "hex");
  const actual = (await derive(password, salt, 64)) as Buffer;
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export async function createSession(userId: string) {
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 7 * 86400000);
  await query(
    "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,$3)",
    [tokenHash(token), userId, expires],
  );
  (await cookies()).set("fs_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires,
    path: "/",
  });
}
export async function sessionUser(): Promise<User> {
  const token = (await cookies()).get("fs_session")?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token))
    throw new HttpError(401, "Sign in to continue.");
  const [user] = await query<User & { id: string }>(
    `SELECT u.id,u.name,u.email,u.role,u.company,u.bio,u.country,u.email_verified AS verified,u.connect_id AS "connectId" FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=$1 AND s.expires_at > now()`,
    [tokenHash(token)],
  );
  if (!user) throw new HttpError(401, "Your session expired. Sign in again.");
  return user;
}
export function requireRole(user: User, role: User["role"]) {
  if (user.role !== role)
    throw new HttpError(403, "Your account cannot do this action.");
}
export function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const allowed = process.env.APP_URL;
  if (!allowed || origin !== new URL(allowed).origin)
    throw new HttpError(403, "The request origin is not permitted.");
}
export async function rateLimit(key: string, limit: number, seconds: number) {
  const [row] = await query<{ count: number }>(
    `INSERT INTO rate_limits(key,count,reset_at) VALUES($1,1,now()+($2 * interval '1 second')) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN rate_limits.reset_at < now() THEN 1 ELSE rate_limits.count+1 END, reset_at=CASE WHEN rate_limits.reset_at < now() THEN now()+($2 * interval '1 second') ELSE rate_limits.reset_at END RETURNING count`,
    [tokenHash(key), seconds],
  );
  if (row.count > limit)
    throw new HttpError(429, "Too many requests. Try again later.");
}
export async function requestJson(request: Request) {
  const body = await request.text();
  if (body.length > 16000)
    throw new HttpError(413, "The request is too large.");
  try {
    return JSON.parse(body);
  } catch {
    throw new HttpError(400, "The request must contain valid JSON.");
  }
}
export async function audit(
  userId: string,
  action: string,
  resourceId?: string,
) {
  await query(
    "INSERT INTO audit_events(actor_id,action,resource_id) VALUES($1,$2,$3)",
    [userId, action, resourceId ?? null],
  );
}
