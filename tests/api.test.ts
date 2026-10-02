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
import type Stripe from "stripe";

const state = vi.hoisted(() => ({
  db: null as PGlite | null,
  cookies: new Map<string, string>(),
  transfers: vi.fn(),
  retrieveIntent: vi.fn(),
}));
vi.mock("../lib/db", () => ({
  isDemo: () => process.env.DEMO_MODE !== "false",
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
    set: (key: string, value: string) => state.cookies.set(key, value),
    delete: (key: string) => state.cookies.delete(key),
  }),
}));
vi.mock("stripe", () => ({
  default: class {
    transfers = { create: state.transfers, createReversal: vi.fn() };
    paymentIntents = { retrieve: state.retrieveIntent };
  },
}));
import { GET, POST } from "../app/api/[...path]/route";
import { processWebhook, releaseRound } from "../lib/payments";

const employer = "00000000-0000-4000-8000-000000000001";
const candidate = "00000000-0000-4000-8000-000000000002";
const other = "00000000-0000-4000-8000-000000000003";
const round = "00000000-0000-4000-8000-000000000004";
const origin = "http://localhost:3000";
async function req(path: string, body?: unknown, requestOrigin = origin) {
  const method = body === undefined ? "GET" : "POST";
  const request = new Request(`${origin}/api/${path}`, {
    method,
    headers: { origin: requestOrigin, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return (method === "GET" ? GET : POST)(request, {
    params: Promise.resolve({ path: path.split("/") }),
  });
}
async function signIn(id: string) {
  const { createSession } = await import("../lib/security");
  await createSession(id);
}
async function rows(sql: string, values: unknown[] = []) {
  return (await state.db!.query(sql, values)).rows as Record<string, unknown>[];
}
beforeAll(async () => {
  state.db = new PGlite();
  await state.db.exec(
    await readFile(new URL("../db/001_initial.sql", import.meta.url), "utf8"),
  );
});
afterAll(async () => {
  await state.db?.close();
  vi.unstubAllEnvs();
});
beforeEach(async () => {
  vi.stubEnv("DEMO_MODE", "false");
  vi.stubEnv("APP_URL", origin);
  vi.stubEnv("LIVE_PAYMENTS_ENABLED", "true");
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_fake");
  state.cookies.clear();
  state.transfers.mockReset().mockResolvedValue({ id: "tr_test" });
  state.retrieveIntent.mockReset().mockResolvedValue({
    id: "pi_test",
    status: "succeeded",
    latest_charge: "ch_test",
  });
  await state.db!.exec(
    "TRUNCATE users,rate_limits,webhook_events RESTART IDENTITY CASCADE",
  );
  for (const [id, role, email] of [
    [employer, "employer", "employer@example.test"],
    [candidate, "candidate", "candidate@example.test"],
    [other, "employer", "other@example.test"],
  ])
    await rows(
      "INSERT INTO users(id,name,email,password_hash,role,company,email_verified,connect_id,connect_ready) VALUES($1,'Test Person',$2,'unused',$3,'Test Company',true,$4,true)",
      [id, email, role, role === "candidate" ? "acct_test" : null],
    );
  await rows(
    "INSERT INTO rounds(id,employer_id,candidate_id,title,kind,minutes,amount_cents,fee_cents,scheduled_at,meeting_url,terms,status,charge_id,checkout_id) VALUES($1,$2,$3,'Designer','Skills interview',60,4500,360,now()-interval '1 day','https://example.test','Clear terms for a paid round.','funded','ch_test','cs_test')",
    [round, employer, candidate],
  );
});

describe("live API permissions and money persistence", () => {
  it("rejects an unauthenticated workspace request", async () =>
    expect((await req("workspace")).status).toBe(401));
  it("rejects a cross-origin write", async () => {
    await signIn(employer);
    expect((await req("profile", {}, "https://evil.example.test")).status).toBe(
      403,
    );
  });
  it("rejects a different employer's round action", async () => {
    await signIn(other);
    expect((await req(`rounds/${round}/complete`, {})).status).toBe(404);
  });
  it("does not expose another employer's rounds", async () => {
    await signIn(other);
    const response = await req("workspace");
    expect((await response.json()).rounds).toHaveLength(0);
  });
  it("requires the candidate to accept", async () => {
    await rows("UPDATE rounds SET status='offered' WHERE id=$1", [round]);
    await signIn(employer);
    expect((await req(`rounds/${round}/accept`, {})).status).toBe(409);
    await signIn(candidate);
    expect((await req(`rounds/${round}/accept`, {})).status).toBe(200);
  });
  it("persists both confirmations before a single transfer", async () => {
    await signIn(employer);
    expect((await req(`rounds/${round}/complete`, {})).status).toBe(200);
    expect(
      (await rows("SELECT status FROM rounds WHERE id=$1", [round]))[0].status,
    ).toBe("funded");
    await signIn(candidate);
    expect((await req(`rounds/${round}/complete`, {})).status).toBe(200);
    expect((await req(`rounds/${round}/release`, {})).status).toBe(200);
    expect((await req(`rounds/${round}/release`, {})).status).toBe(200);
    expect(state.transfers).toHaveBeenCalledTimes(1);
    expect((await rows("SELECT * FROM ledger WHERE type='paid'")).length).toBe(
      1,
    );
    expect(state.transfers.mock.calls[0][0].amount).toBe(4500);
  });
  it("rolls back release when Stripe fails", async () => {
    await rows(
      "UPDATE rounds SET status='completed',employer_confirmed=true,candidate_confirmed=true WHERE id=$1",
      [round],
    );
    state.transfers.mockRejectedValue(new Error("Provider unavailable"));
    const u = {
      id: employer,
      name: "Test",
      email: "employer@example.test",
      role: "employer" as const,
      company: "Test",
      country: "US",
      bio: "",
      verified: true,
    };
    await expect(releaseRound(u, round)).rejects.toThrow();
    expect(
      (await rows("SELECT status FROM rounds WHERE id=$1", [round]))[0].status,
    ).toBe("completed");
    expect(await rows("SELECT * FROM ledger")).toHaveLength(0);
  });
  it("blocks completion before the scheduled end", async () => {
    await rows(
      "UPDATE rounds SET scheduled_at=now()+interval '1 day' WHERE id=$1",
      [round],
    );
    await signIn(candidate);
    expect((await req(`rounds/${round}/complete`, {})).status).toBe(409);
  });
  it("persists a dispute and blocks release", async () => {
    await signIn(candidate);
    expect(
      (
        await req(`rounds/${round}/dispute`, {
          reason: "The employer did not follow the agreed scope.",
        })
      ).status,
    ).toBe(200);
    expect((await req(`rounds/${round}/release`, {})).status).toBe(409);
    expect(await rows("SELECT * FROM disputes")).toHaveLength(1);
  });
  it("does not cancel a funded round", async () => {
    await signIn(employer);
    expect((await req(`rounds/${round}/cancel`, {})).status).toBe(409);
  });
  it("deduplicates a paid checkout webhook", async () => {
    await rows(
      "UPDATE rounds SET status='accepted',charge_id=NULL WHERE id=$1",
      [round],
    );
    const event = {
      id: "evt_checkout",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test",
          metadata: { roundId: round },
          payment_intent: "pi_test",
          payment_status: "paid",
          currency: "usd",
          amount_total: 4860,
        },
      },
    } as unknown as Stripe.Event;
    await processWebhook(event);
    await processWebhook(event);
    expect(await rows("SELECT * FROM ledger WHERE type='funded'")).toHaveLength(
      1,
    );
    expect(
      (await rows("SELECT status FROM rounds WHERE id=$1", [round]))[0].status,
    ).toBe("funded");
  });
  it("rolls back an event with an unexpected charge amount", async () => {
    await rows(
      "UPDATE rounds SET status='accepted',charge_id=NULL WHERE id=$1",
      [round],
    );
    const event = {
      id: "evt_wrong",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test",
          metadata: { roundId: round },
          payment_intent: "pi_test",
          payment_status: "paid",
          currency: "usd",
          amount_total: 1,
        },
      },
    } as unknown as Stripe.Event;
    await expect(processWebhook(event)).rejects.toThrow();
    expect(await rows("SELECT * FROM webhook_events")).toHaveLength(0);
  });
  it("keeps replayed refund amounts incremental", async () => {
    for (const [id, amount] of [
      ["evt_refund_1", 2000],
      ["evt_refund_2", 4860],
      ["evt_refund_3", 4860],
    ])
      await processWebhook({
        id,
        type: "charge.refunded",
        data: {
          object: {
            id: "ch_test",
            amount_refunded: amount,
            refunded: amount === 4860,
          },
        },
      } as unknown as Stripe.Event);
    expect(
      (
        await rows(
          "SELECT SUM(amount_cents)::integer AS total FROM ledger WHERE type='refunded'",
        )
      )[0].total,
    ).toBe(4860);
  });
  it("fails closed in demo mode", async () => {
    vi.stubEnv("DEMO_MODE", "true");
    expect(
      (
        await req("auth/register", {
          name: "Test Person",
          email: "new@example.test",
          password: "a long password",
          role: "employer",
        })
      ).status,
    ).toBe(503);
  });
});
