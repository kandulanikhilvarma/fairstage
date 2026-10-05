import { z } from "zod";
import { databaseUrlConfig } from "./database-config";

type Environment = Record<string, string | undefined>;
export interface ReadinessCheck {
  id: string;
  required: boolean;
  status: "configured" | "missing" | "disabled";
  message: string;
}

export function readinessChecks(env: Environment): ReadinessCheck[] {
  let origin = false;
  let database = false;
  let directDatabase = false;
  try {
    const url = new URL(env.APP_URL ?? "");
    origin =
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash;
  } catch {}
  try {
    databaseUrlConfig(env.DATABASE_URL, true);
    database = true;
  } catch {}
  try {
    databaseUrlConfig(env.DATABASE_DIRECT_URL, true);
    directDatabase = true;
  } catch {}
  const emails = (env.OPERATOR_EMAILS ?? "")
    .split(/[,\n]/)
    .map((email) => email.trim())
    .filter(Boolean);
  const operator =
    emails.length > 0 &&
    emails.length <= 50 &&
    emails.every((email) => z.email().max(254).safeParse(email).success);
  const required = (
    id: string,
    configured: boolean,
    message: string,
  ): ReadinessCheck => ({
    id,
    required: true,
    status: configured ? "configured" : "missing",
    message,
  });
  const optional = (
    id: string,
    configured: boolean,
    message: string,
  ): ReadinessCheck => ({
    id,
    required: false,
    status: configured ? "configured" : "disabled",
    message,
  });
  return [
    required("app_origin", origin, "Set APP_URL to the exact HTTPS origin."),
    required(
      "database",
      database,
      "Set DATABASE_URL to PostgreSQL with certificate and hostname verification.",
    ),
    env.DATABASE_DIRECT_URL
      ? required(
          "database_direct",
          directDatabase,
          "The direct PostgreSQL connection must verify the certificate and hostname.",
        )
      : optional(
          "database_direct",
          false,
          "An optional direct connection can serve migrations and schema checks.",
        ),
    required(
      "email",
      !!env.RESEND_API_KEY && !!env.EMAIL_FROM,
      "Connect a verified email sender. Verify sign-in links and password recovery.",
    ),
    required(
      "operator",
      operator,
      "Set OPERATOR_EMAILS to verified operator addresses.",
    ),
    required(
      "maintenance",
      /^[A-Za-z0-9_-]{32,256}$/.test(env.CRON_SECRET ?? ""),
      "Set CRON_SECRET to 32 or more random URL-safe characters.",
    ),
    optional(
      "google",
      !!env.GOOGLE_CLIENT_ID && !!env.GOOGLE_CLIENT_SECRET,
      "Google sign-in needs a web client and the exact callback URL.",
    ),
    optional(
      "razorpay",
      env.RAZORPAY_PAYMENTS_ENABLED === "true" &&
        env.RAZORPAY_ROUTE_ENABLED === "true" &&
        !!env.RAZORPAY_KEY_ID?.startsWith("rzp_live_") &&
        !!env.RAZORPAY_KEY_SECRET &&
        !!env.RAZORPAY_WEBHOOK_SECRET,
      "INR payments need live merchant credentials, Route approval, and provider acceptance checks.",
    ),
    optional(
      "stripe",
      env.LIVE_PAYMENTS_ENABLED === "true" &&
        /^[A-Z]{2}$/.test(env.STRIPE_PLATFORM_COUNTRY ?? "") &&
        env.STRIPE_PLATFORM_COUNTRY !== "IN" &&
        env.STRIPE_FUNDS_FLOW_APPROVED === "true" &&
        !!env.STRIPE_SECRET_KEY?.startsWith("sk_live_") &&
        !!env.STRIPE_WEBHOOK_SECRET &&
        !!env.STRIPE_CONNECT_COUNTRIES,
      "USD transfers need an approved platform outside India and approved candidate countries.",
    ),
    optional(
      "model",
      !!env.AI_BASE_URL?.startsWith("https://") &&
        !!env.AI_API_KEY &&
        !!env.AI_MODEL,
      "The local preparation guide works without a model provider.",
    ),
  ];
}
