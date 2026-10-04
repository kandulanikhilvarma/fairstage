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
import { createHmac } from "node:crypto";
import type Stripe from "stripe";

const state = vi.hoisted(() => ({
  db: null as PGlite | null,
  cookies: new Map<string, string>(),
  transfers: vi.fn(),
  retrieveIntent: vi.fn(),
  retrieveCharge: vi.fn(),
  retrieveAccount: vi.fn(),
  retrieveTransfer: vi.fn(),
  reverseTransfer: vi.fn(),
  listTransfers: vi.fn(),
  retrieveCheckout: vi.fn(),
  createCheckout: vi.fn(),
  retrieveDispute: vi.fn(),
  listDisputes: vi.fn(),
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
    set: (key: string, value: string) => state.cookies.set(key, value),
    delete: (key: string) => state.cookies.delete(key),
  }),
}));
vi.mock("stripe", async (importOriginal) => {
  const { default: StripeClient } =
    await importOriginal<typeof import("stripe")>();
  const webhooks = new StripeClient("sk_test_fake").webhooks;
  return {
    default: class {
      webhooks = webhooks;
      transfers = {
        create: state.transfers,
        createReversal: state.reverseTransfer,
        retrieve: state.retrieveTransfer,
        list: state.listTransfers,
      };
      paymentIntents = { retrieve: state.retrieveIntent };
      charges = { retrieve: state.retrieveCharge };
      accounts = { retrieve: state.retrieveAccount };
      checkout = {
        sessions: {
          retrieve: state.retrieveCheckout,
          create: state.createCheckout,
        },
      };
      disputes = { retrieve: state.retrieveDispute, list: state.listDisputes };
    },
  };
});
import { GET, POST } from "../app/api/[...path]/route";
import { POST as stripeWebhook } from "../app/api/webhooks/stripe/route";
import {
  checkout,
  connectAccount,
  processWebhook,
  releaseRound,
  stripeActionReady,
} from "../lib/payments";

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
  vi.stubEnv("DEMO_MODE", "false");
  vi.stubEnv("DATABASE_URL", "postgresql://configured-for-tests");
  vi.stubEnv("APP_URL", origin);
  vi.stubEnv("LIVE_PAYMENTS_ENABLED", "true");
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_fake");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test");
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("STRIPE_PLATFORM_COUNTRY", "");
  vi.stubEnv("STRIPE_FUNDS_FLOW_APPROVED", "false");
  state.cookies.clear();
  state.transfers.mockReset().mockResolvedValue({ id: "tr_test" });
  state.retrieveIntent.mockReset().mockResolvedValue({
    id: "pi_test",
    status: "succeeded",
    latest_charge: "ch_test",
    amount: 4860,
    currency: "usd",
    metadata: { roundId: round },
  });
  state.retrieveCharge.mockReset().mockResolvedValue({
    id: "ch_test",
    amount: 4860,
    currency: "usd",
    paid: true,
    captured: true,
    refunded: false,
    amount_refunded: 0,
    disputed: false,
    payment_intent: "pi_test",
  });
  state.retrieveAccount.mockReset().mockResolvedValue({
    details_submitted: true,
    payouts_enabled: true,
    capabilities: { transfers: "active" },
  });
  state.retrieveTransfer
    .mockReset()
    .mockResolvedValue({ id: "tr_test", amount_reversed: 0 });
  state.reverseTransfer
    .mockReset()
    .mockImplementation(async (_id, { amount }) => ({
      id: `trr_${amount}`,
      amount,
    }));
  state.listTransfers
    .mockReset()
    .mockResolvedValue({ data: [], has_more: false });
  state.retrieveCheckout
    .mockReset()
    .mockResolvedValue({ id: "cs_test", status: "expired" });
  state.createCheckout.mockReset().mockResolvedValue({
    id: "cs_new",
    url: "https://checkout.stripe.com/example",
  });
  state.retrieveDispute.mockReset().mockResolvedValue({
    id: "dp_test",
    charge: "ch_test",
    amount: 4860,
    status: "needs_response",
  });
  state.listDisputes.mockReset().mockResolvedValue({
    data: [{ status: "needs_response" }],
    has_more: false,
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
  it("fails closed without a database service", async () => {
    vi.stubEnv("DATABASE_URL", "");
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

const paymentUser = {
  id: employer,
  name: "Test",
  email: "employer@example.test",
  role: "employer" as const,
  company: "Test",
  country: "US",
  bio: "",
  verified: true,
};
function paymentEvent(id: string, type: string, object: unknown) {
  return { id, type, data: { object } } as unknown as Stripe.Event;
}
async function completedRound() {
  await rows(
    "UPDATE rounds SET status='completed',employer_confirmed=true,candidate_confirmed=true WHERE id=$1",
    [round],
  );
}
describe("payment provider reconciliation", () => {
  it("uses Dashboard payment methods and renews a failed async checkout", async () => {
    await rows("UPDATE rounds SET status='accepted' WHERE id=$1", [round]);
    state.retrieveCheckout.mockResolvedValue({
      id: "cs_test",
      status: "complete",
      payment_intent: "pi_test",
    });
    state.retrieveIntent.mockResolvedValue({
      status: "requires_payment_method",
    });
    await checkout(paymentUser, round);
    expect(state.createCheckout.mock.calls[0][0]).not.toHaveProperty(
      "payment_method_types",
    );
    expect(state.createCheckout.mock.calls[0][1].idempotencyKey).toBe(
      `checkout-${round}-cs_test`,
    );
  });
  it("keeps an unpaid async checkout unfunded until the success event", async () => {
    await rows(
      "UPDATE rounds SET status='accepted',charge_id=NULL WHERE id=$1",
      [round],
    );
    await processWebhook(
      paymentEvent("evt_async_pending", "checkout.session.completed", {
        payment_status: "unpaid",
      }),
    );
    expect((await rows("SELECT status FROM rounds"))[0].status).toBe(
      "accepted",
    );
    expect(await rows("SELECT * FROM ledger")).toHaveLength(0);
  });
  it("blocks release against a refund before its webhook arrives", async () => {
    await completedRound();
    state.retrieveCharge.mockResolvedValue({
      paid: true,
      captured: true,
      amount_refunded: 2000,
      disputed: false,
    });
    await expect(releaseRound(paymentUser, round)).rejects.toMatchObject({
      status: 409,
    });
    expect(state.transfers).not.toHaveBeenCalled();
  });
  it("blocks release when the provider disables the candidate account", async () => {
    await completedRound();
    state.retrieveAccount.mockResolvedValue({
      details_submitted: true,
      payouts_enabled: false,
      capabilities: { transfers: "active" },
    });
    await expect(releaseRound(paymentUser, round)).rejects.toMatchObject({
      status: 409,
    });
    expect(state.transfers).not.toHaveBeenCalled();
  });
  it("recovers a transfer after a database failure without another transfer", async () => {
    await completedRound();
    state.listTransfers.mockResolvedValue({
      data: [
        {
          id: "tr_recovered",
          amount: 4500,
          currency: "usd",
          destination: "acct_test",
          source_transaction: "ch_test",
          amount_reversed: 0,
        },
      ],
      has_more: false,
    });
    await releaseRound(paymentUser, round);
    expect(state.transfers).not.toHaveBeenCalled();
    expect((await rows("SELECT transfer_id FROM rounds"))[0].transfer_id).toBe(
      "tr_recovered",
    );
  });
  it("serializes concurrent release requests", async () => {
    await completedRound();
    await Promise.all([
      releaseRound(paymentUser, round),
      releaseRound(paymentUser, round),
    ]);
    expect(state.transfers).toHaveBeenCalledTimes(1);
    expect(await rows("SELECT * FROM ledger WHERE type='paid'")).toHaveLength(
      1,
    );
  });
  it("preserves the refund state when reversal fails and retries the shortfall", async () => {
    await rows(
      "UPDATE rounds SET status='paid',transfer_id='tr_test' WHERE id=$1",
      [round],
    );
    state.reverseTransfer.mockRejectedValueOnce(
      new Error("Insufficient connected balance"),
    );
    const event = paymentEvent("evt_refund_retry", "charge.refunded", {
      id: "ch_test",
      amount_refunded: 4860,
      refunded: true,
    });
    await expect(processWebhook(event)).rejects.toThrow("retry");
    expect((await rows("SELECT status FROM rounds"))[0].status).toBe(
      "cancelled",
    );
    expect(
      await rows("SELECT * FROM ledger WHERE type='refunded'"),
    ).toHaveLength(1);
    expect(await rows("SELECT * FROM webhook_events")).toHaveLength(0);
    await processWebhook(event);
    expect(state.reverseTransfer).toHaveBeenLastCalledWith(
      "tr_test",
      { amount: 4500 },
      { idempotencyKey: "refund-reversal-ch_test-4860" },
    );
    expect(
      await rows("SELECT * FROM ledger WHERE type='refunded'"),
    ).toHaveLength(1);
    expect(
      await rows("SELECT * FROM ledger WHERE type='reversed'"),
    ).toHaveLength(1);
  });
  it("reconciles an operator reversal before a further refund", async () => {
    await rows(
      "UPDATE rounds SET status='paid',transfer_id='tr_test' WHERE id=$1",
      [round],
    );
    state.retrieveTransfer.mockResolvedValue({
      id: "tr_test",
      amount_reversed: 2000,
    });
    await processWebhook(
      paymentEvent("evt_refund_after_manual", "charge.refunded", {
        id: "ch_test",
        amount_refunded: 4860,
        refunded: true,
      }),
    );
    expect(state.reverseTransfer.mock.calls[0][1].amount).toBe(2500);
    expect(
      (
        await rows(
          "SELECT SUM(amount_cents)::int total FROM ledger WHERE type='reversed'",
        )
      )[0].total,
    ).toBe(4500);
  });
  it("keeps an early refund event retryable until funding exists", async () => {
    await rows(
      "UPDATE rounds SET status='accepted',charge_id=NULL WHERE id=$1",
      [round],
    );
    await expect(
      processWebhook(
        paymentEvent("evt_early_refund", "charge.refunded", {
          id: "ch_test",
          payment_intent: "pi_test",
          amount_refunded: 4860,
          refunded: true,
        }),
      ),
    ).rejects.toThrow("Funding");
    expect(await rows("SELECT * FROM webhook_events")).toHaveLength(0);
  });
  it("restores a won dispute without closing a candidate dispute", async () => {
    await rows(
      "UPDATE rounds SET status='disputed',employer_confirmed=true,candidate_confirmed=true WHERE id=$1",
      [round],
    );
    state.retrieveCharge.mockResolvedValue({
      id: "ch_test",
      disputed: true,
      refunded: false,
    });
    state.retrieveDispute.mockResolvedValue({
      id: "dp_test",
      charge: "ch_test",
      amount: 4860,
      status: "won",
    });
    state.listDisputes.mockResolvedValue({
      data: [{ status: "won" }],
      has_more: false,
    });
    await processWebhook(
      paymentEvent("evt_won", "charge.dispute.closed", { id: "dp_test" }),
    );
    expect((await rows("SELECT status FROM rounds"))[0].status).toBe(
      "completed",
    );
    await rows(
      "INSERT INTO disputes(round_id,opened_by,reason) VALUES($1,$2,'The scope was not met.')",
      [round, candidate],
    );
    await processWebhook(
      paymentEvent("evt_won_again", "charge.dispute.closed", { id: "dp_test" }),
    );
    expect((await rows("SELECT status FROM rounds"))[0].status).toBe(
      "disputed",
    );
  });
});

describe("Stripe chargeback edge cases", () => {
  it("combines earlier refunds with a lost partial dispute for reversal", async () => {
    await rows(
      "UPDATE rounds SET status='paid',transfer_id='tr_test' WHERE id=$1",
      [round],
    );
    await rows(
      "INSERT INTO ledger(round_id,type,amount_cents,provider_ref) VALUES($1,'refunded',2000,'refund_before_dispute'),($1,'reversed',2000,'reversal_before_dispute')",
      [round],
    );
    state.retrieveTransfer.mockResolvedValue({
      id: "tr_test",
      amount_reversed: 2000,
    });
    state.retrieveCharge.mockResolvedValue({
      id: "ch_test",
      disputed: true,
      refunded: false,
      amount_refunded: 2000,
    });
    state.retrieveDispute.mockResolvedValue({
      id: "dp_test",
      charge: "ch_test",
      amount: 2860,
      status: "lost",
    });
    state.listDisputes.mockResolvedValue({
      data: [{ status: "lost" }],
      has_more: false,
    });
    await processWebhook(
      paymentEvent("evt_lost_partial", "charge.dispute.closed", {
        id: "dp_test",
      }),
    );
    expect(state.reverseTransfer.mock.calls[0][1].amount).toBe(2500);
    expect(
      (
        await rows(
          "SELECT SUM(amount_cents)::int total FROM ledger WHERE type='reversed'",
        )
      )[0].total,
    ).toBe(4500);
  });
  it("ignores an old failed attempt after a different charge funded the round", async () => {
    await processWebhook(
      paymentEvent("evt_old_failed", "charge.failed", {
        id: "ch_old",
        payment_intent: "pi_test",
      }),
    );
    expect((await rows("SELECT status FROM rounds"))[0].status).toBe("funded");
    expect(state.reverseTransfer).not.toHaveBeenCalled();
  });
});

async function signedStripeEvent(
  id: string,
  type: string,
  object: unknown,
  signatureOverride?: string,
  livemode = false,
) {
  const body = JSON.stringify({ ...paymentEvent(id, type, object), livemode });
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", "whsec_test")
    .update(`${timestamp}.${body}`)
    .digest("hex");
  return stripeWebhook(
    new Request(`${origin}/api/webhooks/stripe`, {
      method: "POST",
      headers: {
        "stripe-signature":
          signatureOverride ?? `t=${timestamp},v1=${signature}`,
      },
      body,
    }),
  );
}

describe("Stripe pause and signed reconciliation", () => {
  it("blocks new checkout, onboarding and transfers while paused", async () => {
    vi.stubEnv("LIVE_PAYMENTS_ENABLED", "false");
    vi.stubEnv("STRIPE_CONNECT_COUNTRIES", "US");
    await rows("UPDATE rounds SET status='accepted' WHERE id=$1", [round]);
    await expect(checkout(paymentUser, round)).rejects.toMatchObject({
      status: 503,
    });
    await expect(
      connectAccount({ ...paymentUser, id: candidate, role: "candidate" }),
    ).rejects.toMatchObject({ status: 503 });
    await completedRound();
    await expect(releaseRound(paymentUser, round)).rejects.toMatchObject({
      status: 503,
    });
    expect(state.createCheckout).not.toHaveBeenCalled();
    expect(state.retrieveAccount).not.toHaveBeenCalled();
    expect(state.transfers).not.toHaveBeenCalled();
    expect(await rows("SELECT * FROM ledger")).toHaveLength(0);
  });
  it("reconciles a signed async capture once while paused", async () => {
    vi.stubEnv("LIVE_PAYMENTS_ENABLED", "false");
    await rows(
      "UPDATE rounds SET status='accepted',charge_id=NULL WHERE id=$1",
      [round],
    );
    const capture = {
      id: "cs_test",
      metadata: { roundId: round },
      payment_intent: "pi_test",
      payment_status: "paid",
      currency: "usd",
      amount_total: 4860,
    };
    expect(
      (
        await signedStripeEvent(
          "evt_paused_capture",
          "checkout.session.async_payment_succeeded",
          capture,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await signedStripeEvent(
          "evt_paused_capture",
          "checkout.session.async_payment_succeeded",
          capture,
        )
      ).status,
    ).toBe(200);
    expect(
      (await rows("SELECT status,payment_intent_id FROM rounds"))[0],
    ).toMatchObject({ status: "funded", payment_intent_id: "pi_test" });
    expect(await rows("SELECT * FROM ledger WHERE type='funded'")).toHaveLength(
      1,
    );
    expect(state.retrieveIntent).toHaveBeenCalledTimes(1);
    expect(state.retrieveCharge).toHaveBeenCalledTimes(1);
    expect(state.transfers).not.toHaveBeenCalled();
  });
  it("records a signed refund and repairs the prior transfer while paused", async () => {
    vi.stubEnv("LIVE_PAYMENTS_ENABLED", "false");
    await rows(
      "UPDATE rounds SET status='paid',transfer_id='tr_test' WHERE id=$1",
      [round],
    );
    await rows(
      "INSERT INTO ledger(round_id,type,amount_cents,provider_ref) VALUES($1,'funded',4860,'pi_test'),($1,'paid',4500,'tr_test')",
      [round],
    );
    expect(
      (
        await signedStripeEvent("evt_paused_refund", "charge.refunded", {
          id: "ch_test",
          amount_refunded: 4860,
          refunded: true,
        })
      ).status,
    ).toBe(200);
    expect((await rows("SELECT status FROM rounds"))[0].status).toBe(
      "cancelled",
    );
    expect(
      (await rows("SELECT amount_cents FROM ledger WHERE type='refunded'"))[0]
        .amount_cents,
    ).toBe(4860);
    expect(
      (await rows("SELECT amount_cents FROM ledger WHERE type='reversed'"))[0]
        .amount_cents,
    ).toBe(4500);
    expect(
      await rows("SELECT * FROM ledger WHERE type IN ('funded','paid')"),
    ).toHaveLength(2);
    expect(state.reverseTransfer).toHaveBeenCalledTimes(1);
    expect(state.transfers).not.toHaveBeenCalled();
  });
  it("reconciles a signed lost dispute while paused", async () => {
    vi.stubEnv("LIVE_PAYMENTS_ENABLED", "false");
    await rows(
      "UPDATE rounds SET status='paid',transfer_id='tr_test' WHERE id=$1",
      [round],
    );
    state.retrieveCharge.mockResolvedValue({
      id: "ch_test",
      disputed: true,
      refunded: false,
      amount_refunded: 0,
    });
    state.retrieveDispute.mockResolvedValue({
      id: "dp_test",
      charge: "ch_test",
      amount: 4860,
      status: "lost",
    });
    state.listDisputes.mockResolvedValue({
      data: [{ status: "lost" }],
      has_more: false,
    });
    expect(
      (
        await signedStripeEvent("evt_paused_dispute", "charge.dispute.closed", {
          id: "dp_test",
        })
      ).status,
    ).toBe(200);
    expect((await rows("SELECT status FROM rounds"))[0].status).toBe(
      "disputed",
    );
    expect(
      await rows("SELECT * FROM ledger WHERE type='disputed'"),
    ).toHaveLength(1);
    expect(
      (await rows("SELECT amount_cents FROM ledger WHERE type='reversed'"))[0]
        .amount_cents,
    ).toBe(4500);
    expect(state.retrieveDispute).toHaveBeenCalledWith("dp_test");
    expect(state.transfers).not.toHaveBeenCalled();
  });
  it("records a signed provider reversal while paused", async () => {
    vi.stubEnv("LIVE_PAYMENTS_ENABLED", "false");
    await rows(
      "UPDATE rounds SET status='paid',transfer_id='tr_test' WHERE id=$1",
      [round],
    );
    state.retrieveTransfer.mockResolvedValue({
      id: "tr_test",
      amount_reversed: 1500,
    });
    expect(
      (
        await signedStripeEvent("evt_paused_transfer", "transfer.reversed", {
          id: "tr_test",
        })
      ).status,
    ).toBe(200);
    expect((await rows("SELECT status FROM rounds"))[0].status).toBe(
      "disputed",
    );
    expect(
      (await rows("SELECT amount_cents FROM ledger WHERE type='reversed'"))[0]
        .amount_cents,
    ).toBe(1500);
    expect(state.reverseTransfer).not.toHaveBeenCalled();
    expect(state.transfers).not.toHaveBeenCalled();
  });
  it("rejects a forged event during a pause before provider or database changes", async () => {
    vi.stubEnv("LIVE_PAYMENTS_ENABLED", "false");
    const timestamp = Math.floor(Date.now() / 1000);
    expect(
      (
        await signedStripeEvent(
          "evt_paused_forged",
          "charge.dispute.closed",
          { id: "dp_test" },
          `t=${timestamp},v1=${"0".repeat(64)}`,
        )
      ).status,
    ).toBe(400);
    expect(state.retrieveDispute).not.toHaveBeenCalled();
    expect(await rows("SELECT * FROM webhook_events")).toHaveLength(0);
  });
  it("rejects an event from the wrong provider environment during a pause", async () => {
    vi.stubEnv("LIVE_PAYMENTS_ENABLED", "false");
    expect(
      (
        await signedStripeEvent(
          "evt_paused_wrong_mode",
          "charge.dispute.closed",
          { id: "dp_test" },
          undefined,
          true,
        )
      ).status,
    ).toBe(400);
    expect(state.retrieveDispute).not.toHaveBeenCalled();
    expect(await rows("SELECT * FROM webhook_events")).toHaveLength(0);
  });
  it.each(["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "DATABASE_URL"])(
    "fails closed without %s during a pause",
    async (key) => {
      vi.stubEnv("LIVE_PAYMENTS_ENABLED", "false");
      vi.stubEnv(key, "");
      expect(
        (
          await signedStripeEvent(
            "evt_paused_missing_service",
            "charge.dispute.closed",
            { id: "dp_test" },
          )
        ).status,
      ).toBe(503);
      expect(state.retrieveDispute).not.toHaveBeenCalled();
      expect(await rows("SELECT * FROM webhook_events")).toHaveLength(0);
    },
  );
  it("rejects production test credentials even for paused reconciliation", async () => {
    vi.stubEnv("LIVE_PAYMENTS_ENABLED", "false");
    vi.stubEnv("NODE_ENV", "production");
    expect(
      (
        await signedStripeEvent(
          "evt_paused_test_key",
          "charge.dispute.closed",
          { id: "dp_test" },
        )
      ).status,
    ).toBe(503);
    expect(state.retrieveDispute).not.toHaveBeenCalled();
    expect(await rows("SELECT * FROM webhook_events")).toHaveLength(0);
  });
});

describe("Stripe production jurisdiction and funds flow", () => {
  it.each([
    ["", "true"],
    ["IN", "true"],
    ["us", "true"],
    ["USA", "true"],
    ["US", "false"],
  ])(
    "blocks new money actions for country %s and approval %s",
    async (country, approval) => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_fake");
      vi.stubEnv("STRIPE_PLATFORM_COUNTRY", country);
      vi.stubEnv("STRIPE_FUNDS_FLOW_APPROVED", approval);
      expect(stripeActionReady()).toBe(false);
      await rows("UPDATE rounds SET status='accepted' WHERE id=$1", [round]);
      await expect(checkout(paymentUser, round)).rejects.toMatchObject({
        status: 503,
      });
      await completedRound();
      await expect(releaseRound(paymentUser, round)).rejects.toMatchObject({
        status: 503,
      });
      expect(state.createCheckout).not.toHaveBeenCalled();
      expect(state.transfers).not.toHaveBeenCalled();
      expect(state.retrieveAccount).not.toHaveBeenCalled();
    },
  );
  it("permits explicitly approved US production actions", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_fake");
    vi.stubEnv("STRIPE_PLATFORM_COUNTRY", "US");
    vi.stubEnv("STRIPE_FUNDS_FLOW_APPROVED", "true");
    expect(stripeActionReady()).toBe(true);
    await rows("UPDATE rounds SET status='accepted' WHERE id=$1", [round]);
    await checkout(paymentUser, round);
    await completedRound();
    await releaseRound(paymentUser, round);
    expect(state.createCheckout).toHaveBeenCalledTimes(1);
    expect(state.transfers).toHaveBeenCalledTimes(1);
  });
  it("reconciles a signed live capture despite disabled jurisdiction and funds-flow gates", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_fake");
    vi.stubEnv("STRIPE_PLATFORM_COUNTRY", "IN");
    vi.stubEnv("STRIPE_FUNDS_FLOW_APPROVED", "false");
    expect(stripeActionReady()).toBe(false);
    await rows(
      "UPDATE rounds SET status='accepted',charge_id=NULL WHERE id=$1",
      [round],
    );
    expect(
      (
        await signedStripeEvent(
          "evt_unapproved_live_capture",
          "checkout.session.completed",
          {
            id: "cs_test",
            metadata: { roundId: round },
            payment_intent: "pi_test",
            payment_status: "paid",
            currency: "usd",
            amount_total: 4860,
          },
          undefined,
          true,
        )
      ).status,
    ).toBe(200);
    expect((await rows("SELECT status FROM rounds"))[0].status).toBe("funded");
    expect(await rows("SELECT * FROM ledger WHERE type='funded'")).toHaveLength(
      1,
    );
    expect(state.transfers).not.toHaveBeenCalled();
  });
});
