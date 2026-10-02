import { randomBytes } from "node:crypto";
import { query } from "./db";
import { HttpError, tokenHash } from "./security";

export async function sendToken(
  userId: string,
  email: string,
  purpose: "verify" | "reset",
) {
  if (
    !process.env.RESEND_API_KEY ||
    !process.env.EMAIL_FROM ||
    !process.env.APP_URL
  )
    throw new HttpError(
      503,
      "Email is not configured. Contact the service owner.",
    );
  const token = randomBytes(32).toString("hex");
  await query(
    "INSERT INTO auth_tokens(token_hash,user_id,purpose,expires_at) VALUES($1,$2,$3,now()+interval '30 minutes')",
    [tokenHash(token), userId, purpose],
  );
  const url = `${process.env.APP_URL}/account?action=${purpose}&token=${token}`;
  const result = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(10000),
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to: email,
      subject:
        purpose === "verify"
          ? "Verify your Fairstage account"
          : "Reset your Fairstage password",
      text: `Open this link to ${purpose === "verify" ? "verify your email" : "reset your password"}:\n${url}\n\nThis link expires in 30 minutes. If you did not request it, ignore this email.`,
    }),
  });
  if (!result.ok)
    throw new HttpError(
      503,
      "The email service did not accept the request. Try again later.",
    );
}
