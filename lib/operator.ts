import { cookies } from "next/headers";
import { z } from "zod";
import { query, transaction } from "./db";
import type { User } from "./domain";
import { HttpError, sessionUser, tokenHash } from "./security";

export const operatorKinds = ["dispute", "repair"] as const;
export const operatorStatuses = [
  "open",
  "in_review",
  "waiting_provider",
  "closed",
] as const;
export const operatorDecisions = [
  "pending",
  "needs_information",
  "provider_review",
  "no_action",
] as const;
export type OperatorKind = (typeof operatorKinds)[number];
export type OperatorStatus = (typeof operatorStatuses)[number];
export type OperatorDecision = (typeof operatorDecisions)[number];

export interface OperatorCase {
  id: string;
  kind: OperatorKind;
  roundId: string;
  title: string;
  source: string;
  roundStatus: string;
  paymentProvider: string;
  amountCents: number;
  currency: string;
  createdAt: string;
  status: OperatorStatus;
  decision: OperatorDecision;
  ownerId: string | null;
  version: number;
}
export interface OperatorNote {
  id: string;
  actorId: string;
  actorName: string;
  actorEmail: string;
  note: string;
  status: OperatorStatus;
  decision: OperatorDecision;
  createdAt: string;
}

// The server allowlist is the only grant of operator access.
export function isOperator(user: User) {
  if (!user.verified) return false;
  const addresses = (process.env.OPERATOR_EMAILS ?? "")
    .split(/[,\n]/)
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  if (
    !addresses.length ||
    addresses.length > 50 ||
    addresses.some((email) => !z.email().max(254).safeParse(email).success)
  )
    return false;
  return addresses.includes(user.email.toLowerCase());
}

export async function requireOperator() {
  if (!process.env.DATABASE_URL)
    throw new HttpError(503, "Operator access is not available.");
  const user = await sessionUser();
  if (!isOperator(user))
    throw new HttpError(403, "Your account does not have operator access.");
  return user;
}

const kindSchema = z.enum(operatorKinds);
const cursorSchema = z.strictObject({
  createdAt: z.iso.datetime(),
  kind: kindSchema,
  id: z.uuid(),
});
const noteCursorSchema = cursorSchema.omit({ kind: true });

function pagination(url: URL) {
  const rawLimit = url.searchParams.get("limit") ?? "25";
  if (!/^\d{1,2}$/.test(rawLimit))
    throw new HttpError(400, "Use a page limit from 1 to 50.");
  const limit = Number(rawLimit);
  if (limit < 1 || limit > 50)
    throw new HttpError(400, "Use a page limit from 1 to 50.");
  return { limit, cursor: url.searchParams.get("cursor") };
}

function decodeCursor<T>(raw: string | null, schema: z.ZodType<T>) {
  if (raw === null) return null;
  try {
    if (raw.length > 600 || !/^[A-Za-z0-9_-]+$/.test(raw)) throw new Error();
    return schema.parse(
      JSON.parse(Buffer.from(raw, "base64url").toString("utf8")),
    );
  } catch {
    throw new HttpError(400, "The page cursor is not valid.");
  }
}

function encodeCursor(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

// Each repair case refers to an original signal. Review cannot change that signal.
const sources = `WITH sources AS (
  SELECT d.id,'dispute'::text AS kind,d.round_id,d.created_at,
    'participant_dispute'::text AS source,d.reason
  FROM disputes d
  UNION ALL
  SELECT a.id,'repair',r.id,a.created_at,a.action,NULL::text
  FROM audit_events a JOIN rounds r ON a.resource_id=r.id::text
  WHERE a.action IN ('transfer_reversal_pending','checkout_payment_failed',
    'razorpay_reversal_review','razorpay_transfer_failed','razorpay_payment_review')
  UNION ALL
  SELECT r.id,'repair',r.id,r.created_at,'provider_state_review',NULL::text
  FROM rounds r WHERE r.status='disputed'
    AND NOT EXISTS (SELECT 1 FROM disputes d WHERE d.round_id=r.id)
), queue AS (
  SELECT s.*,r.title,r.status AS round_status,r.payment_provider,
    r.amount_cents,r.currency,COALESCE(c.status,'open') AS review_status,
    COALESCE(c.decision,'pending') AS decision,c.owner_id,
    COALESCE(c.version,0) AS version,c.id AS case_id
  FROM sources s JOIN rounds r ON r.id=s.round_id
  LEFT JOIN operator_cases c ON c.kind=s.kind AND c.source_id=s.id
)`;
const caseFields = `id,kind,round_id AS "roundId",title,source,
  round_status AS "roundStatus",payment_provider AS "paymentProvider",
  amount_cents AS "amountCents",currency,
  to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "createdAt",
  review_status AS status,decision,owner_id AS "ownerId",version`;

export async function operatorCaseQueue(url: URL) {
  const { limit, cursor: rawCursor } = pagination(url);
  const cursor = decodeCursor(rawCursor, cursorSchema);
  const kind = z
    .enum(["all", ...operatorKinds])
    .parse(url.searchParams.get("kind") ?? "all");
  const status = z
    .enum(["all", ...operatorStatuses])
    .parse(url.searchParams.get("status") ?? "all");
  const rows = await query<OperatorCase>(
    `${sources} SELECT ${caseFields} FROM queue
     WHERE ($1='all' OR kind=$1) AND ($2='all' OR review_status=$2)
       AND ($3::timestamptz IS NULL OR (created_at,kind,id)<($3::timestamptz,$4::text,$5::uuid))
     ORDER BY created_at DESC,kind DESC,id DESC LIMIT $6`,
    [
      kind,
      status,
      cursor?.createdAt ?? null,
      cursor?.kind ?? null,
      cursor?.id ?? null,
      limit + 1,
    ],
  );
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return {
    items,
    nextCursor:
      rows.length > limit && last
        ? encodeCursor({
            createdAt: last.createdAt,
            kind: last.kind,
            id: last.id,
          })
        : null,
  };
}

export function operatorCaseKey(kind: string, id: string) {
  return { kind: kindSchema.parse(kind), id: z.uuid().parse(id) };
}

async function caseRecord(kind: OperatorKind, id: string) {
  const [record] = await query<OperatorCase & { reason: string | null }>(
    `${sources} SELECT ${caseFields},reason FROM queue WHERE kind=$1 AND id=$2`,
    [kind, id],
  );
  if (!record) throw new HttpError(404, "The operator case does not exist.");
  return record;
}

export async function operatorCaseDetail(
  kind: OperatorKind,
  id: string,
  url: URL,
) {
  const record = await caseRecord(kind, id);
  const { limit, cursor: rawCursor } = pagination(url);
  const cursor = decodeCursor(rawCursor, noteCursorSchema);
  const rows = await query<OperatorNote>(
    `SELECT e.id,e.actor_id AS "actorId",e.actor_name AS "actorName",
       e.actor_email AS "actorEmail",e.note,e.status,e.decision,
       to_char(e.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "createdAt"
     FROM operator_case_events e JOIN operator_cases c ON c.id=e.case_id
     WHERE c.kind=$1 AND c.source_id=$2
       AND ($3::timestamptz IS NULL OR (e.created_at,e.id)<($3::timestamptz,$4::uuid))
     ORDER BY e.created_at DESC,e.id DESC LIMIT $5`,
    [kind, id, cursor?.createdAt ?? null, cursor?.id ?? null, limit + 1],
  );
  const notes = rows.slice(0, limit);
  const last = notes.at(-1);
  return {
    case: record,
    notes,
    nextCursor:
      rows.length > limit && last
        ? encodeCursor({ createdAt: last.createdAt, id: last.id })
        : null,
  };
}

const reviewSchema = z
  .strictObject({
    note: z.string().trim().min(10).max(3000),
    status: z.enum(operatorStatuses),
    decision: z.enum(operatorDecisions),
    expectedVersion: z.number().int().min(0).max(2147483646),
  })
  .refine(
    ({ status, decision }) =>
      (status === "closed" && decision === "no_action") ||
      (status === "waiting_provider" && decision === "provider_review") ||
      (["open", "in_review"].includes(status) &&
        ["pending", "needs_information"].includes(decision)),
  );

export async function reviewOperatorCase(
  user: User,
  kind: OperatorKind,
  id: string,
  body: unknown,
) {
  const input = reviewSchema.parse(body);
  const token = (await cookies()).get("fs_session")?.value;
  await transaction(async (db) => {
    const {
      rows: [actor],
    } = await db.query<User>(
      `SELECT u.id,u.name,u.email,u.email_verified AS verified
       FROM users u JOIN sessions s ON s.user_id=u.id
       WHERE u.id=$1 AND s.token_hash=$2 AND s.expires_at>now() FOR UPDATE OF u,s`,
      [user.id, tokenHash(token ?? "")],
    );
    if (!actor)
      throw new HttpError(401, "Your session expired. Sign in again.");
    if (!isOperator(actor))
      throw new HttpError(403, "Your account does not have operator access.");
    // This lock also serializes the first review of a source without a case row.
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      `operator:${kind}:${id}`,
    ]);
    const {
      rows: [source],
    } = await db.query<{ round_id: string }>(
      `${sources} SELECT round_id FROM queue WHERE kind=$1 AND id=$2`,
      [kind, id],
    );
    if (!source) throw new HttpError(404, "The operator case does not exist.");
    const {
      rows: [current],
    } = await db.query<{ id: string; version: number }>(
      "SELECT id,version FROM operator_cases WHERE kind=$1 AND source_id=$2 FOR UPDATE",
      [kind, id],
    );
    if ((current?.version ?? 0) !== input.expectedVersion)
      throw new HttpError(
        409,
        "This case changed. Refresh it before you save.",
      );
    const {
      rows: [saved],
    } = await db.query<{ id: string; version: number }>(
      `INSERT INTO operator_cases(kind,source_id,round_id,status,decision,owner_id,version)
       VALUES($1,$2,$3,$4,$5,$6,1)
       ON CONFLICT(kind,source_id) DO UPDATE SET status=$4,decision=$5,owner_id=$6,
         version=operator_cases.version+1,updated_at=now() RETURNING id,version`,
      [kind, id, source.round_id, input.status, input.decision, actor.id],
    );
    await db.query(
      `INSERT INTO operator_case_events(case_id,actor_id,actor_name,actor_email,note,status,decision,version)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        saved.id,
        actor.id,
        actor.name,
        actor.email,
        input.note,
        input.status,
        input.decision,
        saved.version,
      ],
    );
    await db.query(
      "INSERT INTO audit_events(actor_id,action,resource_id) VALUES($1,'operator_case_review',$2)",
      [actor.id, saved.id],
    );
  });
  return {
    message: "Review saved. Payment and dispute records retain their state.",
    case: await caseRecord(kind, id),
  };
}

export async function operatorHealth() {
  const [counts] = await query<{
    openDisputes: number;
    disputedRounds: number;
    repairSignals: number;
    unreviewedCases: number;
    waitingProviderCases: number;
  }>(
    `${sources} SELECT
      (SELECT count(*)::int FROM disputes WHERE status='open') AS "openDisputes",
      (SELECT count(*)::int FROM rounds WHERE status='disputed') AS "disputedRounds",
      count(*) FILTER (WHERE kind='repair')::int AS "repairSignals",
      count(*) FILTER (WHERE version=0)::int AS "unreviewedCases",
      count(*) FILTER (WHERE review_status='waiting_provider')::int AS "waitingProviderCases"
    FROM queue`,
  );
  const [events] = await query<{
    stripeLastAt: Date | null;
    razorpayLastAt: Date | null;
  }>(
    `SELECT (SELECT max(created_at) FROM webhook_events) AS "stripeLastAt",
       (SELECT max(created_at) FROM razorpay_events) AS "razorpayLastAt"`,
  );
  const [maintenance] = await query<{
    status: "completed" | "failed";
    counts: Record<string, number>;
    startedAt: Date;
    finishedAt: Date;
  }>(
    `SELECT status,counts,started_at AS "startedAt",finished_at AS "finishedAt"
     FROM operation_runs WHERE job='expired_auth_cleanup'
     ORDER BY finished_at DESC,id DESC LIMIT 1`,
  );
  return {
    counts,
    providerEvents: events,
    maintenance: maintenance ?? null,
    financialActionsEnabled: false,
  };
}
