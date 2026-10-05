import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtemp, rmdir, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkServerIdentity, type ConnectionOptions } from "node:tls";
import { Client } from "pg";
import { parse, toClientConfig } from "pg-connection-string";
import { databaseConfig, databaseUrlConfig } from "../lib/database-config";
import { readinessChecks } from "../lib/readiness";

const origin = "https://fairstage.example.test";
const base = "postgresql://account:private-password@db.example.test/fairstage";
const secure = `${base}?sslmode=verify-full`;
const direct = secure.replace("db.example.test", "direct.example.test");
const local = "postgresql://fairstage:test-password@127.0.0.1:5432/fairstage";
const production = {
  NODE_ENV: "production",
  APP_URL: origin,
  DATABASE_URL: secure,
};
let directory: string;
let ca: string;

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "fairstage-database-config-"));
  ca = join(directory, "root-ca.txt");
  // The parser loads CA text; these tests do not establish a TLS connection.
  await writeFile(ca, "Public fixture for parser configuration checks.");
});
afterAll(async () => {
  await unlink(ca);
  await rmdir(directory);
  vi.unstubAllEnvs();
});

describe("production PostgreSQL configuration", () => {
  it("sets certificate and hostname checks in the actual pg client", () => {
    const config = databaseConfig(production);
    const client = new Client(config);
    const ssl = client.ssl as unknown as ConnectionOptions;
    expect(config).not.toHaveProperty("connectionString");
    expect(ssl.rejectUnauthorized).toBe(true);
    expect(ssl.checkServerIdentity).toBe(checkServerIdentity);
    expect(
      ssl.checkServerIdentity!("db.example.test", {
        subjectaltname: "DNS:db.example.test",
      } as Parameters<typeof checkServerIdentity>[1]),
    ).toBeUndefined();
    expect(
      ssl.checkServerIdentity!("different.example.test", {
        subjectaltname: "DNS:db.example.test",
      } as Parameters<typeof checkServerIdentity>[1]),
    ).toBeInstanceOf(Error);
  });

  it.each(["require", "verify-ca", "verify-full"])(
    "accepts %s only when the installed parser preserves both checks",
    (mode) => {
      const value = `${base}?sslmode=${mode}`;
      const parsed = parse(value);
      expect(parsed.ssl).toEqual({});
      expect(databaseUrlConfig(value, true).ssl).toMatchObject({
        rejectUnauthorized: true,
        checkServerIdentity,
      });
    },
  );

  it("rejects libpq require when the actual parser disables certificate checks", () => {
    const value = `${base}?sslmode=require&uselibpqcompat=true`;
    expect(parse(value).ssl).toMatchObject({ rejectUnauthorized: false });
    expect(() => databaseUrlConfig(value, true)).toThrow(
      "The database connection is not configured correctly.",
    );
  });

  it.each(["DATABASE_URL", "DATABASE_DIRECT_URL"] as const)(
    "rejects a nested connectionString that replaces the %s TLS settings",
    (key) => {
      const nested = `${base}?sslmode=no-verify`;
      const value = `${secure}&connectionString=${encodeURIComponent(nested)}`;
      const rawClient = new Client(toClientConfig(parse(value)));
      expect(rawClient.ssl).toMatchObject({ rejectUnauthorized: false });
      expect(() => databaseConfig({ ...production, [key]: value })).toThrow(
        "The database connection is not configured correctly.",
      );
      expect(() => databaseUrlConfig(value, true)).toThrow();
    },
  );

  it.each(["require", "verify-ca"])(
    "rejects libpq %s with a CA when the parser disables hostname checks",
    (mode) => {
      const value = `${base}?sslmode=${mode}&uselibpqcompat=true&sslrootcert=${encodeURIComponent(ca)}`;
      const ssl = parse(value).ssl as ConnectionOptions;
      expect(ssl.checkServerIdentity).toBeTypeOf("function");
      expect(() => databaseUrlConfig(value, true)).toThrow();
    },
  );

  it("accepts libpq verify-full with explicit verification in the client", () => {
    const value = `${base}?sslmode=verify-full&uselibpqcompat=true&sslrootcert=${encodeURIComponent(ca)}`;
    expect(databaseUrlConfig(value, true).ssl).toMatchObject({
      rejectUnauthorized: true,
      checkServerIdentity,
      ca: "Public fixture for parser configuration checks.",
    });
  });

  it.each([
    "",
    "?sslmode=disable",
    "?sslmode=no-verify",
    "?ssl=no-verify",
    "?sslmode=require&sslmode=no-verify",
    "?sslmode=invalid",
  ])("rejects missing or ineffective production TLS %s", (suffix) => {
    expect(() => databaseUrlConfig(base + suffix, true)).toThrow();
  });

  it.each(["runtime", "migration"] as const)(
    "rejects an unsafe direct URL before the %s connection",
    (purpose) => {
      const env = { ...production, DATABASE_DIRECT_URL: base };
      expect(() => databaseConfig(env, purpose)).toThrow();
      expect(
        readinessChecks(env).find((check) => check.id === "database_direct"),
      ).toMatchObject({ required: true, status: "missing" });
    },
  );

  it.each(["runtime", "migration"] as const)(
    "rejects an unsafe runtime URL before the %s connection",
    (purpose) => {
      const env = {
        ...production,
        DATABASE_URL: base,
        DATABASE_DIRECT_URL: direct,
      };
      expect(() => databaseConfig(env, purpose)).toThrow();
      expect(
        readinessChecks(env).find((check) => check.id === "database"),
      ).toMatchObject({ required: true, status: "missing" });
    },
  );

  it("selects the verified direct URL only for migrations", () => {
    const env = { ...production, DATABASE_DIRECT_URL: direct };
    expect(databaseConfig(env).host).toBe("db.example.test");
    expect(databaseConfig(env, "migration").host).toBe("direct.example.test");
    expect(
      readinessChecks(env).find((check) => check.id === "database_direct"),
    ).toMatchObject({ required: true, status: "configured" });
    expect(
      readinessChecks(production).find(
        (check) => check.id === "database_direct",
      ),
    ).toMatchObject({ required: false, status: "disabled" });
  });

  it.each([
    origin,
    "HTTPS://fairstage.example.test",
    " https://fairstage.example.test",
  ])(
    "checks HTTPS deployments when script NODE_ENV is unset: %s",
    (APP_URL) => {
      expect(() => databaseConfig({ APP_URL, DATABASE_URL: base })).toThrow();
      expect(
        databaseConfig({ APP_URL, DATABASE_URL: secure }).ssl,
      ).toMatchObject({
        rejectUnauthorized: true,
        checkServerIdentity,
      });
    },
  );

  it("preserves local development, migration, and production browser fixtures", () => {
    expect(databaseConfig({ DATABASE_URL: local }).host).toBe("127.0.0.1");
    expect(
      databaseConfig({ NODE_ENV: "development", DATABASE_URL: local }).host,
    ).toBe("127.0.0.1");
    expect(
      databaseConfig({
        NODE_ENV: "production",
        APP_URL: "http://127.0.0.1:3000",
        DATABASE_URL: local,
      }).host,
    ).toBe("127.0.0.1");
    expect(
      readinessChecks({ DATABASE_URL: local }).find(
        (check) => check.id === "database",
      )?.status,
    ).toBe("missing");
  });

  it("does not exempt remote connections for a local fixture origin", () => {
    expect(() =>
      databaseConfig({
        NODE_ENV: "production",
        APP_URL: "http://localhost:3000",
        DATABASE_URL: base,
      }),
    ).toThrow();
    expect(() =>
      databaseConfig({
        NODE_ENV: "production",
        APP_URL: "http://localhost:3000",
        DATABASE_URL: local + "?host=db.example.test",
      }),
    ).toThrow();
    expect(() =>
      databaseConfig({
        NODE_ENV: "production",
        APP_URL: origin,
        DATABASE_URL: local,
      }),
    ).toThrow();
  });

  it("overrides a process TLS opt-out with explicit client verification", () => {
    vi.stubEnv("NODE_TLS_REJECT_UNAUTHORIZED", "0");
    vi.stubEnv("PGSSLMODE", "no-verify");
    const client = new Client(databaseConfig(production));
    expect(client.ssl).toMatchObject({
      rejectUnauthorized: true,
      checkServerIdentity,
    });
    vi.unstubAllEnvs();
  });

  it.each([
    undefined,
    "not a URL",
    "https://db.example.test/fairstage",
    base + "/#private-password",
  ])("keeps invalid connection errors free of credentials", (value) => {
    let message = "";
    try {
      databaseUrlConfig(value, true);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toBe(
      "The database connection is not configured correctly.",
    );
    expect(message).not.toContain("private-password");
  });
});
