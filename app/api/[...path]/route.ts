import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { z, ZodError } from "zod";
import { isDemo, query, transaction } from "@/lib/db";
import {
  canTransition,
  jobSchema,
  loginSchema,
  profileSchema,
  quote,
  registerSchema,
  roundSchema,
} from "@/lib/domain";
import {
  audit,
  checkOrigin,
  createSession,
  hashPassword,
  HttpError,
  rateLimit,
  requestJson,
  requireRole,
  sessionUser,
  tokenHash,
  verifyPassword,
} from "@/lib/security";
import { connectAccount, checkout, releaseRound, stripe } from "@/lib/payments";
import { sendToken } from "@/lib/mail";
import { assistant } from "@/lib/ai";
import { applicationSelect, jobSelect, roundSelect } from "@/lib/queries";
import { demoJobs } from "@/lib/demo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ path: string[] }> };
const ok = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
async function handle(request: Request, context: Context) {
  const path = (await context.params).path;
  const route = path.join("/");
  const method = request.method;
  if (route === "config" && method === "GET")
    return ok({
      demo: isDemo(),
      payments: !isDemo() && process.env.LIVE_PAYMENTS_ENABLED === "true",
      ai: !!process.env.AI_BASE_URL,
      email: !!process.env.RESEND_API_KEY,
    });
  if (route === "health" && method === "GET") {
    if (isDemo()) return ok({ status: "ok", mode: "demo", version: "1.0.0" });
    await query("SELECT 1");
    return ok({ status: "ok", mode: "live", version: "1.0.0" });
  }
  if (route === "jobs" && method === "GET")
    return ok({
      jobs: isDemo()
        ? demoJobs
        : await query(
            `${jobSelect} WHERE j.status='open' ORDER BY j.created_at DESC LIMIT 100`,
          ),
    });
  if (isDemo())
    throw new HttpError(
      503,
      "This deployment is a demo. Real accounts and payments are disabled.",
    );
  if (method !== "GET") checkOrigin(request);
  if (route.startsWith("auth/") && method === "POST") {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "unknown";
    await rateLimit(`auth:${ip}`, 20, 900);
    const body = await requestJson(request);
    if (route === "auth/register") {
      const input = registerSchema.parse(body);
      const hash = await hashPassword(input.password);
      const rows = await query<{ id: string }>(
        "INSERT INTO users(name,email,password_hash,role,company) VALUES($1,$2,$3,$4,$5) ON CONFLICT(email) DO NOTHING RETURNING id",
        [input.name, input.email, hash, input.role, input.company],
      );
      if (!rows[0])
        throw new HttpError(
          409,
          "An account with this email already exists. Sign in or reset the password.",
        );
      await createSession(rows[0].id);
      await audit(rows[0].id, "register");
      return ok(
        {
          message:
            "Account created. Verify your email from account settings before you use payments.",
        },
        201,
      );
    }
    if (route === "auth/login") {
      const input = loginSchema.parse(body);
      await rateLimit(`login:${input.email}`, 10, 900);
      const [user] = await query<{ id: string; password_hash: string }>(
        "SELECT id,password_hash FROM users WHERE email=$1",
        [input.email],
      );
      const hash =
        user?.password_hash ??
        "0123456789abcdef0123456789abcdef:" + "0".repeat(128);
      const valid = await verifyPassword(input.password, hash);
      if (!user || !valid)
        throw new HttpError(401, "The email or password is not correct.");
      await createSession(user.id);
      return ok({ message: "Signed in." });
    }
    if (route === "auth/reset-request") {
      if (!process.env.RESEND_API_KEY)
        throw new HttpError(
          503,
          "Email is not configured. Contact the service owner.",
        );
      const { email } = z
        .object({ email: z.email().transform((s) => s.toLowerCase()) })
        .parse(body);
      const [user] = await query<{ id: string }>(
        "SELECT id FROM users WHERE email=$1",
        [email],
      );
      if (user) await sendToken(user.id, email, "reset");
      return ok({
        message:
          "If the account exists, the email service will send a reset link.",
      });
    }
    if (route === "auth/token") {
      const input = z
        .object({
          token: z.string().regex(/^[a-f0-9]{64}$/),
          purpose: z.enum(["reset", "verify"]),
          password: z.string().min(12).max(128).optional(),
        })
        .parse(body);
      if (input.purpose === "reset" && !input.password)
        throw new HttpError(
          400,
          "Enter a new password with at least 12 characters.",
        );
      const hash = input.password ? await hashPassword(input.password) : null;
      await transaction(async (db) => {
        const {
          rows: [token],
        } = await db.query(
          "DELETE FROM auth_tokens WHERE token_hash=$1 AND purpose=$2 AND expires_at > now() RETURNING user_id",
          [tokenHash(input.token), input.purpose],
        );
        if (!token)
          throw new HttpError(
            400,
            "This link expired or is not valid. Request a new link.",
          );
        if (input.purpose === "verify")
          await db.query("UPDATE users SET email_verified=true WHERE id=$1", [
            token.user_id,
          ]);
        else {
          await db.query("UPDATE users SET password_hash=$1 WHERE id=$2", [
            hash,
            token.user_id,
          ]);
          await db.query("DELETE FROM sessions WHERE user_id=$1", [
            token.user_id,
          ]);
          await db.query(
            "DELETE FROM auth_tokens WHERE user_id=$1 AND purpose='reset'",
            [token.user_id],
          );
        }
      });
      return ok({
        message:
          input.purpose === "verify"
            ? "Email verified."
            : "Password reset. Sign in with the new password.",
      });
    }
  }
  const user = await sessionUser();
  if (method !== "GET") await rateLimit(`write:${user.id}`, 100, 60);
  if (route === "auth/logout" && method === "POST") {
    const jar = await cookies();
    const token = jar.get("fs_session")?.value;
    if (token)
      await query("DELETE FROM sessions WHERE token_hash=$1", [
        tokenHash(token),
      ]);
    jar.delete("fs_session");
    return ok({ message: "Signed out." });
  }
  if (route === "auth/verify-request" && method === "POST") {
    await rateLimit(`verify:${user.id}`, 3, 3600);
    await sendToken(user.id, user.email, "verify");
    return ok({
      message: "The email service accepted the verification request.",
    });
  }
  if (route === "workspace" && method === "GET") {
    const [rounds, jobs, applications, ledger, disputes] = await Promise.all([
      query(
        `${roundSelect} WHERE r.employer_id=$1 OR r.candidate_id=$1 ORDER BY r.created_at DESC LIMIT 200`,
        [user.id],
      ),
      query(
        `${jobSelect} WHERE j.employer_id=$1 ORDER BY j.created_at DESC LIMIT 100`,
        [user.id],
      ),
      query(
        `${applicationSelect} WHERE j.employer_id=$1 OR a.candidate_id=$1 ORDER BY a.created_at DESC LIMIT 200`,
        [user.id],
      ),
      query(
        `SELECT l.id,l.round_id AS "roundId",l.type,l.amount_cents AS "amountCents",l.created_at AS "createdAt" FROM ledger l JOIN rounds r ON r.id=l.round_id WHERE r.employer_id=$1 OR r.candidate_id=$1 ORDER BY l.created_at DESC LIMIT 200`,
        [user.id],
      ),
      query(
        `SELECT d.id,d.round_id AS "roundId",d.reason,d.status,d.created_at AS "createdAt" FROM disputes d JOIN rounds r ON r.id=d.round_id WHERE r.employer_id=$1 OR r.candidate_id=$1 ORDER BY d.created_at DESC LIMIT 200`,
        [user.id],
      ),
    ]);
    return ok({ user, rounds, jobs, applications, ledger, disputes });
  }
  if (route === "profile" && method === "POST") {
    const input = profileSchema.parse(await requestJson(request));
    if (input.country !== user.country && user.connectId)
      throw new HttpError(
        409,
        "Contact support to change the country of a connected account.",
      );
    await query(
      "UPDATE users SET name=$1,company=$2,bio=$3,country=$4 WHERE id=$5",
      [input.name, input.company, input.bio, input.country, user.id],
    );
    await audit(user.id, "profile");
    return ok({ message: "Profile saved." });
  }
  if (route === "jobs" && method === "POST") {
    requireRole(user, "employer");
    const input = jobSchema.parse(await requestJson(request));
    const [row] = await query<{ id: string }>(
      "INSERT INTO jobs(employer_id,title,location,category,description,salary_min,salary_max,stages) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id",
      [
        user.id,
        input.title,
        input.location,
        input.category,
        input.description,
        input.salaryMin,
        input.salaryMax,
        input.stages,
      ],
    );
    await audit(user.id, "create_job", row.id);
    return ok(row, 201);
  }
  if (path[0] === "jobs" && path.length === 3 && method === "POST") {
    const id = z.uuid().parse(path[1]);
    if (path[2] === "apply") {
      requireRole(user, "candidate");
      const { note } = z
        .object({ note: z.string().trim().min(20).max(3000) })
        .parse(await requestJson(request));
      const [row] = await query<{ id: string }>(
        "INSERT INTO applications(job_id,candidate_id,note) SELECT id,$2,$3 FROM jobs WHERE id=$1 AND status='open' ON CONFLICT(job_id,candidate_id) DO NOTHING RETURNING id",
        [id, user.id, note],
      );
      if (!row)
        throw new HttpError(409, "This job is closed or you already applied.");
      return ok({ message: "Application sent." }, 201);
    }
    if (path[2] === "close") {
      requireRole(user, "employer");
      const rows = await query(
        "UPDATE jobs SET status='closed' WHERE id=$1 AND employer_id=$2 RETURNING id",
        [id, user.id],
      );
      if (!rows[0]) throw new HttpError(404, "The job does not exist.");
      return ok({ message: "Job closed." });
    }
  }
  if (route === "rounds" && method === "POST") {
    requireRole(user, "employer");
    const input = roundSchema.parse(await requestJson(request));
    if (new Date(input.scheduledAt).getTime() < Date.now() + 15 * 60000)
      throw new HttpError(400, "Choose a time at least 15 minutes from now.");
    const [candidate] = await query<{ id: string }>(
      "SELECT id FROM users WHERE email=$1 AND role='candidate'",
      [input.candidateEmail],
    );
    if (!candidate)
      throw new HttpError(
        400,
        "The candidate must create an account before you offer a round.",
      );
    const q = quote(input.amountCents);
    const [round] = await query<{ id: string }>(
      "INSERT INTO rounds(employer_id,candidate_id,title,kind,minutes,amount_cents,fee_cents,scheduled_at,meeting_url,terms) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id",
      [
        user.id,
        candidate.id,
        input.title,
        input.kind,
        input.minutes,
        q.amountCents,
        q.feeCents,
        input.scheduledAt,
        input.meetingUrl,
        input.terms,
      ],
    );
    await audit(user.id, "offer_round", round.id);
    return ok(round, 201);
  }
  if (path[0] === "rounds" && path.length === 3 && method === "POST") {
    const id = z.uuid().parse(path[1]);
    const action = path[2];
    if (action === "fund") return ok(await checkout(user, id));
    if (action === "release") return ok(await releaseRound(user, id));
    const reason =
      action === "dispute"
        ? z
            .object({ reason: z.string().trim().min(20).max(3000) })
            .parse(await requestJson(request)).reason
        : "";
    await transaction(async (db) => {
      const {
        rows: [round],
      } = await db.query(
        "SELECT * FROM rounds WHERE id=$1 AND (employer_id=$2 OR candidate_id=$2) FOR UPDATE",
        [id, user.id],
      );
      if (!round) throw new HttpError(404, "The round does not exist.");
      if (!canTransition(round.status, action, user.role))
        throw new HttpError(
          409,
          "This action is not available for the current round state.",
        );
      if (action === "accept")
        await db.query("UPDATE rounds SET status='accepted' WHERE id=$1", [id]);
      if (action === "cancel") {
        if (round.checkout_id) {
          const session = await stripe().checkout.sessions.retrieve(
            round.checkout_id,
          );
          if (session.status === "complete")
            throw new HttpError(
              409,
              "This round has a payment. Refresh its state before you continue.",
            );
          if (session.status === "open")
            await stripe().checkout.sessions.expire(session.id);
        }
        await db.query("UPDATE rounds SET status='cancelled' WHERE id=$1", [
          id,
        ]);
      }
      if (action === "complete") {
        if (
          new Date(round.scheduled_at).getTime() + round.minutes * 60000 >
          Date.now()
        )
          throw new HttpError(
            409,
            "Confirm completion after the scheduled round ends.",
          );
        const column =
          user.role === "employer"
            ? "employer_confirmed"
            : "candidate_confirmed";
        await db.query(`UPDATE rounds SET ${column}=true WHERE id=$1`, [id]);
        await db.query(
          "UPDATE rounds SET status='completed' WHERE id=$1 AND employer_confirmed AND candidate_confirmed",
          [id],
        );
      }
      if (action === "dispute") {
        await db.query(
          "INSERT INTO disputes(round_id,opened_by,reason) VALUES($1,$2,$3) ON CONFLICT(round_id) DO NOTHING",
          [id, user.id, reason],
        );
        await db.query("UPDATE rounds SET status='disputed' WHERE id=$1", [id]);
      }
      await db.query(
        "INSERT INTO audit_events(actor_id,action,resource_id) VALUES($1,$2,$3)",
        [user.id, action, id],
      );
    });
    return ok({
      message:
        action === "complete"
          ? "Completion recorded. Both people must confirm before payment release."
          : "Round updated.",
    });
  }
  if (route === "connect" && method === "POST")
    return ok(await connectAccount(user));
  if (route === "assistant" && method === "POST") {
    await rateLimit(`ai:${user.id}`, 20, 3600);
    const input = z
      .object({
        topic: z.string().trim().min(3).max(500),
        kind: z.string().max(50),
        consent: z.boolean(),
      })
      .parse(await requestJson(request));
    return ok(await assistant(input.topic, input.kind, input.consent));
  }
  throw new HttpError(404, "The API route does not exist.");
}
async function route(request: Request, context: Context) {
  try {
    return await handle(request, context);
  } catch (error) {
    if (error instanceof HttpError)
      return ok({ error: error.message }, error.status);
    if (error instanceof ZodError)
      return ok(
        { error: error.issues[0]?.message ?? "Check the form values." },
        400,
      );
    const requestId = randomUUID();
    console.error(JSON.stringify({ event: "request_failed", requestId }));
    return ok(
      { error: "The request could not complete. Try again later.", requestId },
      500,
    );
  }
}
export const GET = route;
export const POST = route;
