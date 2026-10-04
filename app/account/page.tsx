"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Mail } from "lucide-react";
import { PublicShell } from "@/components/site";
import { api, useApp } from "@/components/provider";
import type { Role } from "@/lib/domain";
export default function Account() {
  const { config, refresh, loading } = useApp();
  const router = useRouter();
  const [mode, setMode] = useState("login");
  const [role, setRole] = useState<Role>("candidate");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [token, setToken] = useState("");
  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    const action = search.get("action");
    Promise.resolve().then(() => {
      if (["reset", "verify", "magic"].includes(action || "")) {
        setMode(action!);
        setToken(search.get("token") || "");
      }
      if (search.get("role") === "employer") setRole("employer");
      const errors: Record<string, string> = {
        google_cancelled: "Google sign-in was cancelled. Please try again.",
        google_expired: "The sign-in request expired. Please try again.",
        google_unavailable:
          "Google sign-in could not complete. Please use email.",
        email_link_required:
          "Confirm this email with an email link before you connect Google.",
      };
      if (search.get("authError"))
        setError(
          errors[search.get("authError")!] ||
            "Sign-in could not complete. Please try again.",
        );
    });
  }, []);
  async function google() {
    setBusy(true);
    setError("");
    try {
      const r = await api<{ url: string }>("auth/google", { role });
      window.location.assign(r.url);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Google sign-in could not start.",
      );
      setBusy(false);
    }
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      let route = "auth/login";
      let body: unknown = data;
      if (mode === "register") {
        route = "auth/register";
        body = { ...data, role };
      }
      if (mode === "link") {
        route = "auth/magic/start";
        body = { ...data, role };
      }
      if (mode === "magic") {
        route = "auth/magic/verify";
        body = { token };
      }
      if (mode === "forgot") route = "auth/reset-request";
      if (mode === "reset" || mode === "verify") {
        route = "auth/token";
        body = {
          token,
          purpose: mode,
          password: data.password,
          role,
          name: data.name,
        };
      }
      const result = await api<{ message: string }>(route, body);
      if (["login", "register", "magic"].includes(mode)) {
        await refresh();
        router.replace("/workspace");
        router.refresh();
      } else setMessage(result.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The account request failed.");
    } finally {
      setBusy(false);
    }
  }
  const recovery = ["forgot", "reset", "verify", "magic"].includes(mode);
  const headings: Record<string, string> = {
    login: "Welcome back.",
    register: "Create your account.",
    link: "A link. No password.",
    magic: "Confirm your sign-in.",
    forgot: "Reset your password.",
    reset: "Choose a new password.",
    verify: "Verify your email.",
  };
  return (
    <PublicShell>
      <div className="auth-layout">
        <div className="auth-art">
          <h1>
            A fair round
            <br />
            starts <span>here.</span>
          </h1>
          <p>A clear amount. A clear scope. A record of your time and pay.</p>
          <div style={{ display: "grid", gap: 18, marginTop: 40 }}>
            <span className="tick">
              <Check size={20} />
              Candidate pay stays independent of the hire.
            </span>
            <span className="tick">
              <Check size={20} />
              Each person confirms completion.
            </span>
            <span className="tick">
              <Check size={20} />
              No candidate platform fee.
            </span>
          </div>
        </div>
        <div className="auth-form">
          <h2>{headings[mode]}</h2>
          {!loading && !config.accounts && (
            <div className="notice alert-space" role="status">
              Sign-in is temporarily unavailable. Please try again later.
            </div>
          )}
          {error && (
            <div className="notice error alert-space" role="alert">
              {error}
            </div>
          )}
          {message && (
            <div className="notice success alert-space" role="status">
              {message}
            </div>
          )}
          {!recovery && (
            <>
              <div
                className="role-switch alert-space"
                role="group"
                aria-label="Account type"
              >
                {(["candidate", "employer"] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    className={role === r ? "active" : ""}
                    aria-pressed={role === r}
                    onClick={() => setRole(r)}
                  >
                    {r === "candidate" ? "I’m a candidate" : "I’m hiring"}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="button secondary full"
                disabled={busy || !config.google}
                onClick={() => void google()}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.73-.06-1.42-.19-2.09H12v3.96h5.92c-.26 1.28-1.04 2.36-2.22 3.09v2.56h3.59c2.1-1.89 3.27-4.68 3.27-7.52Z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.63l-3.59-2.56c-.99.66-2.26 1.05-3.69 1.05-2.87 0-5.3-1.94-6.16-4.54H2.13v2.64A11 11 0 0 0 12 23Z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.32a6.6 6.6 0 0 1 0-4.64V7.04H2.13a11 11 0 0 0 0 9.92l3.71-2.64Z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.14c1.62 0 3.07.56 4.21 1.66l3.16-3.16A10.55 10.55 0 0 0 12 1a11 11 0 0 0-9.87 6.04l3.71 2.64C6.7 7.08 9.13 5.14 12 5.14Z"
                  />
                </svg>
                Continue with Google
              </button>
              {!config.google && !loading && (
                <p className="form-hint">
                  Google sign-in is currently unavailable. Use email when
                  account access is active.
                </p>
              )}
              <div
                className="tabs alert-space"
                role="group"
                aria-label="Sign-in method"
              >
                {["login", ...(config.magic ? ["link"] : []), "register"].map(
                  (m) => (
                    <button
                      key={m}
                      type="button"
                      aria-pressed={mode === m}
                      onClick={() => {
                        setMode(m);
                        setError("");
                        setMessage("");
                      }}
                    >
                      {m === "login"
                        ? "Password"
                        : m === "link"
                          ? "Email link"
                          : "Create account"}
                    </button>
                  ),
                )}
              </div>
            </>
          )}
          {mode === "link" && (
            <p className="form-hint">
              We will email a one-time link. Open it in this browser within 15
              minutes.
            </p>
          )}
          {mode === "magic" && (
            <p className="form-hint">
              Continue to confirm the sign-in you requested in this browser.
            </p>
          )}
          {["verify", "reset"].includes(mode) && (
            <>
              <p className="form-hint">
                Set your own password to confirm ownership of this email. Choose
                an account type if this is a new account.
              </p>
              <div
                className="role-switch alert-space"
                role="group"
                aria-label="Account type"
              >
                {(["candidate", "employer"] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    className={role === r ? "active" : ""}
                    aria-pressed={role === r}
                    onClick={() => setRole(r)}
                  >
                    {r === "candidate" ? "I’m a candidate" : "I’m hiring"}
                  </button>
                ))}
              </div>
            </>
          )}
          <form onSubmit={submit}>
            {mode === "verify" && (
              <div className="field">
                <label htmlFor="verify-name">Your name</label>
                <input
                  id="verify-name"
                  name="name"
                  autoComplete="name"
                  required
                  minLength={2}
                  maxLength={100}
                />
              </div>
            )}
            {mode === "register" && (
              <>
                <div className="field">
                  <label htmlFor="account-name">Your name</label>
                  <input
                    id="account-name"
                    name="name"
                    required
                    minLength={2}
                    maxLength={100}
                    autoComplete="name"
                  />
                </div>
                {role === "employer" && (
                  <div className="field">
                    <label htmlFor="account-company">Company</label>
                    <input
                      id="account-company"
                      name="company"
                      maxLength={100}
                    />
                  </div>
                )}
              </>
            )}
            {!["reset", "verify", "magic"].includes(mode) && (
              <div className="field">
                <label htmlFor="account-email">Email address</label>
                <input
                  id="account-email"
                  type="email"
                  name="email"
                  autoComplete="email"
                  required
                  maxLength={254}
                />
              </div>
            )}
            {["login", "register", "reset", "verify"].includes(mode) && (
              <div className="field">
                <label htmlFor="account-password">Password</label>
                <input
                  id="account-password"
                  type="password"
                  name="password"
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  required
                  minLength={mode === "login" ? 1 : 12}
                  maxLength={128}
                />
                {mode !== "login" && <small>Use at least 12 characters.</small>}
              </div>
            )}
            <button
              className="button full"
              disabled={
                busy ||
                loading ||
                !config.accounts ||
                (mode === "link" && !config.magic)
              }
            >
              {busy
                ? "Please wait…"
                : (
                    {
                      login: "Sign in",
                      register: "Create account",
                      link: "Send sign-in link",
                      magic: "Continue to workspace",
                      forgot: "Send reset link",
                      reset: "Save new password",
                      verify: "Verify email",
                    } as Record<string, string>
                  )[mode]}
              {mode === "link" ? <Mail size={17} /> : <ArrowRight size={17} />}
            </button>
          </form>
          {mode === "login" && config.email && (
            <button
              className="text-link"
              style={{ marginTop: 20 }}
              onClick={() => setMode("forgot")}
            >
              Forgot your password?
            </button>
          )}
          {recovery && (
            <button
              className="text-link"
              style={{ marginTop: 20 }}
              onClick={() => {
                setMode("login");
                setError("");
                setMessage("");
              }}
            >
              Back to sign in
            </button>
          )}
          <p className="form-hint">
            Review the{" "}
            <Link href="/policy" className="text-link">
              pay policy
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="text-link">
              privacy notice
            </Link>{" "}
            before you create an account.
          </p>
        </div>
      </div>
    </PublicShell>
  );
}
