import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { z, ZodError } from "zod";
import { query, transaction } from "@/lib/db";
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
import {
  connectAccount,
  checkout,
  releaseRound,
  stripe,
  stripeActionReady,
} from "@/lib/payments";
import { sendToken } from "@/lib/mail";
import { assistant } from "@/lib/ai";
import { applicationSelect, jobSelect, roundSelect } from "@/lib/queries";
import { authConfig, authOrigin } from "@/lib/auth";
import { lockEmailIdentity, claimVerifiedAccount } from "@/lib/auth-ownership";
import { calendarEvent } from "@/lib/calendar";
import {
  createRazorpayOrder,
  verifyRazorpayPayment,
  releaseRazorpayRound,
  razorpayReadiness,
} from "@/lib/razorpay";
import type { Round } from "@/lib/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ path: string[] }> };
const ok = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
async function handle(request: Request, context: Context) {
  const path = (await context.params).path;
  const route = path.join("/");
  const method = request.method;
  if (route === "config" && method === "GET") {
    const auth = authConfig();
    const razorpay = razorpayReadiness();
    let accounts = false;
    try {
      authOrigin();
      accounts = !!process.env.DATABASE_URL;
    } catch {}
    const payments = stripeActionReady();
    return ok({
      accounts,
      payments,
      ai: !!process.env.AI_BASE_URL,
      email: !!process.env.RESEND_API_KEY && !!process.env.EMAIL_FROM,
      ...auth,
      razorpay: razorpay.configured && razorpay.route,
      currency: process.env.DEFAULT_CURRENCY === "USD" ? "USD" : "INR",
    });
  }
  if (route === "health" && method === "GET") {
    if (!process.env.DATABASE_URL)
      return ok(
        { status: "unavailable", mode: "production", version: "1.1.0" },
        503,
      );
    try {
      await query("SELECT 1");
      return ok({ status: "ok", mode: "production", version: "1.1.0" });
    } catch {
      return ok(
        { status: "unavailable", mode: "production", version: "1.1.0" },
        503,
      );
    }
  }
  if (!process.env.DATABASE_URL)
    throw new HttpError(
      503,
      "The account service is temporarily unavailable. Please try again later.",
    );
  if (route === "jobs" && method === "GET")
    return ok({
      jobs: await query(
        jobSelect +
          " WHERE j.status='open' ORDER BY j.created_at DESC LIMIT 100",
      ),
    });
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
      await transaction(async (db) => {
        await lockEmailIdentity(db, input.email);
        const { rows } = await db.query<{ id: string }>(
          "INSERT INTO users(name,email,password_hash,role,company) VALUES($1,$2,$3,$4,$5) ON CONFLICT(email) DO NOTHING RETURNING id",
          [input.name, input.email, hash, input.role, input.company],
        );
        if (!rows[0])
          throw new HttpError(
            409,
            "An account with this email already exists. Sign in or reset the password.",
          );
        await createSession(rows[0].id, db);
        await db.query(
          "INSERT INTO audit_events(actor_id,action) VALUES($1,'register')",
          [rows[0].id],
        );
      });
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
      await transaction(async (db) => {
        await lockEmailIdentity(db, input.email);
        const {
          rows: [user],
        } = await db.query<{ id: string; password_hash: string }>(
          "SELECT id,password_hash FROM users WHERE email=$1 FOR UPDATE",
          [input.email],
        );
        const hash =
          user?.password_hash ??
          "0123456789abcdef0123456789abcdef:" + "0".repeat(128);
        const valid = await verifyPassword(input.password, hash);
        if (!user || !valid)
          throw new HttpError(401, "The email or password is not correct.");
        await createSession(user.id, db);
      });
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
          role: z.enum(["candidate", "employer"]).optional(),
          name: z.string().trim().min(2).max(100).optional(),
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
          rows: [identity],
        } = await db.query<{
          email: string;
          name: string;
          role: "candidate" | "employer";
          email_verified: boolean;
        }>(
          "SELECT u.email,u.name,u.role,u.email_verified FROM auth_tokens t JOIN users u ON u.id=t.user_id WHERE t.token_hash=$1 AND t.purpose=$2 AND t.expires_at>now()",
          [tokenHash(input.token), input.purpose],
        );
        if (!identity)
          throw new HttpError(
            400,
            "This link expired or is not valid. Request a new link.",
          );
        await lockEmailIdentity(db, identity.email);
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
        const {
          rows: [current],
        } = await db.query<{ email_verified: boolean }>(
          "SELECT email_verified FROM users WHERE id=$1 FOR UPDATE",
          [token.user_id],
        );
        if (input.purpose === "verify" && !current.email_verified && !hash)
          throw new HttpError(
            400,
            "Set a new password to confirm ownership of this email.",
          );
        if (!current.email_verified)
          await claimVerifiedAccount(db, {
            email: identity.email,
            name: input.name || identity.name,
            role: input.role || identity.role,
          });
        if (input.purpose === "reset" || !current.email_verified) {
          await db.query(
            "UPDATE users SET password_hash=$1,email_verified=true WHERE id=$2",
            [hash, token.user_id],
          );
          await db.query("DELETE FROM sessions WHERE user_id=$1", [
            token.user_id,
          ]);
          await db.query("DELETE FROM auth_tokens WHERE user_id=$1", [
            token.user_id,
          ]);
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
  if (
    method !== "GET" &&
    !user.verified &&
    !["profile", "auth/logout", "auth/verify-request", "assistant"].includes(
      route,
    )
  )
    throw new HttpError(
      403,
      "Verify your email before you use applications or interview rounds.",
    );
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
    if (user.verified)
      return ok({ message: "Your email is already verified." });
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
        `SELECT l.id,l.round_id AS "roundId",l.type,l.amount_cents AS "amountCents",r.currency,l.created_at AS "createdAt" FROM ledger l JOIN rounds r ON r.id=l.round_id WHERE r.employer_id=$1 OR r.candidate_id=$1 ORDER BY l.created_at DESC LIMIT 200`,
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
    await transaction(async (db) => {
      await lockEmailIdentity(db, user.email);
      const session = (await cookies()).get("fs_session")?.value;
      const {
        rows: [active],
      } = await db.query(
        "SELECT 1 FROM sessions WHERE token_hash=$1 AND user_id=$2 AND expires_at>now()",
        [tokenHash(session || ""), user.id],
      );
      if (!active)
        throw new HttpError(401, "Your session expired. Sign in again.");
      if (input.country !== user.country) {
        const {
          rows: [mapping],
        } = await db.query<{
          connect_id: string | null;
          razorpay_account_id: string | null;
        }>("SELECT connect_id,razorpay_account_id FROM users WHERE id=$1", [
          user.id,
        ]);
        if (mapping?.connect_id || mapping?.razorpay_account_id)
          throw new HttpError(
            409,
            "Contact support to change the country of a connected account.",
          );
      }
      await db.query(
        "UPDATE users SET name=$1,company=$2,bio=$3,country=$4,headline=$5,skills=$6,portfolio_url=$7,resume_url=$8,timezone=$9 WHERE id=$10",
        [
          input.name,
          input.company,
          input.bio,
          input.country,
          input.headline,
          input.skills,
          input.portfolioUrl,
          input.resumeUrl,
          input.timezone,
          user.id,
        ],
      );
      await db.query(
        "INSERT INTO audit_events(actor_id,action) VALUES($1,'profile')",
        [user.id],
      );
    });
    return ok({ message: "Profile saved." });
  }
  if (route === "jobs" && method === "POST") {
    requireRole(user, "employer");
    if (!user.verified)
      throw new HttpError(403, "Verify your email before you publish a role.");
    const input = jobSchema.parse(await requestJson(request));
    const [row] = await query<{ id: string }>(
      "INSERT INTO jobs(employer_id,title,location,category,description,salary_min,salary_max,stages,currency) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id",
      [
        user.id,
        input.title,
        input.location,
        input.category,
        input.description,
        input.salaryMin,
        input.salaryMax,
        input.stages,
        input.currency,
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
    if (!user.verified)
      throw new HttpError(403, "Verify your email before you offer a round.");
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
      "INSERT INTO rounds(employer_id,candidate_id,title,kind,minutes,amount_cents,fee_cents,scheduled_at,meeting_url,terms,currency,payment_provider) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id",
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
        input.currency,
        input.currency === "INR" ? "razorpay" : "stripe",
      ],
    );
    await audit(user.id, "offer_round", round.id);
    return ok(round, 201);
  }
  if (
    path[0] === "applications" &&
    path.length === 3 &&
    path[2] === "status" &&
    method === "POST"
  ) {
    const id = z.uuid().parse(path[1]);
    const { status } = z
      .object({
        status: z.enum([
          "reviewing",
          "interviewing",
          "offered",
          "hired",
          "rejected",
          "withdrawn",
        ]),
      })
      .parse(await requestJson(request));
    if (user.role === "candidate" && status !== "withdrawn")
      throw new HttpError(
        403,
        "Candidates can withdraw their own applications.",
      );
    if (user.role === "employer" && status === "withdrawn")
      throw new HttpError(
        403,
        "Only the candidate can withdraw an application.",
      );
    const rows = await query(
      "UPDATE applications a SET status=$1 FROM jobs j WHERE a.id=$2 AND j.id=a.job_id AND (($3='employer' AND j.employer_id=$4 AND a.status<>'withdrawn') OR ($3='candidate' AND a.candidate_id=$4 AND a.status NOT IN ('hired','withdrawn'))) RETURNING a.id",
      [status, id, user.role, user.id],
    );
    if (!rows[0]) throw new HttpError(404, "The application is not available.");
    await audit(user.id, "application_" + status, id);
    return ok({ message: "Application updated." });
  }
  if (route === "account/export" && method === "GET") {
    await rateLimit("export:" + user.id, 5, 3600);
    const [applications, rounds, jobs, ledger, disputes, privateNotes] =
      await Promise.all([
        query(
          applicationSelect + " WHERE a.candidate_id=$1 OR j.employer_id=$1",
          [user.id],
        ),
        query(roundSelect + " WHERE r.employer_id=$1 OR r.candidate_id=$1", [
          user.id,
        ]),
        query(jobSelect + " WHERE j.employer_id=$1", [user.id]),
        query(
          'SELECT l.id,l.round_id AS "roundId",l.type,l.amount_cents AS "amountCents",r.currency,l.created_at AS "createdAt" FROM ledger l JOIN rounds r ON r.id=l.round_id WHERE r.employer_id=$1 OR r.candidate_id=$1',
          [user.id],
        ),
        query(
          'SELECT d.id,d.round_id AS "roundId",d.reason,d.status,d.created_at AS "createdAt" FROM disputes d JOIN rounds r ON r.id=d.round_id WHERE r.employer_id=$1 OR r.candidate_id=$1',
          [user.id],
        ),
        query(
          'SELECT id AS "roundId",private_notes->>$1::text AS note FROM rounds WHERE employer_id=$1::uuid OR candidate_id=$1::uuid',
          [user.id],
        ),
      ]);
    return ok({
      user,
      applications,
      rounds,
      jobs,
      ledger,
      disputes,
      privateNotes,
      exportedAt: new Date().toISOString(),
    });
  }
  if (
    path[0] === "rounds" &&
    path.length === 3 &&
    path[2] === "notes" &&
    method === "GET"
  ) {
    const id = z.uuid().parse(path[1]);
    const [r] = await query<{ note: string }>(
      "SELECT COALESCE(private_notes->>$2::text,'') AS note FROM rounds WHERE id=$1 AND (employer_id=$2::uuid OR candidate_id=$2::uuid)",
      [id, user.id],
    );
    if (!r) throw new HttpError(404, "The round does not exist.");
    return ok(r);
  }
  if (
    path[0] === "rounds" &&
    path.length === 3 &&
    path[2] === "calendar" &&
    method === "GET"
  ) {
    const id = z.uuid().parse(path[1]);
    const [r] = await query<Round>(
      roundSelect +
        " WHERE r.id=$1 AND (r.employer_id=$2 OR r.candidate_id=$2)",
      [id, user.id],
    );
    if (!r) throw new HttpError(404, "The round does not exist.");
    return new NextResponse(calendarEvent(r), {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": "attachment; filename=interview.ics",
        "Cache-Control": "private, no-store",
      },
    });
  }
  if (route === "razorpay/verify" && method === "POST")
    return ok(await verifyRazorpayPayment(user, await requestJson(request)));
  if (path[0] === "rounds" && path.length === 3 && method === "POST") {
    const id = z.uuid().parse(path[1]);
    const action = path[2];
    if (action === "notes") {
      const { note } = z
        .object({ note: z.string().trim().max(5000) })
        .parse(await requestJson(request));
      const rows = await query(
        "UPDATE rounds SET private_notes=jsonb_set(private_notes,ARRAY[$2::text],to_jsonb($3::text)) WHERE id=$1 AND (employer_id=$2::uuid OR candidate_id=$2::uuid) RETURNING id",
        [id, user.id, note],
      );
      if (!rows[0]) throw new HttpError(404, "The round does not exist.");
      return ok({ message: "Private note saved." });
    }
    if (action === "fund" || action === "release") {
      const [r] = await query<{ payment_provider: string }>(
        "SELECT payment_provider FROM rounds WHERE id=$1 AND (employer_id=$2 OR candidate_id=$2)",
        [id, user.id],
      );
      if (!r) throw new HttpError(404, "The round does not exist.");
      if (r.payment_provider === "razorpay")
        return ok(
          action === "fund"
            ? await createRazorpayOrder(user, id)
            : await releaseRazorpayRound(user, id),
        );
      return ok(
        action === "fund"
          ? await checkout(user, id)
          : await releaseRound(user, id),
      );
    }
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
        if (round.payment_provider === "razorpay" && round.razorpay_order_id)
          throw new HttpError(
            409,
            "This round has an active payment order. Contact support before you cancel it.",
          );
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
