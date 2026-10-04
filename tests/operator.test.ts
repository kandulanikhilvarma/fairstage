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
import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import type { User } from "../lib/domain";

const state = vi.hoisted(() => ({
  db: null as PGlite | null,
  pool: null as Pool | null,
  cookies: new Map<string, string>(),
  beforeTransaction: null as (() => Promise<void>) | null,
}));
vi.mock("../lib/db", () => ({
  query: async (sql: string, values: unknown[] = []) =>
    state.pool
      ? (await state.pool.query(sql, values)).rows
      : (await state.db!.query(sql, values)).rows,
  transaction: async (
    fn: (db: {
      query: (sql: string, values?: unknown[]) => Promise<unknown>;
    }) => Promise<unknown>,
  ) => {
    await state.beforeTransaction?.();
    if (state.pool) {
      const client = await state.pool.connect();
      try {
        await client.query("BEGIN");
        const result = await fn(client);
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    }
    return state.db!.transaction(async (tx) =>
      fn({
        query: async (sql, values = []) => {
          const result = await tx.query(sql, values);
          return {
            ...result,
            rowCount: result.affectedRows ?? result.rows.length,
          };
        },
      }),
    );
  },
}));
vi.mock("next/headers", () => ({
  cookies: async () => {
    const store = state.cookies;
    return {
      get: (key: string) =>
        store.has(key) ? { value: store.get(key) } : undefined,
      set: (key: string, value: string) => store.set(key, value),
      delete: (key: string) => store.delete(key),
    };
  },
}));

import { GET, POST } from "../app/api/operator/[...path]/route";
import { isOperator, reviewOperatorCase } from "../lib/operator";
import { createSession } from "../lib/security";

const origin = "https://fairstage.example.test";
const operator = "00000000-0000-4000-8000-000000000081";
const employer = "00000000-0000-4000-8000-000000000082";
const candidate = "00000000-0000-4000-8000-000000000083";
const participantRound = "00000000-0000-4000-8000-000000000084";
const providerRound = "00000000-0000-4000-8000-000000000085";
const dispute = "00000000-0000-4000-8000-000000000086";
const repair = "00000000-0000-4000-8000-000000000087";
const originalAudit = "00000000-0000-4000-8000-000000000088";
const review = {
  note: "The participant evidence needs a provider review.",
  status: "waiting_provider",
  decision: "provider_review",
  expectedVersion: 0,
};

async function sql(query: string, values: unknown[] = []) {
  return (await state.db!.query(query, values)).rows as Record<
    string,
    unknown
  >[];
}

async function request(path: string, body?: unknown) {
  return rawRequest(
    path,
    body === undefined ? "GET" : "POST",
    body === undefined ? undefined : JSON.stringify(body),
  );
}

async function rawRequest(
  path: string,
  method: "GET" | "POST",
  body?: string,
  headers: Record<string, string> = {},
) {
  const [route, search] = path.split("?");
  const req = new Request(
    `${origin}/api/operator/${route}${search ? `?${search}` : ""}`,
    {
      method,
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        ...headers,
      },
      body,
    },
  );
  return (method === "GET" ? GET : POST)(req, {
    params: Promise.resolve({ path: route.split("/") }),
  });
}

async function signIn(id = operator) {
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
  state.pool = null;
  vi.unstubAllEnvs();
  vi.stubEnv("DATABASE_URL", "postgresql://configured-for-tests");
  vi.stubEnv("APP_URL", origin);
  vi.stubEnv("OPERATOR_EMAILS", "operator@example.test");
  state.cookies.clear();
  state.beforeTransaction = null;
  await state.db!.exec(
    "TRUNCATE users,rate_limits,webhook_events,razorpay_events,operation_runs RESTART IDENTITY CASCADE",
  );
  for (const [id, role, email, name] of [
    [operator, "employer", "operator@example.test", "Operator A"],
    [employer, "employer", "employer@example.test", "Employer A"],
    [candidate, "candidate", "candidate@example.test", "Candidate A"],
  ])
    await sql(
      "INSERT INTO users(id,name,email,password_hash,role,email_verified) VALUES($1,$2,$3,'sensitive-password-hash',$4,true)",
      [id, name, email, role],
    );
  for (const [id, title] of [
    [participantRound, "Interview with a participant dispute"],
    [providerRound, "Interview with a provider issue"],
  ])
    await sql(
      `INSERT INTO rounds(id,employer_id,candidate_id,title,kind,minutes,amount_cents,fee_cents,
        scheduled_at,meeting_url,terms,currency,payment_provider,status,charge_id,transfer_id,private_notes)
       VALUES($1,$2,$3,$4,'Skills interview',60,45000,3600,'2030-10-09T12:00:00Z',
        'https://example.test/interview','Clear interview terms.','INR','razorpay','disputed',$5,$6,$7)`,
      [
        id,
        employer,
        candidate,
        title,
        `charge-${id}`,
        `transfer-${id}`,
        JSON.stringify({ [employer]: "Private employer note" }),
      ],
    );
  await sql(
    "INSERT INTO disputes(id,round_id,opened_by,reason) VALUES($1,$2,$3,'The agreed interview scope changed.')",
    [dispute, participantRound, candidate],
  );
  await sql(
    "INSERT INTO audit_events(id,actor_id,action,resource_id) VALUES($1,$2,'razorpay_transfer_failed',$3),($4,$2,'round_offered',$5)",
    [repair, employer, providerRound, originalAudit, participantRound],
  );
  await sql(
    "INSERT INTO ledger(round_id,type,amount_cents,provider_ref) VALUES($1,'funded',48600,'payment-immutable'),($1,'disputed',45000,'dispute-immutable')",
    [participantRound],
  );
});

describe("operator access", () => {
  it.each(["", "broken-address", "operator@example.test,broken-address"])(
    "denies all access with an empty or invalid allowlist: %s",
    async (allowlist) => {
      vi.stubEnv("OPERATOR_EMAILS", allowlist);
      await signIn();
      for (const path of [
        "session",
        "health",
        "cases",
        `cases/dispute/${dispute}`,
      ])
        expect((await request(path)).status).toBe(403);
    },
  );

  it("uses verified email and ignores a client operator flag", () => {
    const user = {
      id: operator,
      name: "Operator A",
      email: "OPERATOR@EXAMPLE.TEST",
      role: "candidate",
      company: "",
      bio: "",
      country: "IN",
      verified: true,
    } satisfies User;
    vi.stubEnv(
      "OPERATOR_EMAILS",
      "  Operator@Example.Test  \nsecond@example.test",
    );
    expect(isOperator(user)).toBe(true);
    expect(isOperator({ ...user, verified: false, operator: true })).toBe(
      false,
    );
    expect(
      isOperator({ ...user, email: "candidate@example.test", operator: true }),
    ).toBe(false);
  });

  it("denies a missing session and an expired session", async () => {
    expect((await request("cases")).status).toBe(401);
    await signIn();
    await sql("UPDATE sessions SET expires_at=now()-interval '1 second'");
    expect((await request("cases")).status).toBe(401);
  });

  it.each([employer, candidate])(
    "denies participant account %s",
    async (id) => {
      await signIn(id);
      expect((await request("health")).status).toBe(403);
      expect((await request("cases")).status).toBe(403);
      expect((await request(`cases/dispute/${dispute}`, review)).status).toBe(
        403,
      );
      expect(await sql("SELECT id FROM operator_cases")).toHaveLength(0);
    },
  );

  it("denies an unverified allowlisted account", async () => {
    await sql("UPDATE users SET email_verified=false WHERE id=$1", [operator]);
    await signIn();
    expect((await request("session")).status).toBe(403);
  });

  it("keeps missing database access unavailable", async () => {
    vi.stubEnv("DATABASE_URL", "");
    expect((await request("health")).status).toBe(503);
  });

  it("returns only operator identity and private no-store responses", async () => {
    await signIn();
    const response = await request("session");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({
      operator: {
        id: operator,
        name: "Operator A",
        email: "operator@example.test",
      },
      financialActionsEnabled: false,
    });
  });
});

describe("operator queue and detail", () => {
  it("collects participant disputes and original repair signals with minimal data", async () => {
    await signIn();
    const response = await request("cases");
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.items).toHaveLength(3);
    expect(
      result.items.map((item: { source: string }) => item.source).sort(),
    ).toEqual([
      "participant_dispute",
      "provider_state_review",
      "razorpay_transfer_failed",
    ]);
    const serialized = JSON.stringify(result);
    for (const privateValue of [
      "sensitive-password-hash",
      "private_notes",
      "Private employer note",
      "charge-",
      "transfer-",
      "The agreed interview scope changed.",
      "candidate@example.test",
      "employer@example.test",
    ])
      expect(serialized).not.toContain(privateValue);
    expect(result.nextCursor).toBeNull();
  });

  it("pages tied timestamps across source kinds without skipped or duplicate cases", async () => {
    await sql("DELETE FROM audit_events WHERE id=$1", [repair]);
    await sql("UPDATE rounds SET status='funded' WHERE id=$1", [providerRound]);
    await sql("UPDATE disputes SET created_at='2030-01-01T00:00:00.123456Z'");
    await sql(
      `INSERT INTO audit_events(id,action,resource_id,created_at)
       SELECT ('00000000-0000-4000-8000-' || lpad(value::text,12,'0'))::uuid,
         'checkout_payment_failed',$1,'2030-01-01T00:00:00.123456Z'
       FROM generate_series(90,210) value`,
      [providerRound],
    );
    await sql(
      "INSERT INTO audit_events(id,action,resource_id,created_at) VALUES($1,'razorpay_payment_review',$2,'2030-01-01T00:00:00.123456Z')",
      [dispute, participantRound],
    );
    await signIn();
    const keys: string[] = [];
    let cursor: string | null = null;
    do {
      const response = await request(
        `cases?limit=17${cursor ? `&cursor=${cursor}` : ""}`,
      );
      expect(response.status).toBe(200);
      const page = await response.json();
      expect(page.items.length).toBeLessThanOrEqual(17);
      keys.push(
        ...page.items.map(
          (item: { kind: string; id: string }) => `${item.kind}:${item.id}`,
        ),
      );
      cursor = page.nextCursor;
      expect(keys.length).toBeLessThanOrEqual(123);
    } while (cursor);
    expect(keys).toHaveLength(123);
    expect(new Set(keys).size).toBe(123);
    expect(keys).toContain(`dispute:${dispute}`);
    expect(keys).toContain(`repair:${dispute}`);
  });

  it.each([
    "limit=0",
    "limit=51",
    "limit=1.5",
    "limit=100",
    "kind=unknown",
    "status=unknown",
    "cursor=invalid",
    "cursor=%2Fbad",
    `cursor=${"a".repeat(601)}`,
    `cursor=${Buffer.from(JSON.stringify({ createdAt: "2030-01-01", kind: "repair", id: repair })).toString("base64url")}`,
  ])("rejects invalid queue input %s", async (query) => {
    await signIn();
    expect((await request(`cases?${query}`)).status).toBe(400);
  });

  it("filters queue metadata and keeps the original case reason in its detail", async () => {
    await signIn();
    expect((await request(`cases/dispute/${dispute}`, review)).status).toBe(
      200,
    );
    const result = await (
      await request("cases?kind=dispute&status=waiting_provider")
    ).json();
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: dispute,
      version: 1,
      status: "waiting_provider",
    });
    const detail = await (await request(`cases/dispute/${dispute}`)).json();
    expect(detail.case.reason).toBe("The agreed interview scope changed.");
    expect(detail.notes).toHaveLength(1);
    expect(detail.notes[0]).toMatchObject({
      actorId: operator,
      actorName: "Operator A",
      note: review.note,
    });
  });

  it("pages tied audit-note timestamps without omissions", async () => {
    await signIn();
    await sql(
      "ALTER TABLE operator_case_events ALTER COLUMN created_at SET DEFAULT '2030-01-01T00:00:00.123456Z'",
    );
    for (let version = 0; version < 4; version++)
      expect(
        (
          await request(`cases/dispute/${dispute}`, {
            ...review,
            expectedVersion: version,
          })
        ).status,
      ).toBe(200);
    await sql(
      "ALTER TABLE operator_case_events ALTER COLUMN created_at SET DEFAULT now()",
    );
    const first = await (
      await request(`cases/dispute/${dispute}?limit=2`)
    ).json();
    const second = await (
      await request(
        `cases/dispute/${dispute}?limit=2&cursor=${first.nextCursor}`,
      )
    ).json();
    expect(first.notes).toHaveLength(2);
    expect(second.notes).toHaveLength(2);
    expect(
      new Set(
        [...first.notes, ...second.notes].map(
          (note: { id: string }) => note.id,
        ),
      ).size,
    ).toBe(4);
    expect(second.nextCursor).toBeNull();
  });

  it.each([
    `cases/dispute/${repair}`,
    `cases/repair/${dispute}`,
    "cases/dispute/not-a-uuid",
    `cases/unknown/${dispute}`,
  ])("rejects missing or invalid case path %s", async (path) => {
    await signIn();
    expect((await request(path)).status).toBe(
      path.endsWith("not-a-uuid") || path.includes("unknown") ? 400 : 404,
    );
  });

  it("reports stored provider events and unresolved counts without a financial action", async () => {
    await sql(
      "INSERT INTO webhook_events(id,type) VALUES('stripe-stored-event','stored.event')",
    );
    await sql(
      "INSERT INTO razorpay_events(id,type) VALUES('razorpay-stored-event','stored.event')",
    );
    await signIn();
    const response = await request("health");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      counts: {
        openDisputes: 1,
        disputedRounds: 2,
        repairSignals: 2,
        unreviewedCases: 3,
        waitingProviderCases: 0,
      },
      providerEvents: {
        stripeLastAt: expect.any(String),
        razorpayLastAt: expect.any(String),
      },
      financialActionsEnabled: false,
    });
  });

  it("reports only the latest cleanup metadata", async () => {
    await sql(
      `INSERT INTO operation_runs(job,status,counts,started_at,finished_at) VALUES
        ('expired_auth_cleanup','completed','{"sessions":2}',now()-interval '2 days',now()-interval '2 days'),
        ('expired_auth_cleanup','failed','{}',now()-interval '1 day',now()-interval '1 day'),
        ('another_job','completed','{"other":9}',now(),now())`,
    );
    await signIn();
    const response = await request("health");
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.maintenance).toEqual({
      status: "failed",
      counts: {},
      startedAt: expect.any(String),
      finishedAt: expect.any(String),
    });
  });
});

describe("operator review safety", () => {
  it("writes review metadata and append-only audit without changing payment or dispute state", async () => {
    const before = {
      rounds: await sql("SELECT * FROM rounds ORDER BY id"),
      disputes: await sql("SELECT * FROM disputes ORDER BY id"),
      ledger: await sql("SELECT * FROM ledger ORDER BY id"),
      originalAudit: await sql("SELECT * FROM audit_events ORDER BY id"),
    };
    await signIn();
    const response = await request(`cases/dispute/${dispute}`, {
      ...review,
      status: "closed",
      decision: "no_action",
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      case: {
        id: dispute,
        status: "closed",
        decision: "no_action",
        version: 1,
      },
    });
    expect(await sql("SELECT * FROM rounds ORDER BY id")).toEqual(
      before.rounds,
    );
    expect(await sql("SELECT * FROM disputes ORDER BY id")).toEqual(
      before.disputes,
    );
    expect(await sql("SELECT * FROM ledger ORDER BY id")).toEqual(
      before.ledger,
    );
    for (const event of before.originalAudit)
      expect(
        await sql("SELECT * FROM audit_events WHERE id=$1", [event.id]),
      ).toEqual([event]);
    expect(
      await sql(
        "SELECT actor_id,action FROM audit_events WHERE action='operator_case_review'",
      ),
    ).toEqual([{ actor_id: operator, action: "operator_case_review" }]);
    expect(
      await sql("SELECT version,status,note FROM operator_case_events"),
    ).toEqual([{ version: 1, status: "closed", note: review.note }]);
    await expect(
      sql("UPDATE operator_case_events SET note='An altered review note.'"),
    ).rejects.toThrow("append-only");
    await expect(sql("DELETE FROM operator_case_events")).rejects.toThrow(
      "append-only",
    );
  });

  it("rejects stale versions without a second event and retains the accepted review", async () => {
    await signIn();
    expect((await request(`cases/dispute/${dispute}`, review)).status).toBe(
      200,
    );
    expect(
      (
        await request(`cases/dispute/${dispute}`, {
          ...review,
          note: "This stale note must not replace the accepted review.",
        })
      ).status,
    ).toBe(409);
    expect(await sql("SELECT version,status FROM operator_cases")).toEqual([
      { version: 1, status: "waiting_provider" },
    ]);
    expect(await sql("SELECT note FROM operator_case_events")).toEqual([
      { note: review.note },
    ]);
    expect(
      await sql(
        "SELECT id FROM audit_events WHERE action='operator_case_review'",
      ),
    ).toHaveLength(1);
  });

  it.each([
    [
      "expired session",
      "UPDATE sessions SET expires_at=now()-interval '1 second'",
      401,
    ],
    ["removed session", "DELETE FROM sessions", 401],
    [
      "revoked verification",
      "UPDATE users SET email_verified=false WHERE id=$1",
      403,
    ],
    [
      "changed email",
      "UPDATE users SET email='revoked@example.test' WHERE id=$1",
      403,
    ],
  ] as const)(
    "rechecks %s inside the transaction",
    async (_scenario, change, status) => {
      await signIn();
      state.beforeTransaction = async () => {
        await sql(change, change.includes("$1") ? [operator] : []);
      };
      expect((await request(`cases/dispute/${dispute}`, review)).status).toBe(
        status,
      );
      expect(await sql("SELECT id FROM operator_cases")).toHaveLength(0);
      expect(await sql("SELECT id FROM operator_case_events")).toHaveLength(0);
    },
  );

  it.each([
    { ...review, note: "short" },
    { ...review, note: "a".repeat(3001) },
    { ...review, status: "closed", decision: "provider_review" },
    { ...review, status: "in_review", decision: "no_action" },
    { ...review, status: "waiting_provider", decision: "pending" },
    { ...review, expectedVersion: -1 },
    { ...review, expectedVersion: 0.5 },
    { ...review, amountCents: 1, roundStatus: "paid" },
  ])("rejects invalid review data without a write: %j", async (input) => {
    await signIn();
    expect((await request(`cases/dispute/${dispute}`, input)).status).toBe(400);
    expect(await sql("SELECT id FROM operator_cases")).toHaveLength(0);
  });

  it("rejects cross-origin writes, oversized JSON and other content types", async () => {
    await signIn();
    const path = `cases/dispute/${dispute}`;
    expect(
      (
        await rawRequest(path, "POST", JSON.stringify(review), {
          Origin: "https://attacker.example.test",
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await rawRequest(path, "POST", JSON.stringify(review), {
          "Content-Type": "text/plain",
        })
      ).status,
    ).toBe(415);
    expect(
      (await rawRequest(path, "POST", `{"note":"${"a".repeat(17000)}"}`))
        .status,
    ).toBe(413);
    expect((await rawRequest(path, "POST", "{broken JSON")).status).toBe(400);
    expect(await sql("SELECT id FROM operator_cases")).toHaveLength(0);
  });

  it("limits operator writes before case changes", async () => {
    await signIn();
    for (let attempt = 0; attempt < 20; attempt++)
      expect(
        (
          await request(`cases/dispute/${dispute}`, {
            ...review,
            note: "short",
          })
        ).status,
      ).toBe(400);
    expect((await request(`cases/dispute/${dispute}`, review)).status).toBe(
      429,
    );
    expect(await sql("SELECT id FROM operator_cases")).toHaveLength(0);
  });
});

// Separate connections prove that the first review also takes a case lock.
const raceDatabaseUrl =
  process.env.AUTH_TEST_DATABASE_URL ||
  (process.env.CI === "true"
    ? "postgresql://fairstage:test-password@127.0.0.1:5432/fairstage"
    : "");
describe.skipIf(!raceDatabaseUrl)("PostgreSQL operator review race", () => {
  let pool: Pool | undefined;
  const schema = `operator_review_test_${randomBytes(8).toString("hex")}`;
  const secondOperator = "00000000-0000-4000-8000-000000000089";

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
        "Operator race tests need the loopback fairstage test database.",
      );
    pool = new Pool({
      connectionString: raceDatabaseUrl,
      options: `-csearch_path=${schema},public`,
      application_name: schema,
      max: 4,
      connectionTimeoutMillis: 5000,
    });
    await pool.query(`CREATE SCHEMA "${schema}" AUTHORIZATION CURRENT_USER`);
    for (const file of (await readdir(new URL("../db/", import.meta.url)))
      .filter((file) => /^\d+.*\.sql$/.test(file))
      .sort())
      await pool.query(
        await readFile(new URL(`../db/${file}`, import.meta.url), "utf8"),
      );
  });

  beforeEach(async () => {
    state.pool = pool!;
    vi.stubEnv(
      "OPERATOR_EMAILS",
      "operator@example.test,operator-b@example.test",
    );
    for (const [id, email] of [
      [operator, "operator@example.test"],
      [secondOperator, "operator-b@example.test"],
      [candidate, "candidate@example.test"],
    ])
      await pool!.query(
        "INSERT INTO users(id,name,email,password_hash,role,email_verified) VALUES($1,'Authorized account',$2,'unused','candidate',true)",
        [id, email],
      );
    await pool!.query(
      `INSERT INTO rounds(id,employer_id,candidate_id,title,kind,minutes,amount_cents,fee_cents,scheduled_at,meeting_url,terms,status)
       VALUES($1,$2,$3,'Concurrent review','Introduction',30,1500,120,now(),'https://example.test','Clear paid scope.','disputed')`,
      [participantRound, operator, candidate],
    );
    await pool!.query(
      "INSERT INTO disputes(id,round_id,opened_by,reason) VALUES($1,$2,$3,'The agreed scope needs review.')",
      [dispute, participantRound, candidate],
    );
  });

  afterAll(async () => {
    state.pool = null;
    if (!pool) return;
    try {
      if (!/^operator_review_test_[a-f0-9]{16}$/.test(schema))
        throw new Error("Unexpected operator test schema.");
      const {
        rows: [owner],
      } = await pool.query<{ owned: boolean }>(
        "SELECT nspowner=(SELECT oid FROM pg_roles WHERE rolname=current_user) AS owned FROM pg_namespace WHERE nspname=$1",
        [schema],
      );
      if (owner) {
        if (!owner.owned)
          throw new Error("Operator test schema belongs to another role.");
        await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
      }
    } finally {
      await pool.end();
    }
  });

  it("serializes first reviews from two operators and rejects the stale version", async () => {
    state.cookies = new Map();
    await createSession(operator);
    const firstCookieStore = new Map(state.cookies);
    state.cookies = new Map();
    await createSession(secondOperator);
    const secondCookieStore = new Map(state.cookies);
    const lockClient = await pool!.connect();
    const outcomes: Promise<number>[] = [];
    try {
      await lockClient.query("BEGIN");
      await lockClient.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        [`operator:dispute:${dispute}`],
      );
      for (const [id, email, store] of [
        [operator, "operator@example.test", firstCookieStore],
        [secondOperator, "operator-b@example.test", secondCookieStore],
      ] as const) {
        state.cookies = store;
        const user: User = {
          id,
          email,
          name: "Authorized account",
          role: "candidate",
          company: "",
          bio: "",
          country: "IN",
          verified: true,
        };
        outcomes.push(
          reviewOperatorCase(user, "dispute", dispute, review)
            .then(() => 200)
            .catch((error: { status?: number }) => error.status ?? 500),
        );
      }
      let blocked = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        const {
          rows: [activity],
        } = await pool!.query<{ blocked: number }>(
          `SELECT count(*)::int AS blocked FROM pg_stat_activity
           WHERE datname=current_database() AND application_name=$1 AND wait_event_type='Lock'
             AND wait_event='advisory' AND query='SELECT pg_advisory_xact_lock(hashtextextended($1,0))'`,
          [schema],
        );
        if (activity.blocked === 2) {
          blocked = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(blocked).toBe(true);
      await lockClient.query("COMMIT");
      expect((await Promise.all(outcomes)).sort()).toEqual([200, 409]);
      expect(
        (await pool!.query("SELECT version FROM operator_cases")).rows,
      ).toEqual([{ version: 1 }]);
      expect(
        (await pool!.query("SELECT note,version FROM operator_case_events"))
          .rows,
      ).toEqual([{ note: review.note, version: 1 }]);
      expect(
        (
          await pool!.query(
            "SELECT id FROM audit_events WHERE action='operator_case_review'",
          )
        ).rows,
      ).toHaveLength(1);
      expect(
        (
          await pool!.query("SELECT status FROM rounds WHERE id=$1", [
            participantRound,
          ])
        ).rows,
      ).toEqual([{ status: "disputed" }]);
      expect(
        (
          await pool!.query("SELECT status FROM disputes WHERE id=$1", [
            dispute,
          ])
        ).rows,
      ).toEqual([{ status: "open" }]);
    } finally {
      await lockClient.query("ROLLBACK");
      await Promise.all(outcomes);
      lockClient.release();
    }
  });
});
