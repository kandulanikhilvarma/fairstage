import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { PoolClient } from "pg";
import { transaction } from "./db";
import { HttpError, requireRole } from "./security";
import type { User } from "./domain";

const paymentSchema = z.object({
  id: z.string(),
  order_id: z.string(),
  amount: z.number().int().nonnegative(),
  currency: z.string(),
  status: z.string(),
  captured: z.boolean().optional(),
  amount_refunded: z.number().int().nonnegative().default(0),
  notes: z.record(z.string(), z.string()).optional(),
});
const orderSchema = z.object({
  id: z.string(),
  amount: z.number().int(),
  currency: z.string(),
  status: z.string(),
  receipt: z.string().nullable(),
  notes: z.record(z.string(), z.string()).optional(),
});
const transferSchema = z.object({
  id: z.string(),
  amount: z.number().int(),
  currency: z.string(),
  recipient: z.string(),
  status: z.string(),
  amount_reversed: z.number().int().nonnegative().default(0),
  notes: z.record(z.string(), z.string()).optional(),
});
type Payment = z.infer<typeof paymentSchema>;
type Transfer = z.infer<typeof transferSchema>;
interface PaymentRound {
  id: string;
  title: string;
  kind: string;
  amount_cents: number;
  fee_cents: number;
  currency: string;
  payment_provider: string;
  status: string;
  employer_confirmed: boolean;
  candidate_confirmed: boolean;
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  razorpay_transfer_id: string | null;
  razorpay_release_body: Record<string, unknown> | null;
  razorpay_account_id?: string;
  razorpay_ready?: boolean;
}
export function razorpayWebhookReady() {
  const live =
    process.env.NODE_ENV !== "production" ||
    process.env.RAZORPAY_KEY_ID?.startsWith("rzp_live_");
  return Boolean(
    live &&
    process.env.RAZORPAY_KEY_ID &&
    process.env.RAZORPAY_KEY_SECRET &&
    process.env.RAZORPAY_WEBHOOK_SECRET,
  );
}
export function razorpayReadiness() {
  const configured =
    process.env.RAZORPAY_PAYMENTS_ENABLED === "true" && razorpayWebhookReady();
  return {
    configured,
    route: configured && process.env.RAZORPAY_ROUTE_ENABLED === "true",
  };
}
function requireWebhookReady() {
  if (!razorpayWebhookReady())
    throw new HttpError(503, "Payments are not configured. Contact support.");
}
function requireReady() {
  if (!razorpayReadiness().route)
    throw new HttpError(
      503,
      "Razorpay payments need merchant activation and Route approval. Contact support.",
    );
}
async function api(
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
) {
  if (body === undefined) requireWebhookReady();
  else requireReady();
  let response: Response;
  try {
    response = await fetch(`https://api.razorpay.com/v1/${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64")}`,
        "Content-Type": "application/json",
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new HttpError(
      503,
      "The payment provider did not confirm the request. Retry with the same round.",
    );
  }
  if (!response.ok)
    throw new HttpError(
      response.status === 409 ? 409 : 503,
      "The payment provider could not complete the request. Check the provider account or contact support.",
    );
  return response.json() as Promise<unknown>;
}
function validSignature(payload: string, signature: string, secret: string) {
  if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(payload).digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}
function selectedProvider(round: PaymentRound) {
  if (round.currency !== "INR" || round.payment_provider !== "razorpay")
    throw new HttpError(
      409,
      "Use the payment provider selected for this round.",
    );
}
async function readyCandidate(round: PaymentRound) {
  if (!round.razorpay_ready || !round.razorpay_account_id)
    throw new HttpError(
      409,
      "The candidate must complete approved payment onboarding. Contact support.",
    );
  const account = z
    .object({ id: z.string(), status: z.string() })
    .parse(
      await api(`accounts/${encodeURIComponent(round.razorpay_account_id)}`),
    );
  if (
    account.id !== round.razorpay_account_id ||
    account.status !== "activated"
  )
    throw new HttpError(
      409,
      "The candidate payment account is not active. Contact support.",
    );
}
export async function createRazorpayOrder(user: User, roundId: string) {
  requireRole(user, "employer");
  if (!user.verified)
    throw new HttpError(403, "Verify your email before you fund a round.");
  requireReady();
  return transaction(async (db) => {
    const {
      rows: [round],
    } = await db.query<PaymentRound>(
      "SELECT r.*,u.razorpay_account_id,u.razorpay_ready FROM rounds r JOIN users u ON u.id=r.candidate_id WHERE r.id=$1 AND r.employer_id=$2 FOR UPDATE OF r",
      [roundId, user.id],
    );
    if (!round) throw new HttpError(404, "The round does not exist.");
    selectedProvider(round);
    if (round.status !== "accepted")
      throw new HttpError(
        409,
        "The candidate must accept an unfunded round first.",
      );
    await readyCandidate(round);
    const amount = round.amount_cents + round.fee_cents;
    let order;
    if (round.razorpay_order_id)
      order = orderSchema.parse(
        await api(`orders/${encodeURIComponent(round.razorpay_order_id)}`),
      );
    else {
      const collection = z
        .object({ items: z.array(orderSchema) })
        .parse(
          await api(`orders?receipt=${encodeURIComponent(round.id)}&count=100`),
        );
      const matches = collection.items.filter(
        (item) => item.receipt === round.id,
      );
      if (matches.length > 1)
        throw new HttpError(
          409,
          "Multiple payment orders need review. Contact support.",
        );
      order =
        matches[0] ??
        orderSchema.parse(
          await api("orders", {
            amount,
            currency: "INR",
            receipt: round.id,
            partial_payment: false,
            notes: { roundId: round.id },
          }),
        );
      await db.query("UPDATE rounds SET razorpay_order_id=$1 WHERE id=$2", [
        order.id,
        round.id,
      ]);
    }
    if (
      order.amount !== amount ||
      order.currency !== "INR" ||
      order.receipt !== round.id
    )
      throw new HttpError(
        409,
        "The provider order does not match this round. Contact support.",
      );
    if (order.status === "paid")
      throw new HttpError(
        409,
        "The provider received this payment. Refresh the workspace for confirmation.",
      );
    return {
      checkout: {
        key: process.env.RAZORPAY_KEY_ID!,
        orderId: order.id,
        amount,
        currency: "INR" as const,
        name: "Fairstage",
        description: `${round.kind}: ${round.title}`,
      },
    };
  });
}
async function reconcilePayment(
  db: PoolClient,
  round: PaymentRound,
  payment: Payment,
) {
  selectedProvider(round);
  if (
    payment.order_id !== round.razorpay_order_id ||
    payment.amount !== round.amount_cents + round.fee_cents ||
    payment.currency !== "INR"
  )
    throw new HttpError(409, "The provider payment does not match the round.");
  if (
    !["captured", "refunded"].includes(payment.status) ||
    payment.captured === false
  )
    throw new HttpError(
      409,
      "The payment is not captured. Wait for provider confirmation.",
    );
  if (round.razorpay_payment_id && round.razorpay_payment_id !== payment.id)
    throw new HttpError(
      409,
      "A different payment already funded this round. Contact support.",
    );
  if (!round.razorpay_payment_id) {
    if (round.status !== "accepted")
      throw new HttpError(
        409,
        "This round cannot accept a payment. Contact support.",
      );
    await db.query(
      "UPDATE rounds SET status='funded',razorpay_payment_id=$1 WHERE id=$2",
      [payment.id, round.id],
    );
    await db.query(
      "INSERT INTO ledger(round_id,type,amount_cents,provider_ref) VALUES($1,'funded',$2,$3) ON CONFLICT(provider_ref) DO NOTHING",
      [round.id, payment.amount, payment.id],
    );
  }
  if (payment.amount_refunded > 0) {
    if (payment.amount_refunded > payment.amount)
      throw new Error("The refund exceeds the captured payment.");
    const {
      rows: [totals],
    } = await db.query(
      "SELECT COALESCE(SUM(amount_cents),0)::integer total FROM ledger WHERE round_id=$1 AND type='refunded'",
      [round.id],
    );
    const delta = payment.amount_refunded - totals.total;
    if (delta > 0) {
      await db.query("UPDATE rounds SET status=$1 WHERE id=$2", [
        payment.amount_refunded === payment.amount ? "cancelled" : "disputed",
        round.id,
      ]);
      await db.query(
        "INSERT INTO ledger(round_id,type,amount_cents,provider_ref) VALUES($1,'refunded',$2,$3) ON CONFLICT(provider_ref) DO NOTHING",
        [round.id, delta, `${payment.id}-refund-${payment.amount_refunded}`],
      );
      if (round.razorpay_transfer_id)
        await db.query(
          "INSERT INTO audit_events(action,resource_id) VALUES('razorpay_reversal_review',$1)",
          [round.id],
        );
    }
  }
}
const verificationSchema = z.object({
  roundId: z.uuid(),
  razorpay_order_id: z.string().regex(/^order_[A-Za-z0-9]+$/),
  razorpay_payment_id: z.string().regex(/^pay_[A-Za-z0-9]+$/),
  razorpay_signature: z.string().regex(/^[a-f0-9]{64}$/i),
});
export async function verifyRazorpayPayment(user: User, body: unknown) {
  requireRole(user, "employer");
  requireReady();
  const input = verificationSchema.parse(body);
  await transaction(async (db) => {
    const {
      rows: [round],
    } = await db.query<PaymentRound>(
      "SELECT * FROM rounds WHERE id=$1 AND employer_id=$2 FOR UPDATE",
      [input.roundId, user.id],
    );
    if (!round) throw new HttpError(404, "The round does not exist.");
    if (
      round.razorpay_order_id !== input.razorpay_order_id ||
      !validSignature(
        `${round.razorpay_order_id}|${input.razorpay_payment_id}`,
        input.razorpay_signature,
        process.env.RAZORPAY_KEY_SECRET!,
      )
    )
      throw new HttpError(400, "The payment signature is not valid.");
    const payment = paymentSchema.parse(
      await api(`payments/${encodeURIComponent(input.razorpay_payment_id)}`),
    );
    if (payment.id !== input.razorpay_payment_id)
      throw new HttpError(409, "The payment reference does not match.");
    await reconcilePayment(db, round, payment);
  });
  return { message: "The provider confirmed the round payment." };
}
async function reconcileTransfer(
  db: PoolClient,
  round: PaymentRound,
  transfer: Transfer,
) {
  if (
    transfer.amount !== round.amount_cents ||
    transfer.currency !== "INR" ||
    transfer.recipient !== round.razorpay_account_id ||
    transfer.notes?.roundId !== round.id
  )
    throw new HttpError(
      409,
      "The provider transfer does not match this round. Contact support.",
    );
  await db.query("UPDATE rounds SET razorpay_transfer_id=$1 WHERE id=$2", [
    transfer.id,
    round.id,
  ]);
  if (transfer.status === "processed" && transfer.amount_reversed === 0) {
    await db.query(
      "UPDATE rounds SET status='paid' WHERE id=$1 AND status='completed'",
      [round.id],
    );
    await db.query(
      "INSERT INTO ledger(round_id,type,amount_cents,provider_ref) VALUES($1,'paid',$2,$3) ON CONFLICT(provider_ref) DO NOTHING",
      [round.id, transfer.amount, transfer.id],
    );
  }
  if (transfer.amount_reversed > 0) {
    const {
      rows: [totals],
    } = await db.query(
      "SELECT COALESCE(SUM(amount_cents),0)::integer total FROM ledger WHERE round_id=$1 AND type='reversed'",
      [round.id],
    );
    const delta = transfer.amount_reversed - totals.total;
    if (delta > 0)
      await db.query(
        "INSERT INTO ledger(round_id,type,amount_cents,provider_ref) VALUES($1,'reversed',$2,$3) ON CONFLICT(provider_ref) DO NOTHING",
        [
          round.id,
          delta,
          `${transfer.id}-reversed-${transfer.amount_reversed}`,
        ],
      );
    await db.query(
      "UPDATE rounds SET status='disputed' WHERE id=$1 AND status<>'cancelled'",
      [round.id],
    );
  }
  if (transfer.status === "failed")
    await db.query(
      "INSERT INTO audit_events(action,resource_id) VALUES('razorpay_transfer_failed',$1)",
      [round.id],
    );
}
export async function releaseRazorpayRound(user: User, roundId: string) {
  requireReady();
  return transaction(async (db) => {
    const {
      rows: [round],
    } = await db.query<PaymentRound>(
      "SELECT r.*,u.razorpay_account_id,u.razorpay_ready FROM rounds r JOIN users u ON u.id=r.candidate_id WHERE r.id=$1 AND (r.employer_id=$2 OR r.candidate_id=$2) FOR UPDATE OF r",
      [roundId, user.id],
    );
    if (!round) throw new HttpError(404, "The round does not exist.");
    selectedProvider(round);
    if (round.status === "paid")
      return { message: "The candidate payment is already released." };
    if (
      round.status !== "completed" ||
      !round.employer_confirmed ||
      !round.candidate_confirmed ||
      !round.razorpay_payment_id
    )
      throw new HttpError(
        409,
        "Both people must confirm a funded round before payment release.",
      );
    const {
      rows: [dispute],
    } = await db.query(
      "SELECT id FROM disputes WHERE round_id=$1 AND status='open'",
      [round.id],
    );
    if (dispute)
      throw new HttpError(409, "Resolve the dispute before payment release.");
    await readyCandidate(round);
    const payment = paymentSchema.parse(
      await api(`payments/${encodeURIComponent(round.razorpay_payment_id)}`),
    );
    if (
      payment.status !== "captured" ||
      payment.amount_refunded > 0 ||
      payment.order_id !== round.razorpay_order_id ||
      payment.amount !== round.amount_cents + round.fee_cents ||
      payment.currency !== "INR"
    )
      throw new HttpError(
        409,
        "The provider payment needs review before release. Contact support.",
      );
    let transfer;
    if (round.razorpay_transfer_id)
      transfer = transferSchema.parse(
        await api(
          `transfers/${encodeURIComponent(round.razorpay_transfer_id)}`,
        ),
      );
    else {
      const body = round.razorpay_release_body ?? {
        account: round.razorpay_account_id,
        amount: round.amount_cents,
        currency: "INR",
        notes: { roundId: round.id, paymentId: round.razorpay_payment_id },
      };
      await db.query("UPDATE rounds SET razorpay_release_body=$1 WHERE id=$2", [
        JSON.stringify(body),
        round.id,
      ]);
      transfer = transferSchema.parse(
        await api("transfers", body, { "X-Transfer-Idempotency": round.id }),
      );
    }
    await reconcileTransfer(db, round, transfer);
    await db.query(
      "INSERT INTO audit_events(actor_id,action,resource_id) VALUES($1,'razorpay_release',$2)",
      [user.id, round.id],
    );
    return {
      message:
        transfer.status === "processed"
          ? "Payment released to the candidate account. Bank settlement follows the provider schedule."
          : transfer.status === "failed"
            ? "The provider transfer failed. Contact support to review it."
            : "The provider accepted the transfer. Confirmation will update the workspace.",
    };
  });
}
const eventSchema = z.object({
  event: z.string(),
  account_id: z.string().optional(),
  payload: z.record(
    z.string(),
    z.object({ entity: z.record(z.string(), z.unknown()) }),
  ),
});
export async function processRazorpayWebhook(
  raw: string,
  signature: string,
  eventId: string,
) {
  requireWebhookReady();
  if (
    !/^[A-Za-z0-9_-]{1,160}$/.test(eventId) ||
    !validSignature(raw, signature, process.env.RAZORPAY_WEBHOOK_SECRET!)
  )
    throw new HttpError(
      400,
      "The webhook signature or event reference is not valid.",
    );
  const event = eventSchema.parse(JSON.parse(raw));
  await transaction(async (db) => {
    const inserted = await db.query(
      "INSERT INTO razorpay_events(id,type) VALUES($1,$2) ON CONFLICT(id) DO NOTHING RETURNING id",
      [eventId, event.event],
    );
    if (!inserted.rowCount) return;
    const entity = event.payload.payment?.entity;
    const paymentId =
      entity?.id ??
      event.payload.refund?.entity.payment_id ??
      event.payload.dispute?.entity.payment_id;
    if (
      [
        "payment.captured",
        "order.paid",
        "refund.processed",
        "payment.dispute.created",
        "payment.dispute.lost",
        "payment.dispute.won",
        "payment.failed",
      ].includes(event.event) &&
      typeof paymentId === "string"
    ) {
      const payment = paymentSchema.parse(
        await api(`payments/${encodeURIComponent(paymentId)}`),
      );
      let {
        rows: [round],
      } = await db.query<PaymentRound>(
        "SELECT * FROM rounds WHERE razorpay_order_id=$1 FOR UPDATE",
        [payment.order_id],
      );
      if (!round) {
        const order = orderSchema.parse(
          await api(`orders/${encodeURIComponent(payment.order_id)}`),
        );
        if (!order.receipt || !z.uuid().safeParse(order.receipt).success)
          return;
        ({
          rows: [round],
        } = await db.query<PaymentRound>(
          "SELECT * FROM rounds WHERE id=$1 FOR UPDATE",
          [order.receipt],
        ));
        if (!round) return;
        selectedProvider(round);
        if (
          round.razorpay_order_id ||
          order.amount !== round.amount_cents + round.fee_cents ||
          order.currency !== "INR"
        )
          throw new Error("The local order reference needs operator review.");
        await db.query("UPDATE rounds SET razorpay_order_id=$1 WHERE id=$2", [
          order.id,
          round.id,
        ]);
        round = { ...round, razorpay_order_id: order.id };
      }
      if (event.event === "payment.failed" && !round.razorpay_payment_id)
        return;
      await reconcilePayment(db, round, payment);
      if (
        event.event.startsWith("payment.dispute.") ||
        event.event === "payment.failed"
      ) {
        await db.query(
          "UPDATE rounds SET status='disputed' WHERE id=$1 AND status<>'cancelled'",
          [round.id],
        );
        await db.query(
          "INSERT INTO audit_events(action,resource_id) VALUES('razorpay_payment_review',$1)",
          [round.id],
        );
      }
    }
    if (
      event.event.startsWith("transfer.") &&
      typeof event.payload.transfer?.entity.id === "string"
    ) {
      const transfer = transferSchema.parse(
        await api(
          `transfers/${encodeURIComponent(event.payload.transfer.entity.id)}`,
        ),
      );
      if (
        !transfer.notes?.roundId ||
        !z.uuid().safeParse(transfer.notes.roundId).success
      )
        return;
      const {
        rows: [round],
      } = await db.query<PaymentRound>(
        "SELECT r.*,u.razorpay_account_id FROM rounds r JOIN users u ON u.id=r.candidate_id WHERE r.id=$1 FOR UPDATE OF r",
        [transfer.notes.roundId],
      );
      if (!round) throw new Error("The transfer references an unknown round.");
      selectedProvider(round);
      if (
        !round.razorpay_release_body &&
        round.razorpay_transfer_id !== transfer.id &&
        (!round.employer_confirmed ||
          !round.candidate_confirmed ||
          transfer.notes.paymentId !== round.razorpay_payment_id ||
          !["completed", "disputed", "cancelled"].includes(round.status))
      )
        throw new Error(
          "The local transfer request needs reconciliation. Retry the event.",
        );
      await reconcileTransfer(db, round, transfer);
    }
  });
}
