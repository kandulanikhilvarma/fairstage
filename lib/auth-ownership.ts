import { randomBytes } from "node:crypto";
import type { PoolClient } from "pg";
import type { Role } from "./domain";

type AuthClient = Pick<PoolClient, "query">;
type VerifiedClaim = { email: string; name: string; role: Role };

export function canonicalEmail(value: string) {
  return value.trim().toLowerCase();
}

// Every password and email-ownership operation must acquire this lock before
// reading credentials, and hold it through its database session insertion.
export async function lockEmailIdentity(db: AuthClient, email: string) {
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
    `auth-email:${canonicalEmail(email)}`,
  ]);
}

export async function claimVerifiedAccount(
  db: AuthClient,
  claim: VerifiedClaim,
): Promise<string> {
  const email = canonicalEmail(claim.email);
  await lockEmailIdentity(db, email);
  const {
    rows: [existing],
  } = await db.query<{ id: string; email_verified: boolean }>(
    "SELECT id,email_verified FROM users WHERE email=$1 FOR UPDATE",
    [email],
  );
  // Credentials and profile data in a verified account belong to its owner.
  if (existing?.email_verified) return existing.id;

  const disabledPassword = `disabled:${randomBytes(32).toString("hex")}`;
  if (!existing) {
    const {
      rows: [user],
    } = await db.query<{ id: string }>(
      "INSERT INTO users(name,email,password_hash,role,email_verified) VALUES($1,$2,$3,$4,true) RETURNING id",
      [claim.name, email, disabledPassword, claim.role],
    );
    return user.id;
  }

  // An unverified registration does not prove ownership. Revoke everything
  // that its registrant can use before the proven owner receives access.
  await db.query(
    `UPDATE users SET password_hash=$2,email_verified=true,name=$3,role=$4,
     company='',bio='',headline='',skills='{}',portfolio_url='',resume_url='',
     country=CASE WHEN connect_id IS NOT NULL OR razorpay_account_id IS NOT NULL
       THEN country ELSE 'IN' END,
     timezone=CASE WHEN connect_id IS NOT NULL OR razorpay_account_id IS NOT NULL
       THEN timezone ELSE 'Asia/Kolkata' END WHERE id=$1`,
    [existing.id, disabledPassword, claim.name, claim.role],
  );
  await db.query("DELETE FROM sessions WHERE user_id=$1", [existing.id]);
  await db.query("DELETE FROM auth_tokens WHERE user_id=$1", [existing.id]);
  await db.query(
    "INSERT INTO audit_events(actor_id,action) VALUES($1,'unverified_account_reclaimed')",
    [existing.id],
  );
  return existing.id;
}
