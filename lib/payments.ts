import Stripe from "stripe";
import type { PoolClient } from "pg";
import { query, transaction } from "./db";
import { HttpError, requireRole } from "./security";
import type { User } from "./domain";

let client: Stripe | undefined;
export function stripe() {
  if (
    process.env.LIVE_PAYMENTS_ENABLED !== "true" ||
    !process.env.STRIPE_SECRET_KEY
  )
    throw new HttpError(503, "Payments are not active. No money will move.");
  client ??= new Stripe(process.env.STRIPE_SECRET_KEY, {
    timeout: 15000,
    maxNetworkRetries: 2,
  });
  return client;
}
export async function connectAccount(user: User) {
  requireRole(user, "candidate");
  if (!user.verified)
    throw new HttpError(403, "Verify your email before you set up payments.");
  const countries = (process.env.STRIPE_CONNECT_COUNTRIES ?? "").split(",");
  if (!countries.includes(user.country))
    throw new HttpError(
      400,
      "Payments are not available in your country for this pilot.",
    );
  const provider = stripe();
  let id = user.connectId;
  if (!id) {
    const account = await provider.accounts.create(
      {
        type: "express",
        country: user.country,
        email: user.email,
        capabilities: { transfers: { requested: true } },
        metadata: { userId: user.id },
      },
      { idempotencyKey: `connect-${user.id}` },
    );
    id = account.id;
    await query("UPDATE users SET connect_id=$1 WHERE id=$2", [id, user.id]);
  }
  const link = await provider.accountLinks.create({
    account: id,
    type: "account_onboarding",
    return_url: `${process.env.APP_URL}/workspace/wallet?connected=1`,
    refresh_url: `${process.env.APP_URL}/workspace/wallet?retry=1`,
  });
  return { url: link.url };
}
export async function checkout(user: User, roundId: string) {
  requireRole(user, "employer");
  if (!user.verified)
    throw new HttpError(403, "Verify your email before you fund a round.");
  return transaction(async (db) => {
    const {
      rows: [round],
    } = await db.query(
      "SELECT r.*,u.connect_ready FROM rounds r JOIN users u ON u.id=r.candidate_id WHERE r.id=$1 AND r.employer_id=$2 FOR UPDATE OF r",
      [roundId, user.id],
    );
    if (!round) throw new HttpError(404, "The round does not exist.");
    if (round.status !== "accepted")
      throw new HttpError(
        409,
        "The candidate must accept the round before you fund it.",
      );
    if (!round.connect_ready)
      throw new HttpError(
        409,
        "The candidate must finish payment setup before you fund this round.",
      );
    const provider = stripe();
    if (round.checkout_id) {
      const existing = await provider.checkout.sessions.retrieve(
        round.checkout_id,
      );
      if (existing.status === "open" && existing.url)
        return { url: existing.url };
      if (existing.status === "complete")
        throw new HttpError(
          409,
          "The payment awaits confirmation. Refresh the workspace shortly.",
        );
    }
    const generation = round.checkout_id ?? "first";
    const session = await provider.checkout.sessions.create(
      {
        mode: "payment",
        payment_method_types: ["card"],
        customer_email: user.email,
        client_reference_id: round.id,
        metadata: { roundId: round.id },
        payment_intent_data: {
          transfer_group: round.id,
          metadata: { roundId: round.id },
        },
        line_items: [
          {
            price_data: {
              currency: "usd",
              unit_amount: round.amount_cents,
              product_data: { name: `${round.kind}: candidate pay` },
            },
            quantity: 1,
          },
          {
            price_data: {
              currency: "usd",
              unit_amount: round.fee_cents,
              product_data: { name: "Fairstage platform fee (8%)" },
            },
            quantity: 1,
          },
        ],
        success_url: `${process.env.APP_URL}/workspace/interviews?payment=received`,
        cancel_url: `${process.env.APP_URL}/workspace/interviews?payment=cancelled`,
      },
      { idempotencyKey: `checkout-${round.id}-${generation}` },
    );
    await db.query("UPDATE rounds SET checkout_id=$1 WHERE id=$2", [
      session.id,
      round.id,
    ]);
    return { url: session.url };
  });
}
export async function releaseRound(user: User, roundId: string) {
  return transaction(async (db) => {
    const {
      rows: [round],
    } = await db.query(
      "SELECT r.*,u.connect_id,u.connect_ready FROM rounds r JOIN users u ON u.id=r.candidate_id WHERE r.id=$1 AND (r.employer_id=$2 OR r.candidate_id=$2) FOR UPDATE OF r",
      [roundId, user.id],
    );
    if (!round) throw new HttpError(404, "The round does not exist.");
    if (round.status === "paid")
      return { message: "The candidate payment is already released." };
    if (
      round.status !== "completed" ||
      !round.employer_confirmed ||
      !round.candidate_confirmed
    )
      throw new HttpError(
        409,
        "Both people must confirm the completed round before payment release.",
      );
    if (!round.charge_id || !round.connect_ready || !round.connect_id)
      throw new HttpError(
        409,
        "The payment or candidate account is not ready. Try again later.",
      );
    const transfer = await stripe().transfers.create(
      {
        amount: round.amount_cents,
        currency: "usd",
        destination: round.connect_id,
        source_transaction: round.charge_id,
        transfer_group: round.id,
        metadata: { roundId: round.id },
      },
      { idempotencyKey: `release-${round.id}` },
    );
    await db.query(
      "UPDATE rounds SET status='paid',transfer_id=$1 WHERE id=$2",
      [transfer.id, round.id],
    );
    await db.query(
      "INSERT INTO ledger(round_id,type,amount_cents,provider_ref) VALUES($1,'paid',$2,$3) ON CONFLICT(provider_ref) DO NOTHING",
      [round.id, round.amount_cents, transfer.id],
    );
    await db.query(
      "INSERT INTO audit_events(actor_id,action,resource_id) VALUES($1,'release',$2)",
      [user.id, round.id],
    );
    return {
      message:
        "Payment released to the candidate's connected account. Bank settlement follows the provider schedule.",
    };
  });
}
async function processCheckout(
  db: PoolClient,
  session: Stripe.Checkout.Session,
) {
  if (
    session.payment_status !== "paid" ||
    !session.metadata?.roundId ||
    typeof session.payment_intent !== "string"
  )
    return;
  const {
    rows: [round],
  } = await db.query("SELECT * FROM rounds WHERE id=$1 FOR UPDATE", [
    session.metadata.roundId,
  ]);
  if (!round) throw new Error("The paid checkout references an unknown round.");
  if (
    session.currency !== "usd" ||
    session.amount_total !== round.amount_cents + round.fee_cents
  )
    throw new Error("The payment amount does not match the round.");
  if (round.payment_intent_id === session.payment_intent) return;
  if (round.status !== "accepted" || round.checkout_id !== session.id)
    throw new Error("The round cannot accept this checkout payment.");
  const intent = await stripe().paymentIntents.retrieve(session.payment_intent);
  if (intent.status !== "succeeded" || typeof intent.latest_charge !== "string")
    throw new Error("The payment has no captured charge.");
  await db.query(
    "UPDATE rounds SET status='funded',payment_intent_id=$1,charge_id=$2 WHERE id=$3",
    [intent.id, intent.latest_charge, round.id],
  );
  await db.query(
    "INSERT INTO ledger(round_id,type,amount_cents,provider_ref) VALUES($1,'funded',$2,$3) ON CONFLICT(provider_ref) DO NOTHING",
    [round.id, session.amount_total, intent.id],
  );
}
export async function processWebhook(event: Stripe.Event) {
  await transaction(async (db) => {
    const inserted = await db.query(
      "INSERT INTO webhook_events(id,type) VALUES($1,$2) ON CONFLICT(id) DO NOTHING RETURNING id",
      [event.id, event.type],
    );
    if (!inserted.rowCount) return;
    if (
      [
        "checkout.session.completed",
        "checkout.session.async_payment_succeeded",
      ].includes(event.type)
    )
      await processCheckout(db, event.data.object as Stripe.Checkout.Session);
    if (event.type === "account.updated") {
      const account = event.data.object as Stripe.Account;
      const ready =
        account.details_submitted &&
        account.payouts_enabled &&
        account.capabilities?.transfers === "active";
      await db.query("UPDATE users SET connect_ready=$1 WHERE connect_id=$2", [
        ready,
        account.id,
      ]);
    }
    if (event.type === "charge.dispute.created") {
      const dispute = event.data.object as Stripe.Dispute;
      const chargeId =
        typeof dispute.charge === "string" ? dispute.charge : dispute.charge.id;
      const {
        rows: [round],
      } = await db.query(
        "UPDATE rounds SET status='disputed' WHERE charge_id=$1 RETURNING id",
        [chargeId],
      );
      if (round)
        await db.query(
          "INSERT INTO ledger(round_id,type,amount_cents,provider_ref) VALUES($1,'disputed',$2,$3) ON CONFLICT(provider_ref) DO NOTHING",
          [round.id, dispute.amount, dispute.id],
        );
    }
    if (event.type === "charge.refunded") {
      const charge = event.data.object as Stripe.Charge;
      const {
        rows: [round],
      } = await db.query("SELECT * FROM rounds WHERE charge_id=$1 FOR UPDATE", [
        charge.id,
      ]);
      if (!round) return;
      if (charge.amount_refunded > 0) {
        const {
          rows: [totals],
        } = await db.query(
          "SELECT COALESCE(SUM(amount_cents) FILTER (WHERE type='refunded'),0)::integer AS refunded,COALESCE(SUM(amount_cents) FILTER (WHERE type='reversed'),0)::integer AS reversed FROM ledger WHERE round_id=$1",
          [round.id],
        );
        const refundDelta = charge.amount_refunded - totals.refunded;
        if (refundDelta <= 0) return;
        const reversalDelta =
          Math.min(round.amount_cents, charge.amount_refunded) -
          totals.reversed;
        if (round.transfer_id && reversalDelta > 0) {
          const amount = reversalDelta;
          const reversal = await stripe().transfers.createReversal(
            round.transfer_id,
            { amount },
            {
              idempotencyKey: `refund-reversal-${charge.id}-${charge.amount_refunded}`,
            },
          );
          await db.query(
            "INSERT INTO ledger(round_id,type,amount_cents,provider_ref) VALUES($1,'reversed',$2,$3) ON CONFLICT(provider_ref) DO NOTHING",
            [round.id, reversal.amount, reversal.id],
          );
        }
        await db.query("UPDATE rounds SET status=$1 WHERE id=$2", [
          charge.refunded ? "cancelled" : "disputed",
          round.id,
        ]);
        await db.query(
          "INSERT INTO ledger(round_id,type,amount_cents,provider_ref) VALUES($1,'refunded',$2,$3) ON CONFLICT(provider_ref) DO NOTHING",
          [round.id, refundDelta, `${charge.id}-${charge.amount_refunded}`],
        );
      }
    }
  });
}
