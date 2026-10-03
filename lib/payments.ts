import Stripe from "stripe";
import type { PoolClient } from "pg";
import { query, transaction } from "./db";
import { HttpError, requireRole } from "./security";
import type { User } from "./domain";

let client: Stripe | undefined;
interface PaymentRound {
  id: string;
  amount_cents: number;
  fee_cents: number;
  transfer_id?: string | null;
}
function stripeCredentialsReady() {
  return Boolean(
    process.env.STRIPE_SECRET_KEY &&
    (process.env.NODE_ENV !== "production" ||
      process.env.STRIPE_SECRET_KEY.startsWith("sk_live_")),
  );
}
function configuredStripe() {
  if (!stripeCredentialsReady())
    throw new HttpError(503, "Payments are not configured. Contact support.");
  client ??= new Stripe(process.env.STRIPE_SECRET_KEY!, {
    timeout: 15000,
    maxNetworkRetries: 2,
  });
  return client;
}
export function stripeActionReady() {
  const country = process.env.STRIPE_PLATFORM_COUNTRY ?? "";
  const approved =
    process.env.NODE_ENV !== "production" ||
    (/^[A-Z]{2}$/.test(country) &&
      country !== "IN" &&
      process.env.STRIPE_FUNDS_FLOW_APPROVED === "true");
  return Boolean(
    stripeCredentialsReady() &&
    process.env.LIVE_PAYMENTS_ENABLED === "true" &&
    approved,
  );
}
export function stripe() {
  if (!stripeActionReady())
    throw new HttpError(503, "Payments are not configured. Contact support.");
  return configuredStripe();
}
export function stripeWebhookReady() {
  return Boolean(stripeCredentialsReady() && process.env.STRIPE_WEBHOOK_SECRET);
}
export function stripeWebhookClient() {
  if (!stripeWebhookReady())
    throw new HttpError(503, "Payments are not configured. Contact support.");
  return configuredStripe();
}
export async function connectAccount(user: User) {
  requireRole(user, "candidate");
  if (!user.verified)
    throw new HttpError(403, "Verify your email before you set up payments.");
  const countries = (process.env.STRIPE_CONNECT_COUNTRIES ?? "")
    .split(",")
    .map((country) => country.trim().toUpperCase())
    .filter(Boolean);
  if (!countries.includes(user.country))
    throw new HttpError(400, "Payments are not available in your country.");
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
      "SELECT r.*,u.connect_ready,u.connect_id FROM rounds r JOIN users u ON u.id=r.candidate_id WHERE r.id=$1 AND r.employer_id=$2 FOR UPDATE OF r",
      [roundId, user.id],
    );
    if (!round) throw new HttpError(404, "The round does not exist.");
    if (
      (round.currency ?? "USD") !== "USD" ||
      (round.payment_provider ?? "stripe") !== "stripe"
    )
      throw new HttpError(
        409,
        "Use the payment provider selected for this round.",
      );
    if (round.status !== "accepted")
      throw new HttpError(
        409,
        "The candidate must accept the round before you fund it.",
      );
    const provider = stripe();
    if (!round.connect_id || !(await accountReady(round.connect_id)))
      throw new HttpError(
        409,
        "The candidate must finish payment setup before you fund this round.",
      );
    if (round.checkout_id) {
      const existing = await provider.checkout.sessions.retrieve(
        round.checkout_id,
      );
      if (existing.status === "open" && existing.url)
        return { url: existing.url };
      if (existing.status === "complete") {
        const intentId =
          typeof existing.payment_intent === "string"
            ? existing.payment_intent
            : existing.payment_intent?.id;
        const intent = intentId
          ? await provider.paymentIntents.retrieve(intentId)
          : null;
        if (
          !intent ||
          !["requires_payment_method", "canceled"].includes(intent.status)
        )
          throw new HttpError(
            409,
            "The payment awaits confirmation. Refresh the workspace shortly.",
          );
      }
    }
    const generation = round.checkout_id ?? "first";
    const session = await provider.checkout.sessions.create(
      {
        mode: "payment",
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
      (round.currency ?? "USD") !== "USD" ||
      (round.payment_provider ?? "stripe") !== "stripe"
    )
      throw new HttpError(
        409,
        "Use the payment provider selected for this round.",
      );
    if (
      round.status !== "completed" ||
      !round.employer_confirmed ||
      !round.candidate_confirmed
    )
      throw new HttpError(
        409,
        "Both people must confirm the completed round before payment release.",
      );
    const provider = stripe();
    if (
      !round.charge_id ||
      !round.connect_id ||
      !(await accountReady(round.connect_id))
    )
      throw new HttpError(
        409,
        "The payment or candidate account is not ready. Try again later.",
      );
    const charge = await provider.charges.retrieve(round.charge_id);
    if (
      !charge.paid ||
      !charge.captured ||
      charge.amount_refunded > 0 ||
      (await hasPaymentDispute(charge))
    )
      throw new HttpError(
        409,
        "This payment needs review before release. Contact support.",
      );
    const {
      rows: [openDispute],
    } = await db.query(
      "SELECT id FROM disputes WHERE round_id=$1 AND status='open'",
      [round.id],
    );
    if (openDispute)
      throw new HttpError(409, "Resolve the dispute before payment release.");
    const existingTransfers = await provider.transfers.list({
      transfer_group: round.id,
      limit: 100,
    });
    if (existingTransfers.has_more || existingTransfers.data.length > 1)
      throw new HttpError(409, "This transfer needs review. Contact support.");
    const existingTransfer = existingTransfers.data[0];
    if (
      existingTransfer &&
      (existingTransfer.amount !== round.amount_cents ||
        existingTransfer.currency !== "usd" ||
        existingTransfer.destination !== round.connect_id ||
        existingTransfer.source_transaction !== round.charge_id ||
        existingTransfer.amount_reversed > 0)
    )
      throw new HttpError(
        409,
        "The provider transfer does not match this round. Contact support.",
      );
    const transfer =
      existingTransfer ??
      (await provider.transfers.create(
        {
          amount: round.amount_cents,
          currency: "usd",
          destination: round.connect_id,
          source_transaction: round.charge_id,
          transfer_group: round.id,
          metadata: { roundId: round.id },
        },
        { idempotencyKey: `release-${round.id}` },
      ));
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
async function accountReady(id: string) {
  const account = await configuredStripe().accounts.retrieve(id);
  const ready = Boolean(
    account.details_submitted &&
    account.payouts_enabled &&
    account.capabilities?.transfers === "active",
  );
  return ready;
}
async function hasPaymentDispute(charge: Stripe.Charge) {
  if (!charge.disputed) return false;
  const disputes = await configuredStripe().disputes.list({
    charge: charge.id,
    limit: 100,
  });
  return (
    disputes.has_more ||
    disputes.data.some(
      (dispute) =>
        !["won", "warning_closed", "prevented"].includes(dispute.status),
    )
  );
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
    (round.currency ?? "USD") !== "USD" ||
    (round.payment_provider ?? "stripe") !== "stripe"
  )
    throw new Error("The payment provider does not match the round.");
  if (
    session.currency !== "usd" ||
    session.amount_total !== round.amount_cents + round.fee_cents
  )
    throw new Error("The payment amount does not match the round.");
  if (round.payment_intent_id === session.payment_intent) return;
  if (round.status !== "accepted" || round.checkout_id !== session.id)
    throw new Error("The round cannot accept this checkout payment.");
  const intent = await configuredStripe().paymentIntents.retrieve(
    session.payment_intent,
  );
  const chargeId =
    typeof intent.latest_charge === "string"
      ? intent.latest_charge
      : intent.latest_charge?.id;
  if (intent.status !== "succeeded" || !chargeId)
    throw new Error("The payment has no captured charge.");
  if (
    intent.currency !== "usd" ||
    intent.amount !== session.amount_total ||
    intent.metadata.roundId !== round.id
  )
    throw new Error("The payment intent does not match the round.");
  const charge = await configuredStripe().charges.retrieve(chargeId);
  if (
    !charge.paid ||
    !charge.captured ||
    charge.currency !== "usd" ||
    charge.amount !== session.amount_total
  )
    throw new Error("The captured charge does not match the round.");
  await db.query(
    "UPDATE rounds SET status='funded',payment_intent_id=$1,charge_id=$2 WHERE id=$3",
    [intent.id, chargeId, round.id],
  );
  await db.query(
    "INSERT INTO ledger(round_id,type,amount_cents,provider_ref) VALUES($1,'funded',$2,$3) ON CONFLICT(provider_ref) DO NOTHING",
    [round.id, session.amount_total, intent.id],
  );
  if (charge.amount_refunded > 0)
    await recordRefund(db, { ...round, charge_id: chargeId }, charge);
  else if (await hasPaymentDispute(charge))
    await db.query("UPDATE rounds SET status='disputed' WHERE id=$1", [
      round.id,
    ]);
}
async function chargeRound(db: PoolClient, charge: Stripe.Charge) {
  const {
    rows: [round],
  } = await db.query("SELECT * FROM rounds WHERE charge_id=$1 FOR UPDATE", [
    charge.id,
  ]);
  if (round) return round;
  const intentId =
    typeof charge.payment_intent === "string"
      ? charge.payment_intent
      : charge.payment_intent?.id;
  if (!intentId) return null;
  const intent = await configuredStripe().paymentIntents.retrieve(intentId);
  const roundId = intent.metadata?.roundId;
  if (!roundId || !/^[a-f0-9-]{36}$/i.test(roundId)) return null;
  const {
    rows: [pending],
  } = await db.query("SELECT id,charge_id FROM rounds WHERE id=$1", [roundId]);
  if (pending?.charge_id && pending.charge_id !== charge.id) return null;
  if (pending)
    throw new Error(
      "Funding must complete before this payment event. Retry the event.",
    );
  return null;
}
async function ledgerTotals(db: PoolClient, id: string) {
  const {
    rows: [totals],
  } = await db.query(
    "SELECT COALESCE(SUM(amount_cents) FILTER (WHERE type='refunded'),0)::integer AS refunded,COALESCE(SUM(amount_cents) FILTER (WHERE type='reversed'),0)::integer AS reversed FROM ledger WHERE round_id=$1",
    [id],
  );
  return totals;
}
async function reconcileTransfer(db: PoolClient, round: PaymentRound) {
  if (!round.transfer_id) return 0;
  const transfer = await configuredStripe().transfers.retrieve(
    round.transfer_id,
  );
  const totals = await ledgerTotals(db, round.id);
  const delta = transfer.amount_reversed - totals.reversed;
  if (delta > 0)
    await db.query(
      "INSERT INTO ledger(round_id,type,amount_cents,provider_ref) VALUES($1,'reversed',$2,$3) ON CONFLICT(provider_ref) DO NOTHING",
      [round.id, delta, `${transfer.id}-reversed-${transfer.amount_reversed}`],
    );
  return Math.max(totals.reversed, transfer.amount_reversed);
}
async function reverseTo(
  db: PoolClient,
  round: PaymentRound,
  target: number,
  key: string,
) {
  if (!round.transfer_id) return true;
  const reversed = await reconcileTransfer(db, round);
  const delta = Math.min(round.amount_cents, target) - reversed;
  if (delta <= 0) return true;
  let reversal;
  try {
    reversal = await configuredStripe().transfers.createReversal(
      round.transfer_id,
      { amount: delta },
      { idempotencyKey: key },
    );
  } catch {
    await db.query(
      "INSERT INTO audit_events(action,resource_id) VALUES('transfer_reversal_pending',$1)",
      [round.id],
    );
    return false;
  }
  await db.query(
    "INSERT INTO ledger(round_id,type,amount_cents,provider_ref) VALUES($1,'reversed',$2,$3) ON CONFLICT(provider_ref) DO NOTHING",
    [round.id, reversal.amount, reversal.id],
  );
  return true;
}
async function recordRefund(
  db: PoolClient,
  round: PaymentRound,
  charge: Stripe.Charge,
) {
  if (charge.amount_refunded <= 0) return true;
  if (charge.amount_refunded > round.amount_cents + round.fee_cents)
    throw new Error("The refund exceeds the round payment.");
  const totals = await ledgerTotals(db, round.id);
  const delta = charge.amount_refunded - totals.refunded;
  if (delta > 0) {
    await db.query("UPDATE rounds SET status=$1 WHERE id=$2", [
      charge.refunded ? "cancelled" : "disputed",
      round.id,
    ]);
    await db.query(
      "INSERT INTO ledger(round_id,type,amount_cents,provider_ref) VALUES($1,'refunded',$2,$3) ON CONFLICT(provider_ref) DO NOTHING",
      [round.id, delta, `${charge.id}-${charge.amount_refunded}`],
    );
  }
  return reverseTo(
    db,
    round,
    Math.max(charge.amount_refunded, totals.refunded),
    `refund-reversal-${charge.id}-${Math.max(charge.amount_refunded, totals.refunded)}`,
  );
}
export async function processWebhook(event: Stripe.Event) {
  const retry = await transaction(async (db) => {
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
      const ready = await accountReady(account.id);
      await db.query("UPDATE users SET connect_ready=$1 WHERE connect_id=$2", [
        ready,
        account.id,
      ]);
    }
    if (event.type.startsWith("charge.dispute.")) {
      const dispute = await configuredStripe().disputes.retrieve(
        (event.data.object as Stripe.Dispute).id,
      );
      const chargeId =
        typeof dispute.charge === "string" ? dispute.charge : dispute.charge.id;
      const charge = await configuredStripe().charges.retrieve(chargeId);
      const round = await chargeRound(db, charge);
      if (round) {
        const {
          rows: [manual],
        } = await db.query(
          "SELECT id FROM disputes WHERE round_id=$1 AND status='open'",
          [round.id],
        );
        const totals = await ledgerTotals(db, round.id);
        const blocked =
          manual ||
          totals.refunded > 0 ||
          totals.reversed > 0 ||
          (await hasPaymentDispute(charge));
        const status = blocked
          ? charge.refunded
            ? "cancelled"
            : "disputed"
          : round.transfer_id
            ? "paid"
            : round.employer_confirmed && round.candidate_confirmed
              ? "completed"
              : "funded";
        await db.query("UPDATE rounds SET status=$1 WHERE id=$2", [
          status,
          round.id,
        ]);
        await db.query(
          "INSERT INTO ledger(round_id,type,amount_cents,provider_ref) VALUES($1,'disputed',$2,$3) ON CONFLICT(provider_ref) DO NOTHING",
          [round.id, dispute.amount, dispute.id],
        );
        if (dispute.status === "lost") {
          if (
            !(await reverseTo(
              db,
              round,
              dispute.amount + totals.refunded,
              `dispute-reversal-${dispute.id}`,
            ))
          ) {
            await db.query("DELETE FROM webhook_events WHERE id=$1", [
              event.id,
            ]);
            return true;
          }
        }
      }
    }
    if (event.type === "charge.refunded") {
      const charge = event.data.object as Stripe.Charge;
      const round = await chargeRound(db, charge);
      if (!round) return;
      if (!(await recordRefund(db, round, charge))) {
        await db.query("DELETE FROM webhook_events WHERE id=$1", [event.id]);
        return true;
      }
    }
    if (event.type === "transfer.reversed") {
      const transfer = event.data.object as Stripe.Transfer;
      const {
        rows: [round],
      } = await db.query(
        "SELECT * FROM rounds WHERE transfer_id=$1 FOR UPDATE",
        [transfer.id],
      );
      if (round && (await reconcileTransfer(db, round)) > 0)
        await db.query(
          "UPDATE rounds SET status='disputed' WHERE id=$1 AND status <> 'cancelled'",
          [round.id],
        );
    }
    if (event.type === "charge.failed") {
      const charge = event.data.object as Stripe.Charge;
      const round = await chargeRound(db, charge);
      if (round) {
        await db.query("UPDATE rounds SET status='disputed' WHERE id=$1", [
          round.id,
        ]);
        if (
          !(await reverseTo(
            db,
            round,
            round.amount_cents,
            `failed-reversal-${charge.id}`,
          ))
        ) {
          await db.query("DELETE FROM webhook_events WHERE id=$1", [event.id]);
          return true;
        }
      }
    }
    if (event.type === "checkout.session.async_payment_failed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const {
        rows: [round],
      } = await db.query(
        "SELECT id FROM rounds WHERE checkout_id=$1 FOR UPDATE",
        [session.id],
      );
      if (round)
        await db.query(
          "INSERT INTO audit_events(action,resource_id) VALUES('checkout_payment_failed',$1)",
          [round.id],
        );
    }
  });
  if (retry)
    throw new Error(
      "The transfer reversal needs a retry. Review the provider balance.",
    );
}
