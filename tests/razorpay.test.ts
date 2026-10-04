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
import { readdir, readFile } from "node:fs/promises";
import { createHmac } from "node:crypto";
const state = vi.hoisted(() => ({ db: null as PGlite | null, fetch: vi.fn() }));
vi.mock("../lib/db", () => ({
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
  query: async (sql: string, values: unknown[] = []) =>
    (await state.db!.query(sql, values)).rows,
}));
import {
  createRazorpayOrder,
  verifyRazorpayPayment,
  releaseRazorpayRound,
  processRazorpayWebhook,
  razorpayReadiness,
} from "../lib/razorpay";
import { POST as razorpayWebhook } from "../app/api/webhooks/razorpay/route";
const employer = "00000000-0000-4000-8000-000000000011";
const candidate = "00000000-0000-4000-8000-000000000012";
const other = "00000000-0000-4000-8000-000000000013";
const roundId = "00000000-0000-4000-8000-000000000014";
const user = {
  id: employer,
  name: "Employer",
  email: "employer@example.test",
  role: "employer" as const,
  company: "Company",
  bio: "",
  country: "IN",
  verified: true,
};
const order = {
  id: "order_test",
  amount: 48600,
  currency: "INR",
  status: "created",
  receipt: roundId,
  notes: { roundId },
};
const payment = {
  id: "pay_test",
  order_id: "order_test",
  amount: 48600,
  currency: "INR",
  status: "captured",
  captured: true,
  amount_refunded: 0,
  notes: { roundId },
};
const transfer = {
  id: "trf_test",
  amount: 45000,
  currency: "INR",
  status: "processed",
  recipient: "acc_test",
  amount_reversed: 0,
  notes: { roundId, paymentId: "pay_test" },
};
let currentPayment = { ...payment };
let currentTransfer = { ...transfer };
async function sql(query: string, values: unknown[] = []) {
  return (await state.db!.query(query, values)).rows as Record<
    string,
    unknown
  >[];
}
function sign(raw: string, key = "webhook-secret") {
  return createHmac("sha256", key).update(raw).digest("hex");
}
function verification() {
  return {
    roundId,
    razorpay_order_id: "order_test",
    razorpay_payment_id: "pay_test",
    razorpay_signature: sign("order_test|pay_test", "test-secret"),
  };
}
async function readyRound() {
  await sql(
    "UPDATE rounds SET status='completed',employer_confirmed=true,candidate_confirmed=true,razorpay_order_id='order_test',razorpay_payment_id='pay_test' WHERE id=$1",
    [roundId],
  );
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
  vi.unstubAllGlobals();
});
beforeEach(async () => {
  vi.stubEnv("DATABASE_URL", "postgresql://configured-for-tests");
  vi.stubEnv("RAZORPAY_PAYMENTS_ENABLED", "true");
  vi.stubEnv("RAZORPAY_ROUTE_ENABLED", "true");
  vi.stubEnv("RAZORPAY_KEY_ID", "rzp_test_key");
  vi.stubEnv("RAZORPAY_KEY_SECRET", "test-secret");
  vi.stubEnv("RAZORPAY_WEBHOOK_SECRET", "webhook-secret");
  vi.stubEnv("NODE_ENV", "test");
  currentPayment = { ...payment };
  currentTransfer = { ...transfer };
  state.fetch
    .mockReset()
    .mockImplementation(async (url: string, init?: RequestInit) => {
      let result: unknown;
      if (url.includes("/accounts/"))
        result = { id: "acc_test", status: "activated" };
      else if (url.includes("/orders?")) result = { items: [] };
      else if (url.endsWith("/orders") || url.includes("/orders/"))
        result = order;
      else if (url.includes("/payments/")) result = currentPayment;
      else if (url.endsWith("/transfers") && init?.method === "POST")
        result = currentTransfer;
      else if (url.includes("/transfers/")) result = currentTransfer;
      else throw new Error(`Unexpected provider request: ${url}`);
      return Response.json(result);
    });
  vi.stubGlobal("fetch", state.fetch);
  await state.db!.exec(
    "TRUNCATE users,razorpay_events RESTART IDENTITY CASCADE",
  );
  for (const [id, role] of [
    [employer, "employer"],
    [candidate, "candidate"],
    [other, "employer"],
  ])
    await sql(
      "INSERT INTO users(id,name,email,password_hash,role,email_verified,razorpay_account_id,razorpay_ready) VALUES($1,'Person',$2,'unused',$3,true,$4,true)",
      [
        id,
        `${id}@example.test`,
        role,
        role === "candidate" ? "acc_test" : null,
      ],
    );
  await sql(
    "INSERT INTO rounds(id,employer_id,candidate_id,title,kind,minutes,amount_cents,fee_cents,scheduled_at,meeting_url,terms,status,currency,payment_provider) VALUES($1,$2,$3,'Designer','Skills interview',60,45000,3600,now()-interval '1 day','https://example.test','Clear paid interview terms.','accepted','INR','razorpay')",
    [roundId, employer, candidate],
  );
});
describe("Razorpay production payment boundaries", () => {
  it("requires merchant setup and Route approval before collection", async () => {
    vi.stubEnv("RAZORPAY_ROUTE_ENABLED", "false");
    expect(razorpayReadiness()).toEqual({ configured: true, route: false });
    await expect(createRazorpayOrder(user, roundId)).rejects.toMatchObject({
      status: 503,
    });
    expect(state.fetch).not.toHaveBeenCalled();
  });
  it("rejects test credentials in a production environment", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(razorpayReadiness().configured).toBe(false);
  });
  it("creates an INR order after candidate payment onboarding", async () => {
    const result = await createRazorpayOrder(user, roundId);
    expect(result.checkout).toMatchObject({
      orderId: "order_test",
      amount: 48600,
      currency: "INR",
    });
    expect(
      (await sql("SELECT razorpay_order_id FROM rounds"))[0].razorpay_order_id,
    ).toBe("order_test");
  });
  it("rejects another employer order request", async () => {
    await expect(
      createRazorpayOrder({ ...user, id: other }, roundId),
    ).rejects.toMatchObject({ status: 404 });
    expect(state.fetch).not.toHaveBeenCalled();
  });
  it("recovers a provider order by receipt without another order", async () => {
    state.fetch.mockImplementation(async (url: string) =>
      Response.json(
        url.includes("/accounts/")
          ? { id: "acc_test", status: "activated" }
          : { items: [order] },
      ),
    );
    await createRazorpayOrder(user, roundId);
    expect(
      state.fetch.mock.calls.some(([, init]) => init?.method === "POST"),
    ).toBe(false);
  });
  it("requires candidate operator mapping before employer collection", async () => {
    await sql("UPDATE users SET razorpay_ready=false WHERE id=$1", [candidate]);
    await expect(createRazorpayOrder(user, roundId)).rejects.toMatchObject({
      status: 409,
    });
    expect(state.fetch).not.toHaveBeenCalled();
  });
  it("verifies the stored order, HMAC and captured provider amount", async () => {
    await createRazorpayOrder(user, roundId);
    await verifyRazorpayPayment(user, verification());
    expect((await sql("SELECT status FROM rounds"))[0].status).toBe("funded");
    expect(await sql("SELECT * FROM ledger WHERE type='funded'")).toHaveLength(
      1,
    );
    await verifyRazorpayPayment(user, verification());
    expect(await sql("SELECT * FROM ledger WHERE type='funded'")).toHaveLength(
      1,
    );
  });
  it("rejects a forged signature before a provider request", async () => {
    await sql("UPDATE rounds SET razorpay_order_id='order_test'");
    await expect(
      verifyRazorpayPayment(user, {
        ...verification(),
        razorpay_signature: "0".repeat(64),
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(state.fetch).not.toHaveBeenCalled();
  });
  it("rejects an authorized payment until the provider captures it", async () => {
    await sql("UPDATE rounds SET razorpay_order_id='order_test'");
    currentPayment = { ...payment, status: "authorized", captured: false };
    await expect(
      verifyRazorpayPayment(user, verification()),
    ).rejects.toMatchObject({ status: 409 });
    expect(await sql("SELECT * FROM ledger")).toHaveLength(0);
  });
  it("rejects an incorrect provider amount and rolls back", async () => {
    await sql("UPDATE rounds SET razorpay_order_id='order_test'");
    currentPayment = { ...payment, amount: 1 };
    await expect(
      verifyRazorpayPayment(user, verification()),
    ).rejects.toMatchObject({ status: 409 });
    expect((await sql("SELECT status FROM rounds"))[0].status).toBe("accepted");
  });
  it("releases once after both confirmations with provider idempotency", async () => {
    await readyRound();
    await Promise.all([
      releaseRazorpayRound(user, roundId),
      releaseRazorpayRound(user, roundId),
    ]);
    const posts = state.fetch.mock.calls.filter(
      ([url, init]) => url.endsWith("/transfers") && init?.method === "POST",
    );
    expect(posts).toHaveLength(1);
    expect(posts[0][1].headers["X-Transfer-Idempotency"]).toBe(roundId);
    expect(await sql("SELECT * FROM ledger WHERE type='paid'")).toHaveLength(1);
  });
  it("keeps pending transfers separate from released money", async () => {
    await readyRound();
    currentTransfer = { ...transfer, status: "pending" };
    await releaseRazorpayRound(user, roundId);
    expect(
      (await sql("SELECT status,razorpay_transfer_id FROM rounds"))[0],
    ).toMatchObject({ status: "completed", razorpay_transfer_id: "trf_test" });
    expect(await sql("SELECT * FROM ledger WHERE type='paid'")).toHaveLength(0);
    currentTransfer = { ...transfer };
    await releaseRazorpayRound(user, roundId);
    expect(await sql("SELECT * FROM ledger WHERE type='paid'")).toHaveLength(1);
    expect(
      state.fetch.mock.calls.filter(
        ([url, init]) => url.endsWith("/transfers") && init?.method === "POST",
      ),
    ).toHaveLength(1);
  });
  it("blocks release for a provider refund before its webhook", async () => {
    await readyRound();
    currentPayment = { ...payment, amount_refunded: 2000 };
    await expect(releaseRazorpayRound(user, roundId)).rejects.toMatchObject({
      status: 409,
    });
    expect(
      state.fetch.mock.calls.some(
        ([url, init]) => url.endsWith("/transfers") && init?.method === "POST",
      ),
    ).toBe(false);
  });
  it("accepts a signed capture webhook once and checks the API", async () => {
    await sql("UPDATE rounds SET razorpay_order_id='order_test'");
    const raw = JSON.stringify({
      event: "payment.captured",
      payload: { payment: { entity: { id: "pay_test" } } },
    });
    await Promise.all([
      processRazorpayWebhook(raw, sign(raw), "evt_capture"),
      processRazorpayWebhook(raw, sign(raw), "evt_capture"),
    ]);
    expect(await sql("SELECT * FROM ledger WHERE type='funded'")).toHaveLength(
      1,
    );
    expect(await sql("SELECT * FROM razorpay_events")).toHaveLength(1);
  });
  it("rejects a changed raw webhook body", async () => {
    const raw = JSON.stringify({
      event: "payment.captured",
      payload: { payment: { entity: { id: "pay_test" } } },
    });
    await expect(
      processRazorpayWebhook(raw + " ", sign(raw), "evt_tampered"),
    ).rejects.toMatchObject({ status: 400 });
    expect(state.fetch).not.toHaveBeenCalled();
  });
  it("records partial refunds once and flags operator reversal review", async () => {
    await readyRound();
    await releaseRazorpayRound(user, roundId);
    currentPayment = { ...payment, amount_refunded: 2000 };
    const raw = JSON.stringify({
      event: "refund.processed",
      payload: { refund: { entity: { payment_id: "pay_test" } } },
    });
    await processRazorpayWebhook(raw, sign(raw), "evt_refund");
    await processRazorpayWebhook(raw, sign(raw), "evt_refund_replay");
    expect((await sql("SELECT status FROM rounds"))[0].status).toBe("disputed");
    expect(
      await sql("SELECT * FROM ledger WHERE type='refunded'"),
    ).toHaveLength(1);
    expect(
      await sql(
        "SELECT * FROM audit_events WHERE action='razorpay_reversal_review'",
      ),
    ).toHaveLength(1);
  });
});

describe("Razorpay retry and ordering", () => {
  it("recovers a captured payment when the local order save failed", async () => {
    const raw = JSON.stringify({
      event: "payment.captured",
      payload: { payment: { entity: { id: "pay_test" } } },
    });
    await processRazorpayWebhook(raw, sign(raw), "evt_order_recovery");
    expect(
      (await sql("SELECT status,razorpay_order_id FROM rounds"))[0],
    ).toMatchObject({ status: "funded", razorpay_order_id: "order_test" });
  });
  it("keeps the same idempotency key and payload after an ambiguous transfer timeout", async () => {
    await readyRound();
    const normal = state.fetch.getMockImplementation()!;
    let failed = false;
    state.fetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/transfers") && init?.method === "POST" && !failed) {
        failed = true;
        throw new Error("Network timeout after provider acceptance");
      }
      return normal(url, init);
    });
    await expect(releaseRazorpayRound(user, roundId)).rejects.toMatchObject({
      status: 503,
    });
    await releaseRazorpayRound(user, roundId);
    const attempts = state.fetch.mock.calls.filter(
      ([url, init]) => url.endsWith("/transfers") && init?.method === "POST",
    );
    expect(attempts).toHaveLength(2);
    expect(attempts[0][1].body).toBe(attempts[1][1].body);
    expect(attempts[0][1].headers["X-Transfer-Idempotency"]).toBe(
      attempts[1][1].headers["X-Transfer-Idempotency"],
    );
    expect(await sql("SELECT * FROM ledger WHERE type='paid'")).toHaveLength(1);
  });
  it("recovers a confirmed provider transfer after its local transaction failed", async () => {
    await readyRound();
    const raw = JSON.stringify({
      event: "transfer.processed",
      payload: { transfer: { entity: { id: "trf_test" } } },
    });
    await processRazorpayWebhook(raw, sign(raw), "evt_transfer_recovery");
    expect(
      (await sql("SELECT status,razorpay_transfer_id FROM rounds"))[0],
    ).toMatchObject({ status: "paid", razorpay_transfer_id: "trf_test" });
    expect(
      state.fetch.mock.calls.some(([, init]) => init?.method === "POST"),
    ).toBe(false);
  });
});

async function signedRazorpayEvent(
  id: string,
  event: string,
  payload: Record<string, unknown>,
  signatureOverride?: string,
) {
  const raw = JSON.stringify({ event, payload });
  return razorpayWebhook(
    new Request("https://fairstage.example.test/api/webhooks/razorpay", {
      method: "POST",
      headers: {
        "x-razorpay-event-id": id,
        "x-razorpay-signature": signatureOverride ?? sign(raw),
      },
      body: raw,
    }),
  );
}
describe("Razorpay pause and signed reconciliation", () => {
  it.each(["RAZORPAY_PAYMENTS_ENABLED", "RAZORPAY_ROUTE_ENABLED"])(
    "blocks new orders, verification and transfers when %s is paused",
    async (key) => {
      vi.stubEnv(key, "false");
      await expect(createRazorpayOrder(user, roundId)).rejects.toMatchObject({
        status: 503,
      });
      await expect(
        verifyRazorpayPayment(user, verification()),
      ).rejects.toMatchObject({ status: 503 });
      await readyRound();
      await expect(releaseRazorpayRound(user, roundId)).rejects.toMatchObject({
        status: 503,
      });
      expect(state.fetch).not.toHaveBeenCalled();
      expect(await sql("SELECT * FROM ledger")).toHaveLength(0);
    },
  );
  it("reconciles a signed capture once while payments and Route are paused", async () => {
    vi.stubEnv("RAZORPAY_PAYMENTS_ENABLED", "false");
    vi.stubEnv("RAZORPAY_ROUTE_ENABLED", "false");
    const payload = { payment: { entity: { id: "pay_test" } } };
    expect(
      (
        await signedRazorpayEvent(
          "evt_paused_capture",
          "payment.captured",
          payload,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await signedRazorpayEvent(
          "evt_paused_capture",
          "payment.captured",
          payload,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await sql(
          "SELECT status,razorpay_payment_id,razorpay_order_id FROM rounds",
        )
      )[0],
    ).toMatchObject({
      status: "funded",
      razorpay_payment_id: "pay_test",
      razorpay_order_id: "order_test",
    });
    expect(await sql("SELECT * FROM ledger WHERE type='funded'")).toHaveLength(
      1,
    );
    expect(await sql("SELECT * FROM razorpay_events")).toHaveLength(1);
    expect(
      state.fetch.mock.calls.every(([, init]) => init?.method === "GET"),
    ).toBe(true);
  });
  it("records a signed refund and operator repair queue while paused", async () => {
    await readyRound();
    await sql(
      "UPDATE rounds SET status='paid',razorpay_transfer_id='trf_test' WHERE id=$1",
      [roundId],
    );
    await sql(
      "INSERT INTO ledger(round_id,type,amount_cents,provider_ref) VALUES($1,'funded',48600,'pay_test'),($1,'paid',45000,'trf_test')",
      [roundId],
    );
    vi.stubEnv("RAZORPAY_PAYMENTS_ENABLED", "false");
    vi.stubEnv("RAZORPAY_ROUTE_ENABLED", "false");
    currentPayment = { ...payment, amount_refunded: 2000 };
    expect(
      (
        await signedRazorpayEvent("evt_paused_refund", "refund.processed", {
          refund: { entity: { payment_id: "pay_test" } },
        })
      ).status,
    ).toBe(200);
    expect((await sql("SELECT status FROM rounds"))[0].status).toBe("disputed");
    expect(
      (await sql("SELECT amount_cents FROM ledger WHERE type='refunded'"))[0]
        .amount_cents,
    ).toBe(2000);
    expect(
      await sql("SELECT * FROM ledger WHERE type IN ('funded','paid')"),
    ).toHaveLength(2);
    expect(
      await sql(
        "SELECT * FROM audit_events WHERE action='razorpay_reversal_review'",
      ),
    ).toHaveLength(1);
    expect(
      state.fetch.mock.calls.every(([, init]) => init?.method === "GET"),
    ).toBe(true);
  });
  it("freezes a signed disputed payment for operator review while paused", async () => {
    await readyRound();
    vi.stubEnv("RAZORPAY_PAYMENTS_ENABLED", "false");
    vi.stubEnv("RAZORPAY_ROUTE_ENABLED", "false");
    expect(
      (
        await signedRazorpayEvent(
          "evt_paused_dispute",
          "payment.dispute.lost",
          { dispute: { entity: { payment_id: "pay_test" } } },
        )
      ).status,
    ).toBe(200);
    expect((await sql("SELECT status FROM rounds"))[0].status).toBe("disputed");
    expect(
      await sql(
        "SELECT * FROM audit_events WHERE action='razorpay_payment_review'",
      ),
    ).toHaveLength(1);
    expect(await sql("SELECT * FROM ledger WHERE type='paid'")).toHaveLength(0);
    expect(
      state.fetch.mock.calls.every(([, init]) => init?.method === "GET"),
    ).toBe(true);
  });
  it("recovers a signed transfer and its later reversal while paused", async () => {
    await readyRound();
    vi.stubEnv("RAZORPAY_PAYMENTS_ENABLED", "false");
    vi.stubEnv("RAZORPAY_ROUTE_ENABLED", "false");
    const payload = { transfer: { entity: { id: "trf_test" } } };
    expect(
      (
        await signedRazorpayEvent(
          "evt_paused_transfer",
          "transfer.processed",
          payload,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await sql(
          "SELECT status,razorpay_transfer_id,razorpay_release_body FROM rounds",
        )
      )[0],
    ).toMatchObject({
      status: "paid",
      razorpay_transfer_id: "trf_test",
      razorpay_release_body: null,
    });
    currentTransfer = { ...transfer, amount_reversed: 2000 };
    expect(
      (
        await signedRazorpayEvent(
          "evt_paused_reversed",
          "transfer.reversed",
          payload,
        )
      ).status,
    ).toBe(200);
    expect((await sql("SELECT status FROM rounds"))[0].status).toBe("disputed");
    expect(
      (await sql("SELECT amount_cents FROM ledger WHERE type='reversed'"))[0]
        .amount_cents,
    ).toBe(2000);
    expect(await sql("SELECT * FROM ledger WHERE type='paid'")).toHaveLength(1);
    expect(
      state.fetch.mock.calls.every(([, init]) => init?.method === "GET"),
    ).toBe(true);
  });
  it("rejects a forged event during a pause before provider or database changes", async () => {
    vi.stubEnv("RAZORPAY_PAYMENTS_ENABLED", "false");
    vi.stubEnv("RAZORPAY_ROUTE_ENABLED", "false");
    expect(
      (
        await signedRazorpayEvent(
          "evt_paused_forged",
          "payment.captured",
          { payment: { entity: { id: "pay_test" } } },
          "0".repeat(64),
        )
      ).status,
    ).toBe(400);
    expect(state.fetch).not.toHaveBeenCalled();
    expect(await sql("SELECT * FROM razorpay_events")).toHaveLength(0);
  });
  it.each([
    "RAZORPAY_KEY_ID",
    "RAZORPAY_KEY_SECRET",
    "RAZORPAY_WEBHOOK_SECRET",
    "DATABASE_URL",
  ])("fails closed without %s during a pause", async (key) => {
    vi.stubEnv("RAZORPAY_PAYMENTS_ENABLED", "false");
    vi.stubEnv(key, "");
    expect(
      (
        await signedRazorpayEvent(
          "evt_paused_missing_service",
          "payment.captured",
          { payment: { entity: { id: "pay_test" } } },
        )
      ).status,
    ).toBe(503);
    expect(state.fetch).not.toHaveBeenCalled();
    expect(await sql("SELECT * FROM razorpay_events")).toHaveLength(0);
  });
  it("rejects production test credentials even for paused reconciliation", async () => {
    vi.stubEnv("RAZORPAY_PAYMENTS_ENABLED", "false");
    vi.stubEnv("NODE_ENV", "production");
    expect(
      (
        await signedRazorpayEvent("evt_paused_test_key", "payment.captured", {
          payment: { entity: { id: "pay_test" } },
        })
      ).status,
    ).toBe(503);
    expect(state.fetch).not.toHaveBeenCalled();
    expect(await sql("SELECT * FROM razorpay_events")).toHaveLength(0);
  });
});
