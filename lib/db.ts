import { Pool, type PoolClient, type QueryResultRow } from "pg";

let pool: Pool | undefined;
export function database() {
  if (!process.env.DATABASE_URL)
    throw new Error("The database is not configured.");
  pool ??= new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 4,
    idleTimeoutMillis: 20000,
    connectionTimeoutMillis: 8000,
  });
  return pool;
}
export async function query<T extends QueryResultRow>(
  sql: string,
  values: unknown[] = [],
) {
  return (await database().query<T>(sql, values)).rows;
}
export async function transaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await database().connect();
  try {
    await client.query("BEGIN");
    const value = await fn(client);
    await client.query("COMMIT");
    return value;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
export function isDemo() {
  return process.env.DEMO_MODE !== "false";
}
