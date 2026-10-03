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
import { readFile, readdir } from "node:fs/promises";
const state = vi.hoisted(() => ({
  db: null as PGlite | null,
  cookies: new Map<string, string>(),
  stripeCheckout: vi.fn(),
  stripeRelease: vi.fn(),
  razorpayOrder: vi.fn(),
  razorpayRelease: vi.fn(),
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
          const result = await tx.query(sql, values);
          return {
            ...result,
            rowCount: result.affectedRows ?? result.rows.length,
          };
        },
      }),
    ),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (key: string) =>
      state.cookies.has(key) ? { value: state.cookies.get(key) } : undefined,
    set: (key: string, value: string) => state.cookies.set(key, value),
    delete: (key: string) => state.cookies.delete(key),
  }),
}));
vi.mock("../lib/payments", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/payments")>()),
  checkout: state.stripeCheckout,
  releaseRound: state.stripeRelease,
  connectAccount: vi.fn(),
  stripe: vi.fn(),
}));
vi.mock("../lib/razorpay", () => ({
  createRazorpayOrder: state.razorpayOrder,
  releaseRazorpayRound: state.razorpayRelease,
  verifyRazorpayPayment: vi.fn(),
  razorpayReadiness: () => ({ configured: false, route: false }),
}));
import { GET, POST } from "../app/api/[...path]/route";
import { createSession, hashPassword, tokenHash } from "../lib/security";
const origin = "https://fairstage.example.test";
const employer = "00000000-0000-4000-8000-000000000021";
const candidate = "00000000-0000-4000-8000-000000000022";
const otherEmployer = "00000000-0000-4000-8000-000000000023";
const otherCandidate = "00000000-0000-4000-8000-000000000024";
const job = "00000000-0000-4000-8000-000000000025";
const otherJob = "00000000-0000-4000-8000-000000000026";
const application = "00000000-0000-4000-8000-000000000027";
const otherApplication = "00000000-0000-4000-8000-000000000028";
const round = "00000000-0000-4000-8000-000000000029";
const otherRound = "00000000-0000-4000-8000-000000000030";
const profile = {
  name: "Asha Candidate",
  company: "",
  bio: "I build accessible products.",
  country: "IN",
  headline: "Frontend engineer",
  skills: ["TypeScript", "Accessibility"],
  portfolioUrl: "https://example.test/portfolio",
  resumeUrl: "https://example.test/resume.pdf",
  timezone: "Asia/Kolkata",
};
const jobInput = {
  title: "Product designer",
  location: "Remote",
  category: "Design",
  description: "Design clear interfaces for a small product team.",
  salaryMin: 1000000,
  salaryMax: 1500000,
  stages: 3,
  currency: "INR",
};
function roundInput(currency: "INR" | "USD") {
  return {
    candidateEmail: "candidate@example.test",
    title: "Product designer",
    kind: "Skills interview",
    minutes: 60,
    amountCents: currency === "INR" ? 45000 : 4500,
    scheduledAt: new Date(Date.now() + 3600000).toISOString(),
    meetingUrl: "https://example.test/interview",
    terms: "A sixty minute interview with a clear paid scope.",
    currency,
  };
}
async function sql(query: string, values: unknown[] = []) {
  return (await state.db!.query(query, values)).rows as Record<
    string,
    unknown
  >[];
}
async function request(path: string, body?: unknown) {
  const method = body === undefined ? "GET" : "POST";
  return rawRequest(
    path,
    method,
    body === undefined ? undefined : JSON.stringify(body),
  );
}
async function rawRequest(
  path: string,
  method: "GET" | "POST",
  body?: string | Uint8Array,
  headers: Record<string, string> = {},
) {
  const req = new Request(`${origin}/api/${path}`, {
    method,
    headers: { Origin: origin, "Content-Type": "application/json", ...headers },
    body: body as BodyInit | undefined,
  });
  return (method === "GET" ? GET : POST)(req, {
    params: Promise.resolve({ path: path.split("/") }),
  });
}
async function signIn(id: string) {
  state.cookies.clear();
  await createSession(id);
}
beforeAll(async () => {
  state.db = new PGlite();
  for (const file of (await readdir(new URL("../db/", import.meta.url)))
    .filter((file) => /^\d+.*\.sql$/.test(file))
    .sort())
    await state.db.exec(
      await readFile(new URL(`../db/${file}`, import.meta.url), "utf8"),
    );
});
afterAll(async () => {
  await state.db?.close();
  vi.unstubAllEnvs();
});
beforeEach(async () => {
  vi.unstubAllEnvs();
  vi.stubEnv("DATABASE_URL", "postgresql://configured-for-tests");
  vi.stubEnv("APP_URL", origin);
  state.cookies.clear();
  state.stripeCheckout
    .mockReset()
    .mockResolvedValue({ url: "https://checkout.stripe.com/example" });
  state.stripeRelease
    .mockReset()
    .mockResolvedValue({ message: "Stripe transfer accepted." });
  state.razorpayOrder.mockReset().mockResolvedValue({
    checkout: {
      key: "public-key",
      orderId: "order_test",
      amount: 48600,
      currency: "INR",
      name: "Fairstage",
      description: "Interview",
    },
  });
  state.razorpayRelease
    .mockReset()
    .mockResolvedValue({ message: "Razorpay transfer accepted." });
  await state.db!.exec("TRUNCATE users,rate_limits RESTART IDENTITY CASCADE");
  for (const [id, role, email, name] of [
    [employer, "employer", "employer@example.test", "Employer A"],
    [candidate, "candidate", "candidate@example.test", "Candidate A"],
    [otherEmployer, "employer", "other-employer@example.test", "Employer B"],
    [
      otherCandidate,
      "candidate",
      "other-candidate@example.test",
      "Candidate B",
    ],
  ])
    await sql(
      "INSERT INTO users(id,name,email,password_hash,role,company,email_verified) VALUES($1,$2,$3,'sensitive-password-hash',$4,$5,true)",
      [id, name, email, role, role === "employer" ? name : ""],
    );
  for (const [id, owner, title] of [
    [job, employer, "Authorized role"],
    [otherJob, otherEmployer, "Unrelated secret role"],
  ])
    await sql(
      "INSERT INTO jobs(id,employer_id,title,location,category,description,salary_min,salary_max,stages,currency) VALUES($1,$2,$3,'Remote','Design','A detailed role with clear tasks.',1000000,1500000,3,'INR')",
      [id, owner, title],
    );
  for (const [id, jobId, candidateId, note] of [
    [application, job, candidate, "Authorized candidate application."],
    [
      otherApplication,
      otherJob,
      otherCandidate,
      "Other candidate private application.",
    ],
  ])
    await sql(
      "INSERT INTO applications(id,job_id,candidate_id,note) VALUES($1,$2,$3,$4)",
      [id, jobId, candidateId, note],
    );
  for (const [id, employerId, candidateId, title] of [
    [round, employer, candidate, "Authorized interview"],
    [otherRound, otherEmployer, otherCandidate, "Unrelated private interview"],
  ]) {
    await sql(
      "INSERT INTO rounds(id,employer_id,candidate_id,title,kind,minutes,amount_cents,fee_cents,scheduled_at,meeting_url,terms,currency,payment_provider,private_notes) VALUES($1,$2,$3,$4,'Skills interview',60,45000,3600,'2030-10-09T12:00:00Z','https://example.test/interview','Clear terms for a paid interview.','INR','razorpay',$5)",
      [
        id,
        employerId,
        candidateId,
        title,
        JSON.stringify({
          [employerId]: "Employer private reflection",
          [candidateId]: "Candidate private reflection",
        }),
      ],
    );
    await sql(
      "INSERT INTO ledger(round_id,type,amount_cents,provider_ref) VALUES($1,'funded',48600,$2)",
      [id, `payment-${id}`],
    );
    await sql(
      "INSERT INTO disputes(round_id,opened_by,reason) VALUES($1,$2,'The agreed scope needs review.')",
      [id, candidateId],
    );
  }
});
describe("owner profile and employer verification", () => {
  it("saves only the session owner profile and ignores a client owner identifier", async () => {
    await signIn(candidate);
    expect(
      (
        await request("profile", {
          ...profile,
          id: otherCandidate,
          role: "employer",
          email_verified: true,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await sql("SELECT name,headline,skills,role FROM users WHERE id=$1", [
          candidate,
        ])
      )[0],
    ).toMatchObject({
      name: profile.name,
      headline: profile.headline,
      skills: profile.skills,
      role: "candidate",
    });
    expect(
      (await sql("SELECT name FROM users WHERE id=$1", [otherCandidate]))[0]
        .name,
    ).toBe("Candidate B");
  });
  it.each(["portfolioUrl", "resumeUrl"])(
    "rejects a non-HTTPS %s",
    async (field) => {
      await signIn(candidate);
      expect(
        (
          await request("profile", {
            ...profile,
            [field]: "http://example.test/file",
          })
        ).status,
      ).toBe(400);
    },
  );
  it("rejects an invalid time zone without a profile write", async () => {
    await signIn(candidate);
    expect(
      (await request("profile", { ...profile, timezone: "Mars/Olympus" }))
        .status,
    ).toBe(400);
    expect(
      (await sql("SELECT headline FROM users WHERE id=$1", [candidate]))[0]
        .headline,
    ).toBe("");
  });
  it("rejects an unverified employer role publication", async () => {
    await sql("UPDATE users SET email_verified=false WHERE id=$1", [employer]);
    await signIn(employer);
    expect((await request("jobs", jobInput)).status).toBe(403);
    expect(await sql("SELECT id FROM jobs")).toHaveLength(2);
  });
  it("rejects an unverified employer interview offer", async () => {
    await sql("UPDATE users SET email_verified=false WHERE id=$1", [employer]);
    await signIn(employer);
    expect((await request("rounds", roundInput("INR"))).status).toBe(403);
    expect(await sql("SELECT id FROM rounds")).toHaveLength(2);
  });
  it("persists a verified employer job and its currency", async () => {
    await signIn(employer);
    const response = await request("jobs", jobInput);
    expect(response.status).toBe(201);
    const { id } = await response.json();
    expect(
      (await sql("SELECT employer_id,currency FROM jobs WHERE id=$1", [id]))[0],
    ).toMatchObject({ employer_id: employer, currency: "INR" });
  });
});
describe("round currency dispatch and tenant ownership", () => {
  it.each([
    ["INR", "razorpay"],
    ["USD", "stripe"],
  ] as const)(
    "stores %s rounds with %s payment dispatch",
    async (currency, provider) => {
      await signIn(employer);
      const created = await request("rounds", roundInput(currency));
      expect(created.status).toBe(201);
      const { id } = await created.json();
      expect(
        (
          await sql(
            "SELECT currency,payment_provider FROM rounds WHERE id=$1",
            [id],
          )
        )[0],
      ).toMatchObject({ currency, payment_provider: provider });
      expect((await request(`rounds/${id}/fund`, {})).status).toBe(200);
      expect(
        provider === "razorpay" ? state.razorpayOrder : state.stripeCheckout,
      ).toHaveBeenCalledOnce();
      expect(
        provider === "razorpay" ? state.stripeCheckout : state.razorpayOrder,
      ).not.toHaveBeenCalled();
    },
  );
  it.each([
    ["INR", "razorpay"],
    ["USD", "stripe"],
  ] as const)(
    "dispatches an owned %s release to %s",
    async (currency, provider) => {
      await sql(
        "UPDATE rounds SET currency=$1,payment_provider=$2 WHERE id=$3",
        [currency, provider, round],
      );
      await signIn(candidate);
      expect((await request(`rounds/${round}/release`, {})).status).toBe(200);
      expect(
        provider === "razorpay" ? state.razorpayRelease : state.stripeRelease,
      ).toHaveBeenCalledOnce();
    },
  );
  it.each(["fund", "release"])(
    "rejects another employer %s before a provider call",
    async (action) => {
      await signIn(otherEmployer);
      expect((await request(`rounds/${round}/${action}`, {})).status).toBe(404);
      expect(state.stripeCheckout).not.toHaveBeenCalled();
      expect(state.stripeRelease).not.toHaveBeenCalled();
      expect(state.razorpayOrder).not.toHaveBeenCalled();
      expect(state.razorpayRelease).not.toHaveBeenCalled();
    },
  );
});
describe("application decisions and candidate withdrawal", () => {
  it.each(["reviewing", "interviewing", "offered", "hired", "rejected"])(
    "persists an owner employer %s decision",
    async (status) => {
      await signIn(employer);
      expect(
        (await request(`applications/${application}/status`, { status }))
          .status,
      ).toBe(200);
      expect(
        (
          await sql("SELECT status FROM applications WHERE id=$1", [
            application,
          ])
        )[0].status,
      ).toBe(status);
    },
  );
  it("rejects an unrelated employer decision", async () => {
    await signIn(otherEmployer);
    expect(
      (await request(`applications/${application}/status`, { status: "hired" }))
        .status,
    ).toBe(404);
  });
  it("lets a candidate withdraw their application and blocks employer reactivation", async () => {
    await signIn(candidate);
    expect(
      (
        await request(`applications/${application}/status`, {
          status: "withdrawn",
        })
      ).status,
    ).toBe(200);
    await signIn(employer);
    expect(
      (
        await request(`applications/${application}/status`, {
          status: "reviewing",
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await sql("SELECT status FROM applications WHERE id=$1", [application])
      )[0].status,
    ).toBe("withdrawn");
  });
  it("rejects candidate decisions for other people and employer withdrawal", async () => {
    await signIn(otherCandidate);
    expect(
      (
        await request(`applications/${application}/status`, {
          status: "withdrawn",
        })
      ).status,
    ).toBe(404);
    await signIn(candidate);
    expect(
      (await request(`applications/${application}/status`, { status: "hired" }))
        .status,
    ).toBe(403);
    await signIn(employer);
    expect(
      (
        await request(`applications/${application}/status`, {
          status: "withdrawn",
        })
      ).status,
    ).toBe(403);
  });
  it("does not let a candidate withdraw a hired application", async () => {
    await sql("UPDATE applications SET status='hired' WHERE id=$1", [
      application,
    ]);
    await signIn(candidate);
    expect(
      (
        await request(`applications/${application}/status`, {
          status: "withdrawn",
        })
      ).status,
    ).toBe(404);
  });
});
describe("private notes and account exports", () => {
  it("isolates notes by participant while each owner can replace their note", async () => {
    await signIn(employer);
    expect((await request(`rounds/${round}/notes`)).status).toBe(200);
    expect(await (await request(`rounds/${round}/notes`)).json()).toEqual({
      note: "Employer private reflection",
    });
    expect(
      (
        await request(`rounds/${round}/notes`, {
          note: "Employer revised private note",
        })
      ).status,
    ).toBe(200);
    await signIn(candidate);
    expect(await (await request(`rounds/${round}/notes`)).json()).toEqual({
      note: "Candidate private reflection",
    });
  });
  it("rejects unrelated reads and writes of private notes", async () => {
    await signIn(otherCandidate);
    expect((await request(`rounds/${round}/notes`)).status).toBe(404);
    expect(
      (await request(`rounds/${round}/notes`, { note: "Unrelated write" }))
        .status,
    ).toBe(404);
  });
  it.each([employer, candidate])(
    "exports all authorized records for %s without hashes or another participant note",
    async (id) => {
      await signIn(id);
      const response = await request("account/export");
      expect(response.status).toBe(200);
      const exported = await response.json();
      expect(exported.user.id).toBe(id);
      expect(
        exported.applications.map((item: { id: string }) => item.id),
      ).toEqual([application]);
      expect(exported.rounds.map((item: { id: string }) => item.id)).toEqual([
        round,
      ]);
      expect(exported.jobs).toHaveLength(id === employer ? 1 : 0);
      expect(exported.ledger).toHaveLength(1);
      expect(exported.disputes).toHaveLength(1);
      expect(exported.privateNotes).toEqual([
        {
          roundId: round,
          note:
            id === employer
              ? "Employer private reflection"
              : "Candidate private reflection",
        },
      ]);
      const serialized = JSON.stringify(exported);
      expect(serialized).not.toContain("sensitive-password-hash");
      expect(serialized).not.toContain("password_hash");
      expect(serialized).not.toContain(otherApplication);
      expect(serialized).not.toContain(otherRound);
      expect(serialized).not.toContain("Other candidate private application.");
      expect(serialized).not.toContain(
        id === employer
          ? "Candidate private reflection"
          : "Employer private reflection",
      );
    },
  );
  it("exports records beyond the workspace display cap", async () => {
    await sql(
      "INSERT INTO rounds(employer_id,candidate_id,title,kind,minutes,amount_cents,fee_cents,scheduled_at,meeting_url,terms) SELECT $1,$2,'Older interview','Introduction',30,1500,120,'2030-10-09T12:00:00Z','https://example.test','Clear terms for a paid interview.' FROM generate_series(1,205)",
      [employer, candidate],
    );
    await signIn(candidate);
    const workspace = await (await request("workspace")).json();
    expect(workspace.rounds).toHaveLength(200);
    const exported = await (await request("account/export")).json();
    expect(exported.rounds).toHaveLength(206);
  });
});
describe("calendar authorization and serialization", () => {
  it.each([employer, candidate])(
    "gives each round participant a UTC calendar download",
    async (id) => {
      await signIn(id);
      const response = await request(`rounds/${round}/calendar`);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/calendar");
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      const calendar = await response.text();
      expect(calendar).toContain("DTSTART:20301009T120000Z\r\n");
      expect(calendar).toContain("DTEND:20301009T130000Z\r\n");
      expect(calendar).toContain(`UID:${round}@fairstage`);
    },
  );
  it("rejects an unrelated calendar download", async () => {
    await signIn(otherEmployer);
    expect((await request(`rounds/${round}/calendar`)).status).toBe(404);
  });
  it("escapes event injection and folds Unicode lines without split characters", async () => {
    const injected =
      "Engineering, design; planning\\notes\r\nBEGIN:VEVENT\r\nATTENDEE:intruder@example.test";
    const longTerms =
      "🔵 Design context. ".repeat(80) + "\nEND:VEVENT\nBEGIN:VEVENT";
    await sql("UPDATE rounds SET title=$1,terms=$2 WHERE id=$3", [
      injected,
      longTerms,
      round,
    ]);
    await signIn(candidate);
    const calendar = await (await request(`rounds/${round}/calendar`)).text();
    const unfolded = calendar.replaceAll(/\r\n /g, "");
    expect(calendar.match(/^BEGIN:VEVENT$/gm)).toHaveLength(1);
    expect(calendar.match(/^END:VEVENT$/gm)).toHaveLength(1);
    expect(calendar).not.toContain("\r\nATTENDEE:");
    expect(unfolded).toContain(
      "Engineering\\, design\\; planning\\\\notes\\nBEGIN:VEVENT\\nATTENDEE:intruder@example.test",
    );
    expect(unfolded).toContain(longTerms.replaceAll("\n", "\\n"));
    expect(calendar).not.toContain("�");
    for (const line of calendar.split("\r\n"))
      expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(75);
  });
});
describe("JSON request and service boundaries", () => {
  it("rejects a non-JSON content type", async () => {
    await signIn(candidate);
    expect(
      (
        await rawRequest("profile", "POST", JSON.stringify(profile), {
          "Content-Type": "text/plain",
        })
      ).status,
    ).toBe(415);
  });
  it("rejects a JSON lookalike media type", async () => {
    await signIn(candidate);
    expect(
      (
        await rawRequest("profile", "POST", JSON.stringify(profile), {
          "Content-Type": "application/jsonp",
        })
      ).status,
    ).toBe(415);
  });
  it("accepts case-insensitive JSON with a charset", async () => {
    await signIn(candidate);
    expect(
      (
        await rawRequest("profile", "POST", JSON.stringify(profile), {
          "Content-Type": "Application/JSON; charset=utf-8",
        })
      ).status,
    ).toBe(200);
  });
  it("limits UTF-8 bytes when character length is below the limit", async () => {
    await signIn(candidate);
    const raw = JSON.stringify({ ...profile, bio: "é".repeat(8100) });
    expect(raw.length).toBeLessThan(16000);
    expect(Buffer.byteLength(raw)).toBeGreaterThan(16000);
    expect((await rawRequest("profile", "POST", raw)).status).toBe(413);
  });
  it("enforces actual bytes despite an understated content length", async () => {
    await signIn(candidate);
    expect(
      (
        await rawRequest(
          "profile",
          "POST",
          JSON.stringify({ ...profile, bio: "é".repeat(8100) }),
          { "Content-Length": "2" },
        )
      ).status,
    ).toBe(413);
  });
  it("rejects an oversized declared content length and malformed JSON", async () => {
    await signIn(candidate);
    expect(
      (await rawRequest("profile", "POST", "{}", { "Content-Length": "16001" }))
        .status,
    ).toBe(413);
    expect((await rawRequest("profile", "POST", '{"broken":')).status).toBe(
      400,
    );
  });
  it("rejects malformed UTF-8 rather than silently replacing it", async () => {
    await signIn(candidate);
    expect(
      (
        await rawRequest(
          "profile",
          "POST",
          new Uint8Array([123, 34, 120, 34, 58, 34, 0xff, 34, 125]),
        )
      ).status,
    ).toBe(400);
  });
  it("returns 503 for database-dependent routes without a configured database", async () => {
    vi.stubEnv("DATABASE_URL", "");
    expect((await request("health")).status).toBe(503);
    expect((await request("jobs")).status).toBe(503);
    expect((await request("account/export")).status).toBe(503);
  });
});

describe("connected-account country consistency", () => {
  it("requires support to change a country after a Razorpay account is mapped", async () => {
    await sql(
      "UPDATE users SET razorpay_account_id='acc_mapped',razorpay_ready=false WHERE id=$1",
      [candidate],
    );
    await signIn(candidate);
    expect(
      (await request("profile", { ...profile, country: "US" })).status,
    ).toBe(409);
    expect(
      (await sql("SELECT country FROM users WHERE id=$1", [candidate]))[0]
        .country,
    ).toBe("IN");
  });
});

describe("production configuration boundaries", () => {
  it("permits an HTTP loopback origin for a local production preview", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_URL", "http://127.0.0.1:3000");
    expect((await (await request("config")).json()).accounts).toBe(true);
  });
  it("refuses an HTTP public origin", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_URL", "http://fairstage.example.test");
    expect((await (await request("config")).json()).accounts).toBe(false);
  });
  it("does not advertise a Stripe test key as a production payment method", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("LIVE_PAYMENTS_ENABLED", "true");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_placeholder");
    expect((await (await request("config")).json()).payments).toBe(false);
  });
  it("does not expose service credentials through public configuration", async () => {
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "private-google-placeholder");
    vi.stubEnv("RESEND_API_KEY", "private-email-placeholder");
    const config = await (await request("config")).text();
    expect(config).not.toContain("private-google-placeholder");
    expect(config).not.toContain("private-email-placeholder");
    expect(config).not.toContain("postgresql://configured-for-tests");
  });
});

describe("password account ownership", () => {
  it("requires a fresh password before first email verification", async () => {
    const oldPassword = "Attacker-password-before-claim";
    const freshPassword = "Owner-password-after-claim";
    await sql(
      "UPDATE users SET email_verified=false,password_hash=$1,bio='Untrusted profile',name='Untrusted name' WHERE id=$2",
      [await hashPassword(oldPassword), candidate],
    );
    await signIn(candidate);
    const oldSession = state.cookies.get("fs_session")!;
    const token = "a".repeat(64);
    await sql(
      "INSERT INTO auth_tokens(token_hash,user_id,purpose,expires_at) VALUES($1,$2,'verify',now()+interval '30 minutes')",
      [tokenHash(token), candidate],
    );
    expect(
      (await request("auth/token", { token, purpose: "verify" })).status,
    ).toBe(400);
    expect(
      (
        await request("auth/token", {
          token,
          purpose: "verify",
          password: freshPassword,
          name: "Proven owner",
          role: "employer",
        })
      ).status,
    ).toBe(200);
    state.cookies.set("fs_session", oldSession);
    expect((await request("workspace")).status).toBe(401);
    expect((await request("profile", profile)).status).toBe(401);
    expect(
      (
        await request("auth/login", {
          email: "candidate@example.test",
          password: oldPassword,
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await request("auth/login", {
          email: "candidate@example.test",
          password: freshPassword,
        })
      ).status,
    ).toBe(200);
    const user = (await (await request("workspace")).json()).user;
    expect(user).toMatchObject({
      verified: true,
      name: "Proven owner",
      role: "employer",
      bio: "",
    });
  });
  it("reclaims an unverified registration through a fresh reset password", async () => {
    const token = "b".repeat(64);
    await sql("UPDATE users SET email_verified=false WHERE id=$1", [candidate]);
    await signIn(candidate);
    const oldSession = state.cookies.get("fs_session")!;
    await sql(
      "INSERT INTO auth_tokens(token_hash,user_id,purpose,expires_at) VALUES($1,$2,'reset',now()+interval '30 minutes')",
      [tokenHash(token), candidate],
    );
    expect(
      (
        await request("auth/token", {
          token,
          purpose: "reset",
          password: "Owner-new-reset-password",
          role: "candidate",
          name: "Proven owner",
        })
      ).status,
    ).toBe(200);
    state.cookies.set("fs_session", oldSession);
    expect((await request("workspace")).status).toBe(401);
    expect(
      (
        await request("auth/login", {
          email: "candidate@example.test",
          password: "Owner-new-reset-password",
        })
      ).status,
    ).toBe(200);
    expect((await (await request("workspace")).json()).user.verified).toBe(
      true,
    );
  });
  it("blocks unverified business writes while allowing profile setup", async () => {
    await sql("UPDATE users SET email_verified=false WHERE id=$1", [candidate]);
    await signIn(candidate);
    expect(
      (
        await request(`jobs/${job}/apply`, {
          note: "A complete application note for this role.",
        })
      ).status,
    ).toBe(403);
    expect((await request(`rounds/${round}/accept`, {})).status).toBe(403);
    expect((await request("profile", profile)).status).toBe(200);
  });
});
