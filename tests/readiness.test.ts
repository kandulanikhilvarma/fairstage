import { describe, expect, it } from "vitest";
import { readinessChecks } from "../lib/readiness";

const env = {
  APP_URL: "https://fairstage.example.test",
  DATABASE_URL:
    "postgresql://user:password@db.example.test/fairstage?sslmode=require",
  RESEND_API_KEY: "secret-provider-value",
  EMAIL_FROM: "Fairstage <sender@example.test>",
  OPERATOR_EMAILS: "owner@example.test",
  CRON_SECRET: "a".repeat(64),
};
describe("launch readiness", () => {
  it("reports missing required services without credential values", () => {
    expect(
      readinessChecks({})
        .filter((check) => check.required)
        .every((check) => check.status === "missing"),
    ).toBe(true);
    const result = readinessChecks(env);
    expect(
      result
        .filter((check) => check.required)
        .every((check) => check.status === "configured"),
    ).toBe(true);
    expect(JSON.stringify(result)).not.toContain("secret-provider-value");
    expect(JSON.stringify(result)).not.toContain("owner@example.test");
    expect(JSON.stringify(result)).not.toContain("password@");
  });
  it.each([
    "http://fairstage.example.test",
    "https://user:password@fairstage.test",
    "https://fairstage.test/path",
    "https://fairstage.test/?credential=value",
    "https://fairstage.test/#fragment",
  ])("rejects an invalid production origin %s", (APP_URL) => {
    expect(
      readinessChecks({ ...env, APP_URL }).find(
        (check) => check.id === "app_origin",
      )?.status,
    ).toBe("missing");
  });
  it.each([
    "postgresql://db.test/fairstage",
    "postgresql://db.test/fairstage?sslmode=disable",
    "https://db.test/fairstage?sslmode=require",
  ])("requires PostgreSQL TLS %s", (DATABASE_URL) => {
    expect(
      readinessChecks({ ...env, DATABASE_URL }).find(
        (check) => check.id === "database",
      )?.status,
    ).toBe("missing");
  });
  it("does not accept invalid operator or cron configuration", () => {
    expect(
      readinessChecks({
        ...env,
        OPERATOR_EMAILS: "owner@example.test,invalid",
      }).find((check) => check.id === "operator")?.status,
    ).toBe("missing");
    expect(
      readinessChecks({ ...env, CRON_SECRET: "short" }).find(
        (check) => check.id === "maintenance",
      )?.status,
    ).toBe("missing");
  });
  it("keeps Stripe India and test payment credentials disabled", () => {
    const payment = {
      ...env,
      LIVE_PAYMENTS_ENABLED: "true",
      STRIPE_PLATFORM_COUNTRY: "IN",
      STRIPE_FUNDS_FLOW_APPROVED: "true",
      STRIPE_SECRET_KEY: "sk_live_placeholder",
      STRIPE_WEBHOOK_SECRET: "placeholder",
      STRIPE_CONNECT_COUNTRIES: "US",
      RAZORPAY_PAYMENTS_ENABLED: "true",
      RAZORPAY_ROUTE_ENABLED: "true",
      RAZORPAY_KEY_ID: "rzp_test_placeholder",
      RAZORPAY_KEY_SECRET: "placeholder",
      RAZORPAY_WEBHOOK_SECRET: "placeholder",
    };
    const result = readinessChecks(payment);
    expect(result.find((check) => check.id === "stripe")?.status).toBe(
      "disabled",
    );
    expect(result.find((check) => check.id === "razorpay")?.status).toBe(
      "disabled",
    );
    expect(result.find((check) => check.id === "google")?.status).toBe(
      "disabled",
    );
  });
});
