"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { PublicShell } from "@/components/site";
import { api, useApp } from "@/components/provider";
export default function Account() {
  const { config, refresh } = useApp();
  const [mode, setMode] = useState("login");
  const [role, setRole] = useState("employer");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [token, setToken] = useState("");
  useEffect(() => {
    Promise.resolve().then(() => {
      const search = new URLSearchParams(window.location.search);
      const action = search.get("action");
      if (action === "reset" || action === "verify") {
        setMode(action);
        setToken(search.get("token") || "");
      }
    });
  }, []);
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
      if (mode === "forgot") route = "auth/reset-request";
      if (mode === "reset" || mode === "verify") {
        route = "auth/token";
        body = { token, purpose: mode, password: data.password };
      }
      const result = await api<{ message: string }>(route, body);
      if (mode === "login" || mode === "register") {
        await refresh();
        window.location.assign("/workspace");
      } else setMessage(result.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The account request failed.");
    } finally {
      setBusy(false);
    }
  }
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
          {config.demo ? (
            <>
              <h2>Try the whole process.</h2>
              <p className="muted">
                This deployment is an interactive demo. Real account
                registration and payments are disabled.
              </p>
              <div className="notice alert-space">
                Use fictional information only. Demo changes stay in this
                browser.
              </div>
              <Link href="/workspace" className="button full">
                Open employer demo <ArrowRight size={18} />
              </Link>
              <Link
                href="/workspace?role=candidate"
                className="button secondary full"
                style={{ marginTop: 14 }}
              >
                Open candidate demo <ArrowRight size={18} />
              </Link>
            </>
          ) : (
            <>
              <div className="tabs" role="tablist" aria-label="Account action">
                {["login", "register"].map((m) => (
                  <button
                    key={m}
                    role="tab"
                    aria-selected={mode === m}
                    onClick={() => {
                      setMode(m);
                      setError("");
                      setMessage("");
                    }}
                  >
                    {m === "login" ? "Sign in" : "Create account"}
                  </button>
                ))}
              </div>
              <h2>
                {
                  (
                    {
                      login: "Welcome back.",
                      register: "Create your account.",
                      forgot: "Reset your password.",
                      reset: "Choose a new password.",
                      verify: "Verify your email.",
                    } as Record<string, string>
                  )[mode]
                }
              </h2>
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
              <form onSubmit={submit}>
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
                    <div className="field">
                      <label htmlFor="account-role">Account type</label>
                      <select
                        id="account-role"
                        value={role}
                        onChange={(e) => setRole(e.target.value)}
                      >
                        <option value="employer">Employer</option>
                        <option value="candidate">Candidate</option>
                      </select>
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
                {!["reset", "verify"].includes(mode) && (
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
                {!["forgot", "verify"].includes(mode) && (
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
                    {mode !== "login" && (
                      <small>Use at least 12 characters.</small>
                    )}
                  </div>
                )}
                <button className="button full" disabled={busy}>
                  {busy
                    ? "Please wait…"
                    : (
                        {
                          login: "Sign in",
                          register: "Create account",
                          forgot: "Send reset link",
                          reset: "Save new password",
                          verify: "Verify email",
                        } as Record<string, string>
                      )[mode]}
                  <ArrowRight size={17} />
                </button>
              </form>
              {mode === "login" && (
                <button
                  className="text-link"
                  style={{ marginTop: 20, background: "none", padding: 0 }}
                  onClick={() => setMode("forgot")}
                >
                  Forgot your password?
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
            </>
          )}
        </div>
      </div>
    </PublicShell>
  );
}
