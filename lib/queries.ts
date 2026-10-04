export const roundSelect = `SELECT r.id,r.employer_id AS "employerId",r.candidate_id AS "candidateId",c.name AS "candidateName",c.email AS "candidateEmail",e.company,r.currency,r.payment_provider AS "paymentProvider",r.title,r.kind,r.minutes,r.amount_cents AS "amountCents",r.fee_cents AS "feeCents",r.scheduled_at AS "scheduledAt",r.meeting_url AS "meetingUrl",r.terms,r.status,r.employer_confirmed AS "employerConfirmed",r.candidate_confirmed AS "candidateConfirmed",r.created_at AS "createdAt" FROM rounds r JOIN users c ON c.id=r.candidate_id JOIN users e ON e.id=r.employer_id`;
export const jobSelect = `SELECT j.id,j.employer_id AS "employerId",e.company,j.title,j.location,j.category,j.description,j.currency,j.salary_min AS "salaryMin",j.salary_max AS "salaryMax",j.stages,j.status,j.created_at AS "createdAt" FROM jobs j JOIN users e ON e.id=j.employer_id`;
export const applicationSelect = `SELECT a.id,a.job_id AS "jobId",a.candidate_id AS "candidateId",c.name AS "candidateName",c.email,j.title AS "jobTitle",c.headline,c.skills,c.portfolio_url AS "portfolioUrl",c.resume_url AS "resumeUrl",a.note,a.status,a.created_at AS "createdAt" FROM applications a JOIN users c ON c.id=a.candidate_id JOIN jobs j ON j.id=a.job_id`;
import { createHash } from "node:crypto";
import { z } from "zod";
import { query } from "./db";
import { HttpError } from "./security";
import type {
  WorkspaceCollection,
  WorkspaceSummary,
  RoundStatus,
} from "./domain";
export const collections: WorkspaceCollection[] = [
  "rounds",
  "jobs",
  "applications",
  "ledger",
  "disputes",
];
const ledgerSelect = `SELECT l.id,l.round_id AS "roundId",l.type,l.amount_cents AS "amountCents",r.currency,l.created_at AS "createdAt" FROM ledger l JOIN rounds r ON r.id=l.round_id`;
const disputeSelect = `SELECT d.id,d.round_id AS "roundId",d.reason,d.status,d.created_at AS "createdAt" FROM disputes d JOIN rounds r ON r.id=d.round_id`;
const cursorSchema = z
  .object({
    v: z.literal(1),
    scope: z.string().regex(/^[a-f0-9]{64}$/),
    at: z.iso
      .datetime({ precision: 6 })
      .refine((s) => Number(s.slice(0, 4)) > 0),
    id: z.uuid(),
  })
  .strict();

export function pageInput(
  params: URLSearchParams,
  defaultSize = 50,
  maximumSize = 100,
) {
  for (const key of ["pageSize", "cursor", "q", "status", "category"])
    if (params.getAll(key).length > 1)
      throw new HttpError(400, "Use each page parameter once.");
  const size = params.get("pageSize");
  if (size !== null && (!/^[1-9]\d*$/.test(size) || Number(size) > maximumSize))
    throw new HttpError(
      400,
      `The page size must be between 1 and ${maximumSize}.`,
    );
  const q = params.get("q")?.trim() ?? "";
  if (q.length > 200)
    throw new HttpError(400, "The search must contain at most 200 characters.");
  const cursor = params.get("cursor");
  if (
    cursor !== null &&
    (!/^[A-Za-z0-9_-]+$/.test(cursor) || cursor.length > 1024)
  )
    throw new HttpError(
      400,
      "The page cursor is not valid. Start from the first page.",
    );
  return { pageSize: size === null ? defaultSize : Number(size), cursor, q };
}

async function recordPage(
  select: string,
  values: unknown[],
  scope: string,
  input: ReturnType<typeof pageInput>,
  filters: string[] = [],
) {
  const digest = createHash("sha256").update(scope).digest("hex");
  const filtered = `SELECT records.* FROM (${select}) records${filters.length ? " WHERE " + filters.join(" AND ") : ""}`;
  const [count] = await query<{ total: number }>(
    `SELECT count(*)::int AS total FROM (${filtered}) matches`,
    values,
  );
  const pageValues = [...values];
  let after = "";
  if (input.cursor !== null) {
    let cursor: z.infer<typeof cursorSchema>;
    try {
      cursor = cursorSchema.parse(
        JSON.parse(Buffer.from(input.cursor, "base64url").toString("utf8")),
      );
      if (cursor.scope !== digest) throw new Error();
    } catch {
      throw new HttpError(
        400,
        "The page cursor is not valid for this search. Start from the first page.",
      );
    }
    pageValues.push(cursor.at, cursor.id);
    after = ` WHERE (page."createdAt",page.id)<($${pageValues.length - 1}::timestamptz,$${pageValues.length}::uuid)`;
  }
  pageValues.push(input.pageSize + 1);
  const rows = await query<{
    id: string;
    createdAt: string;
    __cursorTimestamp: string;
  }>(
    `SELECT page.*,to_char(page."createdAt" AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "__cursorTimestamp" FROM (${filtered}) page${after} ORDER BY page."createdAt" DESC,page.id DESC LIMIT $${pageValues.length}`,
    pageValues,
  );
  const hasMore = rows.length > input.pageSize;
  const items = rows.slice(0, input.pageSize).map((row) => {
    const { __cursorTimestamp: at, ...item } = row;
    return { item, at };
  });
  const last = items.at(-1);
  return {
    items: items.map(({ item }) => item),
    page: {
      total: count.total,
      nextCursor:
        hasMore && last
          ? Buffer.from(
              JSON.stringify({
                v: 1,
                scope: digest,
                at: last.at,
                id: last.item.id,
              }),
            ).toString("base64url")
          : null,
    },
  };
}

export function workspacePage(
  userId: string,
  collection: WorkspaceCollection,
  params: URLSearchParams,
  defaultSize = 50,
  maximumSize = 100,
) {
  const input = pageInput(params, defaultSize, maximumSize);
  if (params.has("category"))
    throw new HttpError(400, "Use the jobs route for category filters.");
  const sources = {
    rounds: `${roundSelect} WHERE (r.employer_id=$1 OR r.candidate_id=$1)`,
    jobs: `${jobSelect} WHERE j.employer_id=$1`,
    applications: `${applicationSelect} WHERE (j.employer_id=$1 OR a.candidate_id=$1)`,
    ledger: `${ledgerSelect} WHERE (r.employer_id=$1 OR r.candidate_id=$1)`,
    disputes: `${disputeSelect} WHERE (r.employer_id=$1 OR r.candidate_id=$1)`,
  };
  const values: unknown[] = [userId];
  const filters: string[] = [];
  const status = params.get("status") ?? "";
  const allowed = {
    rounds: [
      "offered",
      "accepted",
      "funded",
      "completed",
      "paid",
      "disputed",
      "cancelled",
    ],
    jobs: ["open", "closed"],
    applications: [
      "applied",
      "reviewing",
      "interviewing",
      "offered",
      "hired",
      "rejected",
      "withdrawn",
    ],
    ledger: ["funded", "paid", "refunded", "disputed", "reversed"],
    disputes: ["open", "resolved"],
  };
  if (status) {
    if (!allowed[collection].includes(status))
      throw new HttpError(400, "The record state is not valid.");
    values.push(status);
    filters.push(
      `records.${collection === "ledger" ? "type" : "status"}=$${values.length}`,
    );
  }
  if (input.q) {
    const words = {
      rounds: `concat_ws(' ',records.title,records."candidateName",records."candidateEmail",records.company,records.kind)`,
      jobs: `concat_ws(' ',records.title,records.company,records.location)`,
      applications: `concat_ws(' ',records."candidateName",records.email,records."jobTitle",records.headline,records.note,records.skills::text)`,
      ledger: `concat_ws(' ',records.type,records."roundId")`,
      disputes: `records.reason`,
    };
    values.push(input.q.toLowerCase());
    filters.push(`strpos(lower(${words[collection]}),$${values.length})>0`);
  }
  return recordPage(
    sources[collection],
    values,
    JSON.stringify([userId, collection, input.q, status]),
    input,
    filters,
  );
}

export async function publicJobsPage(
  params: URLSearchParams,
  candidateId?: string,
) {
  const input = pageInput(params);
  if (params.has("status"))
    throw new HttpError(400, "The public jobs route lists open roles only.");
  const category = params.get("category") ?? "";
  if (
    category &&
    !["Engineering", "Design", "Product", "Operations"].includes(category)
  )
    throw new HttpError(400, "The job category is not valid.");
  const values: unknown[] = [];
  const filters = ["records.status='open'"];
  if (category) {
    values.push(category);
    filters.push(`records.category=$${values.length}`);
  }
  if (input.q) {
    values.push(input.q.toLowerCase());
    filters.push(
      `strpos(lower(concat_ws(' ',records.title,records.company,records.location)),$${values.length})>0`,
    );
  }
  let select = jobSelect.replace('j.employer_id AS "employerId",', "");
  if (candidateId) {
    values.push(candidateId);
    select = select.replace(
      "SELECT j.id,",
      `SELECT EXISTS(SELECT 1 FROM applications a WHERE a.job_id=j.id AND a.candidate_id=$${values.length}) AS applied,j.id,`,
    );
  }
  const result = await recordPage(
    select,
    values,
    JSON.stringify(["public-jobs", input.q, category]),
    input,
    filters,
  );
  return { jobs: result.items, page: result.page };
}

export async function workspaceSummary(
  userId: string,
): Promise<WorkspaceSummary> {
  const [counts, states, currencies] = await Promise.all([
    query<
      WorkspaceSummary["counts"] & { openJobs: number; openDisputes: number }
    >(
      `SELECT (SELECT count(*)::int FROM rounds r WHERE r.employer_id=$1 OR r.candidate_id=$1) AS rounds,(SELECT count(*)::int FROM jobs j WHERE j.employer_id=$1) AS jobs,(SELECT count(*)::int FROM applications a JOIN jobs j ON j.id=a.job_id WHERE j.employer_id=$1 OR a.candidate_id=$1) AS applications,(SELECT count(*)::int FROM ledger l JOIN rounds r ON r.id=l.round_id WHERE r.employer_id=$1 OR r.candidate_id=$1) AS ledger,(SELECT count(*)::int FROM disputes d JOIN rounds r ON r.id=d.round_id WHERE r.employer_id=$1 OR r.candidate_id=$1) AS disputes,(SELECT count(*)::int FROM jobs j WHERE j.employer_id=$1 AND j.status='open') AS "openJobs",(SELECT count(*)::int FROM disputes d JOIN rounds r ON r.id=d.round_id WHERE (r.employer_id=$1 OR r.candidate_id=$1) AND d.status='open') AS "openDisputes"`,
      [userId],
    ),
    query<{ status: RoundStatus; count: number }>(
      `SELECT status,count(*)::int AS count FROM rounds WHERE employer_id=$1 OR candidate_id=$1 GROUP BY status`,
      [userId],
    ),
    query<WorkspaceSummary["currencies"][number]>(
      `SELECT currency,coalesce(sum(amount_cents) FILTER(WHERE status='paid'),0)::float8 AS "paidCents",coalesce(sum(amount_cents) FILTER(WHERE status IN ('funded','completed')),0)::float8 AS "fundedCents" FROM rounds WHERE employer_id=$1 OR candidate_id=$1 GROUP BY currency ORDER BY currency`,
      [userId],
    ),
  ]);
  const roundStates: WorkspaceSummary["roundStates"] = {
    offered: 0,
    accepted: 0,
    funded: 0,
    completed: 0,
    paid: 0,
    disputed: 0,
    cancelled: 0,
  };
  for (const state of states) roundStates[state.status] = state.count;
  const { openJobs, openDisputes, ...totals } = counts[0];
  return {
    counts: totals,
    roundStates,
    openJobs,
    openDisputes,
    activeRounds:
      roundStates.offered +
      roundStates.accepted +
      roundStates.funded +
      roundStates.completed +
      roundStates.disputed,
    currencies,
  };
}
