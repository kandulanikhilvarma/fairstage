import { checkServerIdentity, type ConnectionOptions } from "node:tls";
import { parse, toClientConfig } from "pg-connection-string";
import type { ClientConfig } from "pg";

type Environment = Record<string, string | undefined>;
const loopbackHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const configurationError = () =>
  new Error("The database connection is not configured correctly.");

function localAppOrigin(value: string | undefined) {
  try {
    const url = new URL(value ?? "");
    return (
      url.protocol === "http:" &&
      loopbackHosts.has(url.hostname) &&
      !url.username &&
      !url.password &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

export function databaseUrlConfig(
  value: string | undefined,
  requireTls: boolean,
  allowLocal = false,
): ClientConfig {
  try {
    const url = new URL(value ?? "");
    if (
      !["postgres:", "postgresql:"].includes(url.protocol) ||
      !url.hostname ||
      url.pathname.length <= 1 ||
      url.hash
    )
      throw configurationError();
    const parsed = parse(value!);
    if (
      !parsed.host ||
      parsed.host.startsWith("/") ||
      "connectionString" in parsed
    )
      throw configurationError();
    const local =
      allowLocal &&
      loopbackHosts.has(url.hostname) &&
      loopbackHosts.has(parsed.host);
    const config = toClientConfig(parsed);
    if (requireTls && !local) {
      const ssl = parsed.ssl as
        boolean | string | ConnectionOptions | undefined;
      // Check the installed parser's effective settings, including libpq mode.
      // A TLS connection must verify both the certificate and the server name.
      if (
        !["require", "verify-ca", "verify-full"].includes(
          url.searchParams.get("sslmode") ?? "",
        ) ||
        !ssl ||
        typeof ssl !== "object" ||
        ssl.rejectUnauthorized === false ||
        ssl.checkServerIdentity !== undefined
      )
        throw configurationError();
      config.ssl = {
        ...ssl,
        rejectUnauthorized: true,
        checkServerIdentity,
      };
    }
    // Do not pass connectionString: pg would parse it again and replace SSL.
    return config;
  } catch {
    // Parser errors can contain paths or connection details. Keep them private.
    throw configurationError();
  }
}

export function databaseConfig(
  env: Environment,
  purpose: "runtime" | "migration" = "runtime",
) {
  let requireTls = env.NODE_ENV === "production";
  try {
    requireTls ||= new URL(env.APP_URL ?? "").protocol === "https:";
  } catch {}
  const allowLocal = localAppOrigin(env.APP_URL);
  const runtime = databaseUrlConfig(env.DATABASE_URL, requireTls, allowLocal);
  const direct = env.DATABASE_DIRECT_URL
    ? databaseUrlConfig(env.DATABASE_DIRECT_URL, requireTls, allowLocal)
    : runtime;
  return purpose === "migration" ? direct : runtime;
}
