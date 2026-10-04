import { readFile, readdir } from "node:fs/promises";
import { Pool } from "pg";
import { readinessChecks } from "../lib/readiness";

async function main() {
  const args = new Set(process.argv.slice(2));
  if ([...args].some((arg) => !["--database", "--live"].includes(arg)))
    throw new Error("Use --database or --live to verify external services.");
  const checks = readinessChecks(process.env);
  const verification: { id: string; passed: boolean; message: string }[] = [];
  if (args.has("--database")) {
    const pool = new Pool({
      connectionString:
        process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL,
      connectionTimeoutMillis: 8000,
      query_timeout: 10000,
      max: 1,
    });
    try {
      if (!process.env.DATABASE_URL) throw new Error();
      const expected = (await readdir("db")).filter((name) =>
        /^\d+_.+\.sql$/.test(name),
      );
      const applied = await pool.query<{ name: string }>(
        "SELECT name FROM schema_migrations",
      );
      const names = new Set(applied.rows.map((row) => row.name));
      verification.push({
        id: "migrations",
        passed: expected.every((name) => names.has(name)),
        message: "All repository migrations must exist in the database.",
      });
    } catch {
      verification.push({
        id: "migrations",
        passed: false,
        message: "The database or migration registry is not available.",
      });
    } finally {
      await pool.end();
    }
  }
  if (args.has("--live")) {
    try {
      if (
        checks.find((check) => check.id === "app_origin")?.status !==
        "configured"
      )
        throw new Error();
      const version = (
        JSON.parse(await readFile("package.json", "utf8")) as {
          version: string;
        }
      ).version;
      const response = await fetch(
        new URL("/api/health", process.env.APP_URL),
        { signal: AbortSignal.timeout(10000), redirect: "error" },
      );
      const health = await response.json();
      verification.push({
        id: "live_health",
        passed:
          response.ok &&
          health.status === "ok" &&
          health.mode === "production" &&
          health.version === version,
        message: "The live database health and release version must match.",
      });
    } catch {
      verification.push({
        id: "live_health",
        passed: false,
        message: "The live health check did not pass.",
      });
    }
  }
  const passed =
    checks.every((check) => !check.required || check.status === "configured") &&
    verification.every((check) => check.passed);
  console.log(
    JSON.stringify(
      {
        readyForAccountPilot: passed,
        checks,
        verification,
        note: "Configuration does not prove provider approval or payment acceptance. This report contains no credential values.",
      },
      null,
      2,
    ),
  );
  if (!passed) process.exitCode = 1;
}
main().catch((error: unknown) => {
  console.error(
    error instanceof Error && error.message.startsWith("Use --")
      ? error.message
      : "The readiness check could not complete.",
  );
  process.exitCode = 1;
});
