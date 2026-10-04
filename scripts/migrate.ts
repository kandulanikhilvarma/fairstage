import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { Pool } from "pg";

async function migrate() {
  if (!process.env.DATABASE_URL)
    throw new Error("Set DATABASE_URL before you run the migration.");
  const pool = new Pool({
    connectionString:
      process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL,
    connectionTimeoutMillis: 8000,
  });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(701512)");
    await client.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    for (const name of (await readdir(resolve("db")))
      .filter((name) => /^\d+_.+\.sql$/.test(name))
      .sort()) {
      const result = await client.query(
        "SELECT 1 FROM schema_migrations WHERE name=$1",
        [name],
      );
      if (!result.rowCount) {
        await client.query(await readFile(resolve("db", name), "utf8"));
        await client.query("INSERT INTO schema_migrations(name) VALUES($1)", [
          name,
        ]);
        console.log(`Applied ${name}`);
      }
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}
migrate().catch(() => {
  console.error(
    "The migration failed. Check the database connection and schema.",
  );
  process.exitCode = 1;
});
