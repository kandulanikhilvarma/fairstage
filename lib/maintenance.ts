import { createHash, timingSafeEqual } from "node:crypto";
import { query, transaction } from "./db";

export const maintenanceBatchSize = 1000;
export const maintenanceJob = "expired_auth_cleanup";

export function maintenanceAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  const supplied = request.headers.get("authorization") ?? "";
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(secret) || supplied.length > 263)
    return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(supplied), digest(`Bearer ${secret}`));
}

export async function cleanExpiredAuth(): Promise<{
  status: "skipped" | "completed";
  counts: Record<string, number>;
}> {
  const startedAt = new Date().toISOString();
  try {
    return await transaction(async (db) => {
      await db.query("SET LOCAL statement_timeout = '20s'");
      const { rows } = await db.query<{ locked: boolean }>(
        "SELECT pg_try_advisory_xact_lock(701513) AS locked",
      );
      if (!rows[0].locked) return { status: "skipped" as const, counts: {} };
      const counts: Record<string, number> = {};
      // This fixed list excludes permanent records and financial history.
      for (const [table, key, expiry] of [
        ["sessions", "token_hash", "expires_at"],
        ["auth_tokens", "token_hash", "expires_at"],
        ["oauth_challenges", "state_hash", "expires_at"],
        ["magic_links", "token_hash", "expires_at"],
        ["rate_limits", "key", "reset_at"],
      ]) {
        const result = await db.query(
          `DELETE FROM ${table} WHERE ${key} IN (
            SELECT ${key} FROM ${table} WHERE ${expiry} < now() - interval '1 day'
            ORDER BY ${expiry},${key} LIMIT $1 FOR UPDATE SKIP LOCKED
          )`,
          [maintenanceBatchSize],
        );
        counts[table] = result.rowCount ?? 0;
      }
      await db.query(
        "INSERT INTO operation_runs(job,status,counts,started_at) VALUES($1,'completed',$2,$3)",
        [maintenanceJob, JSON.stringify(counts), startedAt],
      );
      return { status: "completed" as const, counts };
    });
  } catch {
    // Keep the failure record separate from the transaction that rolled back.
    try {
      await query(
        "INSERT INTO operation_runs(job,status,started_at) VALUES($1,'failed',$2)",
        [maintenanceJob, startedAt],
      );
    } catch {
      // A database outage also prevents a durable failure record.
    }
    throw new Error("The maintenance job failed.");
  }
}
