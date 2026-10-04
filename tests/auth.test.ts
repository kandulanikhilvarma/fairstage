import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { Pool, type PoolClient } from "pg";
import {
  createHash,
  generateKeyPairSync,
  randomBytes,
  sign,
  type KeyObject,
} from "node:crypto";

const state = vi.hoisted(() => ({
  db: null as PGlite | null,
  cookies: new Map<string, string>(),
  cookieOptions: new Map<string, Record<string, unknown>>(),
  fetch: vi.fn(),
  idToken: "",
  emailAccepted: true,
  providerAccepted: true,
  emailBody: null as null | { text: string; to: string },
  exchange: null as URLSearchParams | null,
}));
vi.mock("../lib/db", () => ({
  query: async (sql: string, values: unknown[] = []) =>
    (await state.db!.query(sql, values)).rows,
  transaction: async (
    fn: (db: {
      query: (sql: string, values?: unknown[]) => Promise<unknown>;
    }) => Promise<unknown>,
  ) =>
    state.db!.transaction(async (tx) =>
      fn({
        query: async (sql, values = []) => {
          const r = await tx.query(sql, values);
          return { ...r, rowCount: r.affectedRows ?? r.rows.length };
        },
      }),
    ),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (key: string) =>
      state.cookies.has(key) ? { value: state.cookies.get(key) } : undefined,
    set: (
      key: string,
      value: string,
      options: Record<string, unknown> = {},
    ) => {
      state.cookies.set(key, value);
      state.cookieOptions.set(key, options);
    },
    delete: (key: string) => state.cookies.delete(key),
  }),
}));

import { POST as startMagic } from "../app/api/auth/magic/start/route";
import { POST as verifyMagic } from "../app/api/auth/magic/verify/route";
import { POST as startGoogle } from "../app/api/auth/google/route";
import { GET as callbackGoogle } from "../app/api/auth/google/callback/route";
import { POST as passwordAuth } from "../app/api/[...path]/route";
import { authConfig, magicSentMessage } from "../lib/auth";
import { claimVerifiedAccount, lockEmailIdentity } from "../lib/auth-ownership";
import { transaction } from "../lib/db";
import { verifyGoogleToken } from "../lib/google-auth";
import {
  createSession,
  hashPassword,
  sessionUser,
  tokenHash,
  verifyPassword,
} from "../lib/security";

const origin = "http://localhost:3000";
const clientId = "fairstage-test.apps.googleusercontent.com";
const existing = "00000000-0000-4000-8000-000000000010";
const attackerPassword = "Untrusted password 123!";
const oldSession = "d".repeat(64);
let privateKey: KeyObject;
let jwk: Record<string, unknown>;
function request(path: string, body: unknown, requestOrigin = origin) {
  return new Request(`${origin}/api/auth/${path}`, {
    method: "POST",
    headers: { origin: requestOrigin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
async function rows(sql: string, values: unknown[] = []) {
  return (await state.db!.query(sql, values)).rows as Record<string, unknown>[];
}
function signedToken(overrides: Record<string, unknown> = {}, header = {}) {
  const now = Math.floor(Date.now() / 1000);
  const parts = [
    { alg: "RS256", kid: "test-google-key", typ: "JWT", ...header },
    {
      iss: "https://accounts.google.com",
      aud: clientId,
      sub: "google-permanent-subject",
      email: "person@gmail.com",
      email_verified: true,
      name: "Test Person",
      nonce: "expected-nonce",
      iat: now,
      exp: now + 3600,
      ...overrides,
    },
  ].map((value) => Buffer.from(JSON.stringify(value)).toString("base64url"));
  const payload = parts.join(".");
  return `${payload}.${sign("RSA-SHA256", Buffer.from(payload), privateKey).toString("base64url")}`;
}
async function magicToken(email = "person@example.test", role = "candidate") {
  const response = await startMagic(
    request("magic/start", { email, role, name: "Test Person" }),
  );
  expect(response.status).toBe(200);
  const link = state.emailBody!.text.match(/https?:\/\/\S+/)![0];
  return new URL(link).searchParams.get("token")!;
}
async function googleFlow(role = "candidate") {
  const response = await startGoogle(request("google", { role }));
  expect(response.status).toBe(200);
  return new URL((await response.json()).url);
}
function callbackRequest(flow: URL, extra = "code=valid-authorization-code") {
  return new Request(
    `${origin}/api/auth/google/callback?state=${flow.searchParams.get("state")}&${extra}`,
  );
}

async function seedPasswordAccount(email: string, verified = false) {
  const hash = await hashPassword(attackerPassword);
  await rows(
    `INSERT INTO users(id,name,email,password_hash,role,email_verified,
      company,bio,headline,skills,portfolio_url,resume_url,country,timezone)
     VALUES($1,'Untrusted Name',$2,$3,'candidate',$4,'Untrusted Company',
      'Untrusted Bio','Untrusted Headline',ARRAY['Untrusted Skill'],
      'https://attacker.example/portfolio','https://attacker.example/resume',
      'US','America/New_York')`,
    [existing, email, hash, verified],
  );
  await rows(
    "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 day')",
    [tokenHash(oldSession), existing],
  );
  await rows(
    "INSERT INTO auth_tokens(token_hash,user_id,purpose,expires_at) VALUES($1,$3,'verify',now()+interval '1 day'),($2,$3,'reset',now()+interval '1 day')",
    [tokenHash("e".repeat(64)), tokenHash("f".repeat(64)), existing],
  );
  state.cookies.set("fs_session", oldSession);
  return hash;
}

async function signInOwner(method: "google" | "magic", role = "employer") {
  if (method === "magic") {
    const token = await magicToken("person@example.test", role);
    expect((await verifyMagic(request("magic/verify", { token }))).status).toBe(
      200,
    );
  } else {
    const flow = await googleFlow(role);
    state.idToken = signedToken({ nonce: flow.searchParams.get("nonce") });
    expect(
      (await callbackGoogle(callbackRequest(flow))).headers.get("location"),
    ).toBe(`${origin}/workspace`);
  }
}

beforeAll(async () => {
  state.db = new PGlite();
  for (const file of [
    "001_initial.sql",
    "002_auth.sql",
    "003_workspace.sql",
    "004_razorpay.sql",
  ])
    await state.db.exec(
      await readFile(new URL(`../db/${file}`, import.meta.url), "utf8"),
    );
  const keypair = generateKeyPairSync("rsa", { modulusLength: 2048 });
  privateKey = keypair.privateKey;
  jwk = {
    ...keypair.publicKey.export({ format: "jwk" }),
    kid: "test-google-key",
    alg: "RS256",
    use: "sig",
  };
});
afterAll(async () => {
  await state.db?.close();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
beforeEach(async () => {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("APP_URL", origin);
  vi.stubEnv("DATABASE_URL", "postgres://unit-test");
  vi.stubEnv("GOOGLE_CLIENT_ID", clientId);
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-client-secret");
  vi.stubEnv("RESEND_API_KEY", "re_unit_test");
  vi.stubEnv("EMAIL_FROM", "Fairstage <signin@example.test>");
  state.cookies.clear();
  state.cookieOptions.clear();
  state.emailBody = null;
  state.exchange = null;
  state.emailAccepted = true;
  state.providerAccepted = true;
  state.idToken = signedToken();
  state.fetch
    .mockReset()
    .mockImplementation(async (url: string, options?: RequestInit) => {
      if (url === "https://api.resend.com/emails") {
        state.emailBody = JSON.parse(options!.body as string);
        return Response.json(
          { id: "email-test" },
          { status: state.emailAccepted ? 200 : 400 },
        );
      }
      if (
        url === "https://accounts.google.com/.well-known/openid-configuration"
      )
        return Response.json(
          {
            issuer: "https://accounts.google.com",
            authorization_endpoint:
              "https://accounts.google.com/o/oauth2/v2/auth",
            token_endpoint: "https://oauth2.googleapis.com/token",
            jwks_uri: "https://www.googleapis.com/oauth2/v3/certs",
          },
          { headers: { "Cache-Control": "public, max-age=300" } },
        );
      if (url === "https://www.googleapis.com/oauth2/v3/certs")
        return Response.json(
          { keys: [jwk] },
          { headers: { "Cache-Control": "public, max-age=300" } },
        );
      if (url === "https://oauth2.googleapis.com/token") {
        state.exchange = new URLSearchParams(options!.body as string);
        return Response.json(
          { id_token: state.idToken },
          { status: state.providerAccepted ? 200 : 400 },
        );
      }
      throw new Error("Unexpected provider request");
    });
  vi.stubGlobal("fetch", state.fetch);
  await state.db!.exec(
    "TRUNCATE users,rate_limits,magic_links,oauth_challenges RESTART IDENTITY CASCADE",
  );
});

describe("first verified email ownership", () => {
  it.each(["google", "magic"] as const)(
    "%s revokes a pre-registrant's password, sessions, tokens, and profile",
    async (method) => {
      const email =
        method === "google" ? "person@gmail.com" : "person@example.test";
      await seedPasswordAccount(email);
      expect((await sessionUser()).verified).toBe(false);
      await signInOwner(method);
      expect((await sessionUser()).role).toBe("employer");
      const [user] = await rows("SELECT * FROM users WHERE id=$1", [existing]);
      expect(
        await verifyPassword(attackerPassword, String(user.password_hash)),
      ).toBe(false);
      expect(user).toMatchObject({
        name: "Test Person",
        role: "employer",
        email_verified: true,
        company: "",
        bio: "",
        headline: "",
        skills: [],
        portfolio_url: "",
        resume_url: "",
        country: "IN",
        timezone: "Asia/Kolkata",
      });
      expect(
        await rows("SELECT * FROM auth_tokens WHERE user_id=$1", [existing]),
      ).toHaveLength(0);
      expect(
        await rows("SELECT * FROM sessions WHERE user_id=$1", [existing]),
      ).toHaveLength(1);
      const ownerSession = state.cookies.get("fs_session")!;
      state.cookies.set("fs_session", oldSession);
      await expect(sessionUser()).rejects.toMatchObject({ status: 401 });
      const login = await passwordAuth(
        request("login", { email, password: attackerPassword }),
        { params: Promise.resolve({ path: ["auth", "login"] }) },
      );
      expect(login.status).toBe(401);
      state.cookies.set("fs_session", ownerSession);
      expect((await sessionUser()).id).toBe(existing);
      expect(
        await rows(
          "SELECT action FROM audit_events WHERE actor_id=$1 AND action='unverified_account_reclaimed'",
          [existing],
        ),
      ).toHaveLength(1);
    },
  );

  it.each(["google", "magic"] as const)(
    "%s preserves a verified owner's password, sessions, role, and profile",
    async (method) => {
      const email =
        method === "google" ? "person@gmail.com" : "person@example.test";
      const originalHash = await seedPasswordAccount(email, true);
      await signInOwner(method);
      const [user] = await rows("SELECT * FROM users WHERE id=$1", [existing]);
      expect(user.password_hash).toBe(originalHash);
      expect(
        await verifyPassword(attackerPassword, String(user.password_hash)),
      ).toBe(true);
      expect(user).toMatchObject({
        name: "Untrusted Name",
        role: "candidate",
        company: "Untrusted Company",
        bio: "Untrusted Bio",
        headline: "Untrusted Headline",
        skills: ["Untrusted Skill"],
        portfolio_url: "https://attacker.example/portfolio",
        resume_url: "https://attacker.example/resume",
        country: "US",
        timezone: "America/New_York",
      });
      state.cookies.set("fs_session", oldSession);
      expect((await sessionUser()).id).toBe(existing);
      const login = await passwordAuth(
        request("login", { email, password: attackerPassword }),
        { params: Promise.resolve({ path: ["auth", "login"] }) },
      );
      expect(login.status).toBe(200);
      expect(
        await rows("SELECT * FROM auth_tokens WHERE user_id=$1", [existing]),
      ).toHaveLength(2);
      expect(
        await rows(
          "SELECT * FROM audit_events WHERE action='unverified_account_reclaimed'",
        ),
      ).toHaveLength(0);
    },
  );

  it("preserves country and time zone for an operator-mapped provider account", async () => {
    await seedPasswordAccount("person@example.test");
    await rows(
      "UPDATE users SET razorpay_account_id='acc_operator_pending' WHERE id=$1",
      [existing],
    );
    await signInOwner("magic");
    expect(
      await rows(
        "SELECT country,timezone,razorpay_account_id FROM users WHERE id=$1",
        [existing],
      ),
    ).toEqual([
      {
        country: "US",
        timezone: "America/New_York",
        razorpay_account_id: "acc_operator_pending",
      },
    ]);
  });

  it("normalizes and serializes simultaneous claims without creating two owners", async () => {
    await seedPasswordAccount("person@example.test");
    const ids = await Promise.all(
      Array.from({ length: 4 }, (_, index) =>
        transaction((db) =>
          claimVerifiedAccount(db, {
            email:
              index % 2 ? "  PERSON@EXAMPLE.TEST  " : "person@example.test",
            name: `Verified Person ${index}`,
            role: index % 2 ? "candidate" : "employer",
          }),
        ),
      ),
    );
    expect(new Set(ids)).toEqual(new Set([existing]));
    expect(await rows("SELECT name,role FROM users")).toEqual([
      { name: "Verified Person 0", role: "employer" },
    ]);
    expect(await rows("SELECT * FROM sessions")).toHaveLength(0);
    expect(await rows("SELECT * FROM auth_tokens")).toHaveLength(0);
    expect(
      await rows(
        "SELECT * FROM audit_events WHERE action='unverified_account_reclaimed'",
      ),
    ).toHaveLength(1);
  });

  it("rolls back revocation and profile changes if the claim transaction fails", async () => {
    const originalHash = await seedPasswordAccount("person@example.test");
    await expect(
      transaction(async (db) => {
        await claimVerifiedAccount(db, {
          email: "person@example.test",
          name: "Verified Person",
          role: "employer",
        });
        throw new Error("Transaction interrupted");
      }),
    ).rejects.toThrow("Transaction interrupted");
    const [user] = await rows("SELECT * FROM users WHERE id=$1", [existing]);
    expect(user).toMatchObject({
      password_hash: originalHash,
      email_verified: false,
      name: "Untrusted Name",
      role: "candidate",
    });
    expect((await sessionUser()).id).toBe(existing);
    expect(
      await rows("SELECT * FROM auth_tokens WHERE user_id=$1", [existing]),
    ).toHaveLength(2);
    expect(
      await rows(
        "SELECT * FROM audit_events WHERE action='unverified_account_reclaimed'",
      ),
    ).toHaveLength(0);
  });
});

describe("passwordless email sign-in", () => {
  it("stores only hashed link and browser secrets, then consumes the link once", async () => {
    const token = await magicToken();
    const [stored] = await rows("SELECT * FROM magic_links");
    expect(stored.token_hash).toBe(tokenHash(token));
    expect(stored.browser_hash).toBe(
      tokenHash(state.cookies.get("fs_magic_flow")!),
    );
    expect(state.cookieOptions.get("fs_magic_flow")).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      maxAge: 900,
    });
    const response = await verifyMagic(request("magic/verify", { token }));
    expect(response.status).toBe(200);
    expect(await rows("SELECT * FROM magic_links")).toHaveLength(0);
    expect(await rows("SELECT email,email_verified,role FROM users")).toEqual([
      { email: "person@example.test", email_verified: true, role: "candidate" },
    ]);
    expect(state.cookies.has("fs_session")).toBe(true);
    expect((await verifyMagic(request("magic/verify", { token }))).status).toBe(
      400,
    );
  });
  it("preserves an existing account's role even when employer is selected", async () => {
    await rows(
      "INSERT INTO users(id,name,email,password_hash,role,email_verified) VALUES($1,'Original','person@example.test','unused','candidate',true)",
      [existing],
    );
    const token = await magicToken("person@example.test", "employer");
    expect((await verifyMagic(request("magic/verify", { token }))).status).toBe(
      200,
    );
    expect(await rows("SELECT id,name,role,email_verified FROM users")).toEqual(
      [
        {
          id: existing,
          name: "Original",
          role: "candidate",
          email_verified: true,
        },
      ],
    );
  });
  it("rejects a link in a different browser without consuming it", async () => {
    const token = await magicToken();
    const browser = state.cookies.get("fs_magic_flow")!;
    state.cookies.set("fs_magic_flow", "a".repeat(64));
    expect((await verifyMagic(request("magic/verify", { token }))).status).toBe(
      400,
    );
    expect(await rows("SELECT * FROM magic_links")).toHaveLength(1);
    state.cookies.set("fs_magic_flow", browser);
    expect((await verifyMagic(request("magic/verify", { token }))).status).toBe(
      200,
    );
  });
  it("rejects expired links and does not create an account", async () => {
    const token = await magicToken();
    await rows("UPDATE magic_links SET expires_at=now()-interval '1 minute'");
    expect((await verifyMagic(request("magic/verify", { token }))).status).toBe(
      400,
    );
    expect(await rows("SELECT * FROM users")).toHaveLength(0);
  });
  it("returns the same sent response for new and existing email addresses", async () => {
    await rows(
      "INSERT INTO users(name,email,password_hash,role) VALUES('Original','existing@example.test','unused','candidate')",
    );
    const first = await startMagic(
      request("magic/start", { email: "new@example.test", role: "candidate" }),
    );
    const second = await startMagic(
      request("magic/start", {
        email: "existing@example.test",
        role: "candidate",
      }),
    );
    expect(await first.json()).toEqual({ message: magicSentMessage });
    expect(await second.json()).toEqual({ message: magicSentMessage });
  });
  it("rejects cross-origin start and verify requests", async () => {
    expect(
      (
        await startMagic(
          request(
            "magic/start",
            { email: "person@example.test", role: "candidate" },
            "https://attacker.example.test",
          ),
        )
      ).status,
    ).toBe(403);
    const token = await magicToken();
    expect(
      (
        await verifyMagic(
          request("magic/verify", { token }, "https://attacker.example.test"),
        )
      ).status,
    ).toBe(403);
    expect(await rows("SELECT * FROM magic_links")).toHaveLength(1);
  });
  it("removes a link when the email provider rejects delivery", async () => {
    state.emailAccepted = false;
    const response = await startMagic(
      request("magic/start", {
        email: "person@example.test",
        role: "candidate",
      }),
    );
    expect(response.status).toBe(503);
    expect(await rows("SELECT * FROM magic_links")).toHaveLength(0);
    expect(state.cookies.has("fs_magic_flow")).toBe(false);
  });
  it("limits repeated email requests regardless of account existence", async () => {
    for (let index = 0; index < 3; index++) await magicToken();
    expect(
      (
        await startMagic(
          request("magic/start", {
            email: "person@example.test",
            role: "candidate",
          }),
        )
      ).status,
    ).toBe(429);
    expect(state.fetch).toHaveBeenCalledTimes(3);
  });
  it("fails closed when required production services are missing", async () => {
    vi.stubEnv("DATABASE_URL", "");
    expect(authConfig()).toEqual({ google: false, magic: false });
    expect(
      (
        await startMagic(
          request("magic/start", {
            email: "person@example.test",
            role: "candidate",
          }),
        )
      ).status,
    ).toBe(503);
    expect(
      (await startGoogle(request("google", { role: "candidate" }))).status,
    ).toBe(503);
  });
});

describe("Google OIDC authorization code sign-in", () => {
  it("binds state and PKCE to the browser, verifies Google, and creates a verified account", async () => {
    const flow = await googleFlow();
    const [challenge] = await rows("SELECT * FROM oauth_challenges");
    expect(challenge.state_hash).toBe(
      tokenHash(flow.searchParams.get("state")!),
    );
    expect(challenge.browser_hash).toBe(
      tokenHash(state.cookies.get("fs_google_flow")!),
    );
    expect(flow.searchParams.get("code_challenge")).toBe(
      createHash("sha256")
        .update(String(challenge.code_verifier))
        .digest("base64url"),
    );
    expect(flow.searchParams.get("scope")).toBe("openid email profile");
    expect(flow.searchParams.get("redirect_uri")).toBe(
      `${origin}/api/auth/google/callback`,
    );
    state.idToken = signedToken({ nonce: flow.searchParams.get("nonce") });
    const response = await callbackGoogle(callbackRequest(flow));
    expect(response.headers.get("location")).toBe(`${origin}/workspace`);
    expect(state.exchange?.get("code_verifier")).toBe(challenge.code_verifier);
    expect(await rows("SELECT role,email_verified FROM users")).toEqual([
      { role: "candidate", email_verified: true },
    ]);
    expect(await rows("SELECT provider,subject FROM auth_identities")).toEqual([
      { provider: "google", subject: "google-permanent-subject" },
    ]);
    expect(await rows("SELECT * FROM oauth_challenges")).toHaveLength(0);
    expect(state.cookies.has("fs_google_flow")).toBe(false);
    expect(state.cookies.has("fs_session")).toBe(true);
    expect(
      (await callbackGoogle(callbackRequest(flow))).headers.get("location"),
    ).toContain("authError=google_expired");
  });
  it("does not elevate an existing verified Gmail account's role", async () => {
    await rows(
      "INSERT INTO users(id,name,email,password_hash,role,email_verified) VALUES($1,'Original','person@gmail.com','unused','candidate',true)",
      [existing],
    );
    const flow = await googleFlow("employer");
    state.idToken = signedToken({ nonce: flow.searchParams.get("nonce") });
    expect(
      (await callbackGoogle(callbackRequest(flow))).headers.get("location"),
    ).toBe(`${origin}/workspace`);
    expect(await rows("SELECT id,role FROM users")).toEqual([
      { id: existing, role: "candidate" },
    ]);
  });
  it("refuses to link third-party email using a stale Google email claim", async () => {
    await rows(
      "INSERT INTO users(name,email,password_hash,role,email_verified) VALUES('Original','person@example.test','unused','candidate',true)",
    );
    const flow = await googleFlow();
    state.idToken = signedToken({
      nonce: flow.searchParams.get("nonce"),
      email: "person@example.test",
    });
    expect(
      (await callbackGoogle(callbackRequest(flow))).headers.get("location"),
    ).toContain("authError=email_link_required");
    expect(state.cookies.has("fs_session")).toBe(false);
    expect(await rows("SELECT * FROM auth_identities")).toHaveLength(0);
  });
  it("accepts a managed Workspace email after signed domain and email verification", async () => {
    const flow = await googleFlow("employer");
    state.idToken = signedToken({
      nonce: flow.searchParams.get("nonce"),
      email: "person@company.example",
      hd: "company.example",
    });
    expect(
      (await callbackGoogle(callbackRequest(flow))).headers.get("location"),
    ).toBe(`${origin}/workspace`);
    expect(await rows("SELECT role FROM users")).toEqual([
      { role: "employer" },
    ]);
  });
  it("requires the initiating browser and a non-expired state before token exchange", async () => {
    const flow = await googleFlow();
    state.cookies.set("fs_google_flow", "b".repeat(64));
    const response = await callbackGoogle(callbackRequest(flow));
    expect(response.headers.get("location")).toContain(
      "authError=google_expired",
    );
    expect(state.exchange).toBeNull();
    expect(state.cookies.has("fs_session")).toBe(false);
  });
  it("rejects an expired OAuth challenge before contacting the token endpoint", async () => {
    const flow = await googleFlow();
    await rows(
      "UPDATE oauth_challenges SET expires_at=now()-interval '1 minute'",
    );
    expect(
      (await callbackGoogle(callbackRequest(flow))).headers.get("location"),
    ).toContain("authError=google_expired");
    expect(state.exchange).toBeNull();
    expect(state.cookies.has("fs_session")).toBe(false);
  });
  it("uses the permanent Google subject when that identity's email changes", async () => {
    const first = await googleFlow();
    state.idToken = signedToken({ nonce: first.searchParams.get("nonce") });
    expect(
      (await callbackGoogle(callbackRequest(first))).headers.get("location"),
    ).toBe(`${origin}/workspace`);
    const [original] = await rows("SELECT id FROM users");
    state.cookies.delete("fs_session");
    const next = await googleFlow("employer");
    state.idToken = signedToken({
      nonce: next.searchParams.get("nonce"),
      email: "renamed@gmail.com",
    });
    expect(
      (await callbackGoogle(callbackRequest(next))).headers.get("location"),
    ).toBe(`${origin}/workspace`);
    expect(await rows("SELECT id,email,role FROM users")).toEqual([
      { id: original.id, email: "person@gmail.com", role: "candidate" },
    ]);
  });
  it("handles a failed token exchange without a session or replayable challenge", async () => {
    const flow = await googleFlow();
    state.providerAccepted = false;
    expect(
      (await callbackGoogle(callbackRequest(flow))).headers.get("location"),
    ).toContain("authError=google_unavailable");
    expect(await rows("SELECT * FROM oauth_challenges")).toHaveLength(0);
    expect(await rows("SELECT * FROM sessions")).toHaveLength(0);
  });
  it("handles consent denial without a session or exposed provider detail", async () => {
    const flow = await googleFlow();
    const response = await callbackGoogle(
      callbackRequest(flow, "error=access_denied&error_description=secret"),
    );
    expect(response.headers.get("location")).toBe(
      `${origin}/account?authError=google_cancelled`,
    );
    expect(state.exchange).toBeNull();
    expect(await rows("SELECT * FROM oauth_challenges")).toHaveLength(0);
  });
  it("rejects a cross-origin Google flow start", async () => {
    expect(
      (
        await startGoogle(
          request(
            "google",
            { role: "employer" },
            "https://attacker.example.test",
          ),
        )
      ).status,
    ).toBe(403);
    expect(await rows("SELECT * FROM oauth_challenges")).toHaveLength(0);
  });
});

describe("Google token verification", () => {
  it.each([
    ["audience", { aud: "attacker.apps.googleusercontent.com" }],
    ["issuer", { iss: "https://attacker.example.test" }],
    ["expiry", { exp: Math.floor(Date.now() / 1000) - 60 }],
    ["future issue", { iat: Math.floor(Date.now() / 1000) + 300 }],
    ["email verification", { email_verified: false }],
    ["nonce", { nonce: "different-browser-nonce" }],
    ["authorized party", { azp: "attacker.apps.googleusercontent.com" }],
    [
      "multiple audiences without authorized party",
      { aud: [clientId, "second-app"] },
    ],
  ])("rejects an invalid %s claim", async (_label, overrides) => {
    await expect(
      verifyGoogleToken(signedToken(overrides), "expected-nonce"),
    ).rejects.toMatchObject({ status: 401 });
  });
  it("rejects an invalid signature, unsupported algorithm, and unknown key", async () => {
    const token = signedToken();
    const parts = token.split(".");
    parts[2] = Buffer.alloc(256).toString("base64url");
    await expect(
      verifyGoogleToken(parts.join("."), "expected-nonce"),
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      verifyGoogleToken(signedToken({}, { alg: "none" }), "expected-nonce"),
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      verifyGoogleToken(
        signedToken({}, { kid: "unknown-key" }),
        "expected-nonce",
      ),
    ).rejects.toMatchObject({ status: 401 });
  });
});

// PGlite runs transactions on one connection. These tests use separate real
// PostgreSQL connections so they can detect a missing transaction lock.
const raceDatabaseUrl =
  process.env.AUTH_TEST_DATABASE_URL ||
  (process.env.CI === "true"
    ? "postgresql://fairstage:test-password@127.0.0.1:5432/fairstage"
    : "");
describe.skipIf(!raceDatabaseUrl)("PostgreSQL email-ownership races", () => {
  let pool: Pool | undefined;
  const schema = `auth_ownership_test_${randomBytes(8).toString("hex")}`;
  const email = "race@example.test";

  beforeAll(async () => {
    const url = new URL(raceDatabaseUrl);
    if (
      !["postgres:", "postgresql:"].includes(url.protocol) ||
      !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
      url.pathname !== "/fairstage" ||
      url.search !== "" ||
      url.hash !== ""
    )
      throw new Error(
        "Auth race tests require the loopback fairstage test database.",
      );
    pool = new Pool({
      connectionString: raceDatabaseUrl,
      options: `-csearch_path=${schema},public`,
      max: 3,
      connectionTimeoutMillis: 5000,
    });
    await pool.query(`CREATE SCHEMA "${schema}" AUTHORIZATION CURRENT_USER`);
    for (const file of [
      "001_initial.sql",
      "002_auth.sql",
      "003_workspace.sql",
      "004_razorpay.sql",
    ])
      await pool.query(
        await readFile(new URL(`../db/${file}`, import.meta.url), "utf8"),
      );
  });

  beforeEach(async () => {
    await pool!.query(`TRUNCATE "${schema}".users RESTART IDENTITY CASCADE`);
  });

  afterAll(async () => {
    if (!pool) return;
    try {
      if (!/^auth_ownership_test_[a-f0-9]{16}$/.test(schema))
        throw new Error("Unexpected auth test schema.");
      const {
        rows: [owner],
      } = await pool.query<{ owned: boolean }>(
        "SELECT nspowner=(SELECT oid FROM pg_roles WHERE rolname=current_user) AS owned FROM pg_namespace WHERE nspname=$1",
        [schema],
      );
      if (owner) {
        if (!owner.owned)
          throw new Error("Auth test schema belongs to a different role.");
        await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
      }
    } finally {
      await pool.end();
    }
  });

  async function waitForEmailLock(client: PoolClient) {
    const {
      rows: [connection],
    } = await client.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
    return connection.pid;
  }

  async function expectBlockedOnEmailLock(pid: number) {
    for (let attempt = 0; attempt < 100; attempt++) {
      const {
        rows: [activity],
      } = await pool!.query<{ wait_event: string | null }>(
        "SELECT wait_event FROM pg_stat_activity WHERE pid=$1 AND wait_event_type='Lock'",
        [pid],
      );
      if (activity?.wait_event === "advisory") return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error(
      "Concurrent email ownership did not wait for its advisory lock.",
    );
  }

  it.each(["existing account", "new registration"])(
    "revokes a password session created before the first verified claim: %s",
    async (scenario) => {
      const passwordClient = await pool!.connect();
      const ownerClient = await pool!.connect();
      let pendingClaim: Promise<string> | undefined;
      try {
        const hash = await hashPassword(attackerPassword);
        if (scenario === "existing account")
          await pool!.query(
            "INSERT INTO users(id,name,email,password_hash,role) VALUES($1,'Pre-registrant',$2,$3,'candidate')",
            [existing, email, hash],
          );
        const ownerPid = await waitForEmailLock(ownerClient);
        await passwordClient.query("BEGIN");
        await lockEmailIdentity(passwordClient, "  RACE@EXAMPLE.TEST  ");
        if (scenario === "existing account") {
          const {
            rows: [user],
          } = await passwordClient.query<{ password_hash: string }>(
            "SELECT password_hash FROM users WHERE email=$1 FOR UPDATE",
            [email],
          );
          expect(
            await verifyPassword(attackerPassword, user.password_hash),
          ).toBe(true);
        }
        pendingClaim = (async () => {
          await ownerClient.query("BEGIN");
          const id = await claimVerifiedAccount(ownerClient, {
            email,
            name: "Email Owner",
            role: "employer",
          });
          await ownerClient.query("COMMIT");
          return id;
        })();
        await expectBlockedOnEmailLock(ownerPid);
        if (scenario === "new registration")
          await passwordClient.query(
            "INSERT INTO users(id,name,email,password_hash,role) VALUES($1,'Pre-registrant',$2,$3,'candidate')",
            [existing, email, hash],
          );
        await createSession(existing, passwordClient);
        await passwordClient.query("COMMIT");
        expect(await pendingClaim).toBe(existing);
        const {
          rows: [claimed],
        } = await pool!.query<{ password_hash: string; role: string }>(
          "SELECT password_hash,role FROM users WHERE id=$1",
          [existing],
        );
        expect(
          await verifyPassword(attackerPassword, claimed.password_hash),
        ).toBe(false);
        expect(claimed.role).toBe("employer");
        expect(
          (
            await pool!.query("SELECT * FROM sessions WHERE user_id=$1", [
              existing,
            ])
          ).rows,
        ).toHaveLength(0);
      } finally {
        await passwordClient.query("ROLLBACK");
        if (pendingClaim) await pendingClaim.catch(() => undefined);
        await ownerClient.query("ROLLBACK");
        passwordClient.release();
        ownerClient.release();
      }
    },
  );

  it("makes a waiting password login read the revoked password after a first claim", async () => {
    const ownerClient = await pool!.connect();
    const passwordClient = await pool!.connect();
    let pendingLogin: Promise<boolean> | undefined;
    try {
      await pool!.query(
        "INSERT INTO users(id,name,email,password_hash,role) VALUES($1,'Pre-registrant',$2,$3,'candidate')",
        [existing, email, await hashPassword(attackerPassword)],
      );
      const passwordPid = await waitForEmailLock(passwordClient);
      await ownerClient.query("BEGIN");
      await claimVerifiedAccount(ownerClient, {
        email,
        name: "Email Owner",
        role: "employer",
      });
      await createSession(existing, ownerClient);
      pendingLogin = (async () => {
        await passwordClient.query("BEGIN");
        await lockEmailIdentity(passwordClient, email);
        const {
          rows: [user],
        } = await passwordClient.query<{ password_hash: string }>(
          "SELECT password_hash FROM users WHERE email=$1 FOR UPDATE",
          [email],
        );
        const valid = await verifyPassword(
          attackerPassword,
          user.password_hash,
        );
        if (valid) await createSession(existing, passwordClient);
        await passwordClient.query("COMMIT");
        return valid;
      })();
      await expectBlockedOnEmailLock(passwordPid);
      await ownerClient.query("COMMIT");
      expect(await pendingLogin).toBe(false);
      expect(
        (
          await pool!.query("SELECT * FROM sessions WHERE user_id=$1", [
            existing,
          ])
        ).rows,
      ).toHaveLength(1);
    } finally {
      await ownerClient.query("ROLLBACK");
      if (pendingLogin) await pendingLogin.catch(() => undefined);
      await passwordClient.query("ROLLBACK");
      ownerClient.release();
      passwordClient.release();
    }
  });
});
