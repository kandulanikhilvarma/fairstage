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
import type { Workspace, WorkspaceCollection } from "../lib/domain";

const state = vi.hoisted(() => ({
  db: null as PGlite | null,
  cookies: new Map<string, string>(),
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
import { GET } from "../app/api/[...path]/route";
import { createSession } from "../lib/security";
const origin = "https://fairstage.example.test";
const employer = "00000000-0000-4000-8000-000000000901";
const candidate = "00000000-0000-4000-8000-000000000902";
const otherEmployer = "00000000-0000-4000-8000-000000000903";
const otherCandidate = "00000000-0000-4000-8000-000000000904";
const collections: WorkspaceCollection[] = [
  "rounds",
  "jobs",
  "applications",
  "ledger",
  "disputes",
];
const rowId = (prefix: string, n: number) =>
  `${prefix}-0000-4000-8000-${String(n).padStart(12, "0")}`;
async function sql(query: string, values: unknown[] = []) {
  return (await state.db!.query(query, values)).rows as Record<
    string,
    unknown
  >[];
}
async function request(path: string) {
  const url = new URL(`/api/${path}`, origin);
  return GET(new Request(url), {
    params: Promise.resolve({ path: url.pathname.slice(5).split("/") }),
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
  vi.stubEnv("NODE_ENV", "test");
  state.cookies.clear();
  await state.db!.exec("TRUNCATE users,rate_limits RESTART IDENTITY CASCADE");
  for (const [id, role, email] of [
    [employer, "employer", "team@example.test"],
    [candidate, "candidate", "candidate@example.test"],
    [otherEmployer, "employer", "foreign-team@example.test"],
    [otherCandidate, "candidate", "foreign-candidate@example.test"],
  ])
    await sql(
      "INSERT INTO users(id,name,email,password_hash,role,company,email_verified) VALUES($1,'Test Person',$2,'unused',$3,$4,true)",
      [id, email, role, id === employer ? "Owned Team" : "Other Team"],
    );
  await sql(
    `INSERT INTO rounds(id,employer_id,candidate_id,title,kind,minutes,amount_cents,fee_cents,scheduled_at,meeting_url,terms,status,currency,created_at) SELECT ('11111111-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,$1,$2,'Owned role '||n,'Introduction',30,1000+n,80,now(),'https://example.test/meeting','Clear interview terms.',CASE WHEN n%3=0 THEN 'paid' WHEN n%3=1 THEN 'funded' ELSE 'accepted' END,CASE WHEN n%2=0 THEN 'INR' ELSE 'USD' END,'2030-01-01T00:00:00.000001Z' FROM generate_series(1,221) AS n`,
    [employer, candidate],
  );
  await sql(
    `INSERT INTO jobs(id,employer_id,title,location,category,description,salary_min,salary_max,stages,created_at) SELECT ('22222222-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,$1,'Owned role '||n,'Remote',CASE WHEN n%2=0 THEN 'Engineering' ELSE 'Design' END,'A role with clear tasks and paid rounds.',10000,20000,3,'2030-01-01T00:00:00.000001Z' FROM generate_series(1,221) AS n`,
    [employer],
  );
  await sql(
    `INSERT INTO applications(id,job_id,candidate_id,note,status,created_at) SELECT ('33333333-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,('22222222-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,$1,'Relevant TypeScript experience '||n,CASE WHEN n%2=0 THEN 'reviewing' ELSE 'applied' END,'2030-01-01T00:00:00.000001Z' FROM generate_series(1,221) AS n`,
    [candidate],
  );
  await sql(
    `INSERT INTO ledger(id,round_id,type,amount_cents,provider_ref,created_at) SELECT ('44444444-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,('11111111-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'funded',1000+n,'owned-reference-'||n,'2030-01-01T00:00:00.000001Z' FROM generate_series(1,221) AS n`,
  );
  await sql(
    `INSERT INTO disputes(id,round_id,opened_by,reason,status,created_at) SELECT ('55555555-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,('11111111-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,$1,'Please review this round '||n,CASE WHEN n%2=0 THEN 'open' ELSE 'resolved' END,'2030-01-01T00:00:00.000001Z' FROM generate_series(1,221) AS n`,
    [candidate],
  );
  await sql(
    "INSERT INTO rounds(employer_id,candidate_id,title,kind,minutes,amount_cents,fee_cents,scheduled_at,meeting_url,terms,status) VALUES($1,$2,'Foreign private role','Introduction',30,1000000,80,now(),'https://example.test','Foreign terms.','paid')",
    [otherEmployer, otherCandidate],
  );
  await sql(
    "INSERT INTO jobs(employer_id,title,location,category,description,salary_min,salary_max,stages,status) VALUES($1,'Closed foreign role','Remote','Design','A closed role with clear tasks.',10000,20000,3,'closed')",
    [otherEmployer],
  );
  await signIn(employer);
});

describe("workspace pagination and full history", () => {
  it("bounds initial pages while totals include all owned history and separate currencies", async () => {
    const response = await request("workspace?pageSize=50");
    expect(response.status).toBe(200);
    const w = (await response.json()) as Workspace;
    for (const collection of collections) {
      expect(w[collection]).toHaveLength(50);
      expect(w.pages?.[collection].total).toBe(221);
      expect(w.summary?.counts[collection]).toBe(221);
    }
    expect(w.summary?.openJobs).toBe(221);
    expect(w.summary?.openDisputes).toBe(110);
    expect(w.summary?.roundStates.paid).toBe(73);
    expect(w.summary?.activeRounds).toBe(148);
    const expected = await sql(
      `SELECT currency,sum(amount_cents) FILTER(WHERE status='paid')::float8 AS "paidCents",sum(amount_cents) FILTER(WHERE status IN ('funded','completed'))::float8 AS "fundedCents" FROM rounds WHERE employer_id=$1 GROUP BY currency ORDER BY currency`,
      [employer],
    );
    expect(w.summary?.currencies).toEqual(expected);
    expect(w.user.operator).toBe(false);
    expect(JSON.stringify(w)).not.toContain("Foreign private");
    await sql("UPDATE rounds SET status='disputed' WHERE id=$1", [
      rowId("11111111", 1),
    ]);
    const disputed = await (await request("workspace?pageSize=1")).json();
    expect(disputed.summary.roundStates.disputed).toBe(1);
    expect(disputed.summary.activeRounds).toBe(148);
  });
  it.each(collections)(
    "walks all 221 same-time %s records with no gaps or duplicate IDs",
    async (collection) => {
      let cursor: string | null = null;
      const ids: string[] = [];
      const sizes: number[] = [];
      do {
        const params = new URLSearchParams({ pageSize: "50" });
        if (cursor) params.set("cursor", cursor);
        const response = await request(`workspace/${collection}?${params}`);
        expect(response.status).toBe(200);
        const result = await response.json();
        expect(result.page.total).toBe(221);
        sizes.push(result.items.length);
        ids.push(...result.items.map((item: { id: string }) => item.id));
        expect(JSON.stringify(result)).not.toContain("__cursorTimestamp");
        cursor = result.page.nextCursor;
      } while (cursor);
      expect(sizes).toEqual([50, 50, 50, 50, 21]);
      expect(new Set(ids).size).toBe(221);
      expect(ids).toEqual([...ids].sort().reverse());
    },
  );
  it("keeps microsecond precision across page boundaries", async () => {
    await sql(
      "UPDATE rounds SET created_at='2030-01-01T00:00:00Z'::timestamptz+(right(id::text,12)::int*interval '1 microsecond') WHERE employer_id=$1",
      [employer],
    );
    const first = await (await request("workspace/rounds?pageSize=100")).json();
    const second = await (
      await request(
        `workspace/rounds?pageSize=100&cursor=${first.page.nextCursor}`,
      )
    ).json();
    const third = await (
      await request(
        `workspace/rounds?pageSize=100&cursor=${second.page.nextCursor}`,
      )
    ).json();
    expect(
      [...first.items, ...second.items, ...third.items].map((item) => item.id),
    ).toEqual(
      Array.from({ length: 221 }, (_, i) => rowId("11111111", 221 - i)),
    );
  });
  it("preserves legacy display caps and unrestricted complete exports", async () => {
    const legacy = await (await request("workspace")).json();
    expect(legacy.rounds).toHaveLength(200);
    expect(legacy.jobs).toHaveLength(100);
    expect(legacy.ledger).toHaveLength(200);
    const exported = await (await request("account/export")).json();
    for (const collection of collections)
      expect(exported[collection]).toHaveLength(221);
    const csv = await (await request("ledger/export")).text();
    expect(csv.trim().split("\r\n")).toHaveLength(222);
    expect(csv).not.toContain("owned-reference");
  });
  it("searches the full application history with bound parameters", async () => {
    const result = await (
      await request(
        "workspace/applications?pageSize=1&q=TypeScript&status=reviewing",
      )
    ).json();
    expect(result.items).toHaveLength(1);
    expect(result.page.total).toBe(110);
    expect(result.items[0].id).toBe(rowId("33333333", 220));
    const literal = await (
      await request(
        `workspace/applications?q=${encodeURIComponent("' OR 1=1 --")}`,
      )
    ).json();
    expect(literal.items).toEqual([]);
    expect(literal.page.total).toBe(0);
  });
  it("rejects a cursor from another tenant, collection, or filter", async () => {
    const first = await (await request("workspace/rounds?pageSize=1")).json();
    expect(
      (await request(`workspace/ledger?cursor=${first.page.nextCursor}`))
        .status,
    ).toBe(400);
    expect(
      (
        await request(
          `workspace/rounds?status=paid&cursor=${first.page.nextCursor}`,
        )
      ).status,
    ).toBe(400);
    await signIn(otherEmployer);
    expect(
      (await request(`workspace/rounds?cursor=${first.page.nextCursor}`))
        .status,
    ).toBe(400);
    const foreign = await (await request("workspace?pageSize=50")).json();
    expect(foreign.rounds).toHaveLength(1);
    expect(foreign.summary.counts.rounds).toBe(1);
    expect(foreign.ledger).toEqual([]);
    await signIn(candidate);
    const candidateWorkspace = await (
      await request("workspace?pageSize=50")
    ).json();
    expect(candidateWorkspace.summary.counts.rounds).toBe(221);
    expect(candidateWorkspace.summary.counts.applications).toBe(221);
    expect(candidateWorkspace.jobs).toEqual([]);
  });
  it.each(["2030-02-31T00:00:00.000001Z", "0000-01-01T00:00:00.000001Z"])(
    "rejects an impossible cursor timestamp %s before PostgreSQL sees it",
    async (at) => {
      const first = await (await request("workspace/rounds?pageSize=1")).json();
      const decoded = JSON.parse(
        Buffer.from(first.page.nextCursor, "base64url").toString("utf8"),
      );
      const cursor = Buffer.from(JSON.stringify({ ...decoded, at })).toString(
        "base64url",
      );
      expect((await request(`workspace/rounds?cursor=${cursor}`)).status).toBe(
        400,
      );
    },
  );
  it.each([
    "pageSize=0",
    "pageSize=101",
    "pageSize=1.5",
    "pageSize=5&pageSize=6",
    "cursor=invalid",
    "cursor=%",
    "status=deleted",
    "q=" + "x".repeat(201),
  ])("rejects invalid parameters: %s", async (params) =>
    expect((await request(`workspace/rounds?${params}`)).status).toBe(400),
  );
  it("rejects unknown collections and unauthenticated reads", async () => {
    expect((await request("workspace/passwords")).status).toBe(404);
    expect((await request("workspace?cursor=invalid")).status).toBe(400);
    state.cookies.clear();
    expect((await request("workspace/ledger?pageSize=50")).status).toBe(401);
  });
  it("exposes only the verified operator capability", async () => {
    vi.stubEnv("OPERATOR_EMAILS", "team@example.test");
    expect(
      (await (await request("workspace?pageSize=1")).json()).user.operator,
    ).toBe(true);
    await sql("UPDATE users SET email_verified=false WHERE id=$1", [employer]);
    expect(
      (await (await request("workspace?pageSize=1")).json()).user.operator,
    ).toBe(false);
    expect(
      JSON.stringify(await (await request("config")).json()),
    ).not.toContain("team@example.test");
  });
});

describe("public job pagination", () => {
  it("searches all open roles and never returns employer identity IDs", async () => {
    state.cookies.clear();
    const result = await (
      await request("jobs?pageSize=1&q=Owned%20Team&category=Engineering")
    ).json();
    expect(result.jobs).toHaveLength(1);
    expect(result.page.total).toBe(110);
    expect(result.jobs[0].id).toBe(rowId("22222222", 220));
    expect(result.jobs[0]).not.toHaveProperty("employerId");
    expect(result.jobs[0]).not.toHaveProperty("applied");
    const next = await (
      await request(
        `jobs?pageSize=1&q=Owned%20Team&category=Engineering&cursor=${result.page.nextCursor}`,
      )
    ).json();
    expect(next.jobs[0].id).toBe(rowId("22222222", 218));
    expect(
      (await request(`jobs?cursor=${result.page.nextCursor}`)).status,
    ).toBe(400);
    expect((await request("jobs?category=Finance")).status).toBe(400);
  });
  it("shows application state even when the application is outside the workspace page", async () => {
    await signIn(candidate);
    const result = await (
      await request("jobs?q=Owned%20role%2090&pageSize=100")
    ).json();
    expect(
      result.jobs.find(
        (job: { id: string }) => job.id === rowId("22222222", 90),
      ).applied,
    ).toBe(true);
    await signIn(otherCandidate);
    const other = await (
      await request("jobs?q=Owned%20role%2090&pageSize=100")
    ).json();
    expect(other.jobs.every((job: { applied: boolean }) => !job.applied)).toBe(
      true,
    );
  });
});
