import { defineConfig, devices } from "@playwright/test";

export const e2eDatabaseUrl =
  process.env.E2E_DATABASE_URL ||
  (process.env.CI === "true"
    ? "postgresql://fairstage:test-password@127.0.0.1:5432/fairstage"
    : "");
if (e2eDatabaseUrl) {
  const database = new URL(e2eDatabaseUrl);
  if (
    !["postgres:", "postgresql:"].includes(database.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(database.hostname) ||
    database.pathname !== "/fairstage" ||
    database.search !== "" ||
    database.hash !== ""
  )
    throw new Error(
      "E2E_DATABASE_URL must use a loopback PostgreSQL database named fairstage.",
    );
}
const port = Number(process.env.E2E_PORT || "3000");
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("E2E_PORT must be a port between 1024 and 65535.");
export const e2eBaseURL = `http://127.0.0.1:${port}`;
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  expect: { timeout: 10000 },
  retries: process.env.CI === "true" ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL: e2eBaseURL, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run start -- --hostname 127.0.0.1 --port ${port}`,
    url: e2eBaseURL,
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      DATABASE_URL: e2eDatabaseUrl,
      APP_URL: e2eBaseURL,
      DEFAULT_CURRENCY: "USD",
      LIVE_PAYMENTS_ENABLED: "false",
      STRIPE_SECRET_KEY: "",
      STRIPE_WEBHOOK_SECRET: "",
      RESEND_API_KEY: "",
      EMAIL_FROM: "",
      GOOGLE_CLIENT_ID: "",
      GOOGLE_CLIENT_SECRET: "",
      RAZORPAY_KEY_ID: "",
      RAZORPAY_KEY_SECRET: "",
      RAZORPAY_WEBHOOK_SECRET: "",
      RAZORPAY_PAYMENTS_ENABLED: "false",
      RAZORPAY_ROUTE_ENABLED: "false",
      AI_BASE_URL: "",
      AI_API_KEY: "",
    },
  },
});
