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
  locked: true,
  fail: false,
  transactions: 0,
}));
vi.mock("../lib/db", () => ({
  query: async (sql: string, values: unknown[] = []) =>
    (await state.db!.query(sql, values)).rows,
  transaction: async (
    fn: (db: {
      query: (sql: string, values?: unknown[]) => Promise<unknown>;
    }) => Promise<unknown>,
  ) => {
    state.transactions++;
    return state.db!.transaction(async (tx) =>
      fn({
        query: async (sql, values = []) => {
          if (sql.includes("pg_try_advisory_xact_lock"))
            return { rows: [{ locked: state.locked }] };
          if (state.fail && sql.startsWith("DELETE FROM auth_tokens"))
            throw new Error("Private database detail");
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
import { cleanExpiredAuth, maintenanceBatchSize } from "../lib/maintenance";
import { GET } from "../app/api/internal/maintenance/route";
const secret = "a".repeat(64);
const request = (authorization?: string) =>
  new Request("https://fairstage.test/api/internal/maintenance", {
    headers: authorization ? { authorization } : {},
  });
async function rows(sql: string) {
  return (await state.db!.query(sql)).rows;
}

beforeAll(async () => {
  state.db = new PGlite();
  for (const name of (await readdir("db"))
    .filter((n) => n.endsWith(".sql"))
    .sort())
    await state.db.exec(await readFile(`db/${name}`, "utf8"));
});
beforeEach(async () => {
  vi.stubEnv("CRON_SECRET", secret);
  vi.stubEnv("DATABASE_URL", "postgresql://test.invalid/test");
  state.locked = true;
  state.fail = false;
  state.transactions = 0;
  await state.db!.exec(
    "TRUNCATE users CASCADE; TRUNCATE oauth_challenges,magic_links,rate_limits,operation_runs,webhook_events,audit_events CASCADE",
  );
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await state.db?.close();
});

describe("scheduled maintenance", () => {
  it.each([
    undefined,
    "",
    `bearer ${secret}`,
    `Bearer ${"b".repeat(64)}`,
    `Bearer ${secret} extra`,
  ])(
    "rejects an invalid authorization before database access: %s",
    async (header) => {
      const response = await GET(request(header));
      expect(response.status).toBe(401);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(state.transactions).toBe(0);
    },
  );
  it.each(["", "short", " ".repeat(64), "x".repeat(257)])(
    "fails closed with an invalid configured secret",
    async (value) => {
      vi.stubEnv("CRON_SECRET", value);
      expect((await GET(request(`Bearer ${value}`))).status).toBe(401);
      expect(state.transactions).toBe(0);
    },
  );
  it("reports an absent database after authorization", async () => {
    vi.stubEnv("DATABASE_URL", "");
    expect((await GET(request(`Bearer ${secret}`))).status).toBe(503);
    expect(state.transactions).toBe(0);
  });
  it("removes expired temporary records after a one-day grace period and preserves permanent history", async () => {
    await state.db!.exec(`
      INSERT INTO users(id,name,email,password_hash,role) VALUES('00000000-0000-4000-8000-000000000001','Test','test@example.test','unused','candidate');
      INSERT INTO sessions SELECT n,'00000000-0000-4000-8000-000000000001',now()+d::interval FROM (VALUES('old','-2 days'),('grace','-1 hour'),('active','1 day')) AS t(n,d);
      INSERT INTO auth_tokens SELECT n,'00000000-0000-4000-8000-000000000001','verify',now()+d::interval FROM (VALUES('old','-2 days'),('grace','-1 hour'),('active','1 day')) AS t(n,d);
      INSERT INTO oauth_challenges SELECT n,'browser','nonce','verifier','candidate',now()+d::interval FROM (VALUES('old','-2 days'),('grace','-1 hour'),('active','1 day')) AS t(n,d);
      INSERT INTO magic_links SELECT n,'browser','test@example.test','Test','candidate',now()+d::interval FROM (VALUES('old','-2 days'),('grace','-1 hour'),('active','1 day')) AS t(n,d);
      INSERT INTO rate_limits SELECT n,1,now()+d::interval FROM (VALUES('old','-2 days'),('grace','-1 hour'),('active','1 day')) AS t(n,d);
      INSERT INTO audit_events(action) VALUES('retained_history');
      INSERT INTO webhook_events(id,type) VALUES('provider_event','retained');
    `);
    const response = await GET(request(`Bearer ${secret}`));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "completed",
      counts: {
        sessions: 1,
        auth_tokens: 1,
        oauth_challenges: 1,
        magic_links: 1,
        rate_limits: 1,
      },
    });
    for (const table of [
      "sessions",
      "auth_tokens",
      "oauth_challenges",
      "magic_links",
      "rate_limits",
    ])
      expect(await rows(`SELECT count(*)::int AS count FROM ${table}`)).toEqual(
        [{ count: 2 }],
      );
    expect(await rows("SELECT count(*)::int AS count FROM users")).toEqual([
      { count: 1 },
    ]);
    expect(await rows("SELECT action FROM audit_events")).toEqual([
      { action: "retained_history" },
    ]);
    expect(await rows("SELECT id FROM webhook_events")).toEqual([
      { id: "provider_event" },
    ]);
    const retry = await cleanExpiredAuth();
    expect(Object.values(retry.counts)).toEqual([0, 0, 0, 0, 0]);
    expect(
      await rows(
        "SELECT count(*)::int AS count FROM operation_runs WHERE status='completed'",
      ),
    ).toEqual([{ count: 2 }]);
  });
  it("caps a run at 1000 rows per table and allows a later batch", async () => {
    await state.db!.exec(
      `INSERT INTO rate_limits SELECT 'key-'||n,1,now()-interval '2 days' FROM generate_series(1,1005) AS n`,
    );
    expect((await cleanExpiredAuth()).counts.rate_limits).toBe(
      maintenanceBatchSize,
    );
    expect((await cleanExpiredAuth()).counts.rate_limits).toBe(5);
  });
  it("skips an overlapping run without deleting or recording a successful run", async () => {
    state.locked = false;
    await state.db!.exec(
      "INSERT INTO rate_limits VALUES('old',1,now()-interval '2 days')",
    );
    expect(await cleanExpiredAuth()).toEqual({ status: "skipped", counts: {} });
    expect(
      await rows("SELECT count(*)::int AS count FROM rate_limits"),
    ).toEqual([{ count: 1 }]);
    expect(
      await rows("SELECT count(*)::int AS count FROM operation_runs"),
    ).toEqual([{ count: 0 }]);
  });
  it("rolls back partial cleanup and records failure without private details", async () => {
    await state.db!.exec(
      `INSERT INTO users(id,name,email,password_hash,role) VALUES('00000000-0000-4000-8000-000000000001','Test','test@example.test','unused','candidate'); INSERT INTO sessions VALUES('old','00000000-0000-4000-8000-000000000001',now()-interval '2 days')`,
    );
    state.fail = true;
    await expect(cleanExpiredAuth()).rejects.toThrow(
      "The maintenance job failed.",
    );
    expect(await rows("SELECT count(*)::int AS count FROM sessions")).toEqual([
      { count: 1 },
    ]);
    expect(await rows("SELECT status,counts FROM operation_runs")).toEqual([
      { status: "failed", counts: {} },
    ]);
  });
});
