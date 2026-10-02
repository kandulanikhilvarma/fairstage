"use client";
import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Download,
  Info,
  Plus,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useApp, api } from "./provider";
import { JobsBoard } from "./jobs";
import { Heading, Stat } from "./workspace";
import { dateLabel, defaults, money } from "@/lib/domain";
import { preparationGuide } from "@/lib/preparation";
import { csvCell } from "@/lib/export";

export function WorkspaceJobs() {
  const { workspace: w, role, mutate } = useApp();
  const [form, setForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  if (!w) return null;
  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const d = Object.fromEntries(new FormData(e.currentTarget));
    try {
      await mutate("jobs", {
        ...d,
        salaryMin: Number(d.salaryMin),
        salaryMax: Number(d.salaryMax),
        stages: Number(d.stages),
      });
      setForm(false);
      setMessage("Job saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "The job could not save.");
    } finally {
      setBusy(false);
    }
  }
  async function close(id: string) {
    setError("");
    try {
      await mutate(`jobs/${id}/close`);
      setMessage("Job closed.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "The job could not close.");
    }
  }
  return (
    <>
      <Heading
        title={
          role === "employer"
            ? "Jobs and applications"
            : "Explore paid interviews"
        }
        description={
          role === "employer"
            ? "Publish a role, then offer clear paid rounds."
            : "Find a role with a process that respects your time."
        }
      >
        {role === "employer" && (
          <button className="button" onClick={() => setForm(!form)}>
            <Plus size={16} />
            {form ? "Close form" : "Post a job"}
          </button>
        )}
      </Heading>
      {error && (
        <div role="alert" className="notice error alert-space">
          {error}
        </div>
      )}
      {message && (
        <div role="status" className="notice success alert-space">
          {message}
        </div>
      )}
      {form && (
        <section className="form-panel">
          <h2>Post a role</h2>
          <form onSubmit={create}>
            <div className="field-row">
              <div className="field">
                <label htmlFor="job-title">Role title</label>
                <input
                  id="job-title"
                  name="title"
                  required
                  minLength={2}
                  maxLength={100}
                />
              </div>
              <div className="field">
                <label htmlFor="job-location">Location and remote policy</label>
                <input
                  id="job-location"
                  name="location"
                  required
                  minLength={2}
                  maxLength={100}
                  placeholder="Remote · Europe"
                />
              </div>
            </div>
            <div className="field-row">
              <div className="field">
                <label htmlFor="job-category-form">Category</label>
                <select id="job-category-form" name="category">
                  {["Engineering", "Design", "Product", "Operations"].map(
                    (c) => (
                      <option key={c}>{c}</option>
                    ),
                  )}
                </select>
              </div>
              <div className="field">
                <label htmlFor="job-stages">Number of paid rounds</label>
                <input
                  id="job-stages"
                  name="stages"
                  type="number"
                  min={1}
                  max={5}
                  required
                  defaultValue={3}
                />
              </div>
            </div>
            <div className="field-row">
              <div className="field">
                <label htmlFor="job-min">Minimum annual salary · USD</label>
                <input
                  id="job-min"
                  name="salaryMin"
                  type="number"
                  min={0}
                  max={1000000}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="job-max">Maximum annual salary · USD</label>
                <input
                  id="job-max"
                  name="salaryMax"
                  type="number"
                  min={0}
                  max={1000000}
                  required
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor="job-description">
                Role and interview process
              </label>
              <textarea
                id="job-description"
                name="description"
                required
                minLength={30}
                maxLength={8000}
              />
            </div>
            <div className="form-actions">
              <button className="button" disabled={busy}>
                {busy ? "Save role…" : "Publish role"}
              </button>
              <button
                type="button"
                className="button secondary"
                onClick={() => setForm(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        </section>
      )}
      {role === "candidate" ? (
        <>
          <JobsBoard />
          <section className="panel" style={{ marginTop: 28 }}>
            <div className="panel-heading">
              <h2>Your applications</h2>
            </div>
            <div className="panel-body">
              {w.applications.length ? (
                w.applications.map((a) => (
                  <div className="activity-row" key={a.id}>
                    <div>
                      <strong>{a.note.slice(0, 80)}</strong>
                      <small>{dateLabel(a.createdAt)}</small>
                    </div>
                    <span className="status">{a.status}</span>
                  </div>
                ))
              ) : (
                <p>No applications yet. Explore an open role.</p>
              )}
            </div>
          </section>
        </>
      ) : (
        <>
          <section className="panel">
            <div className="panel-heading">
              <h2>Your roles</h2>
            </div>
            <div className="panel-body">
              {w.jobs.length ? (
                w.jobs.map((j) => (
                  <div className="activity-row" key={j.id}>
                    <div>
                      <strong>{j.title}</strong>
                      <small>
                        {j.location} · {j.stages} paid rounds · {j.status}
                      </small>
                    </div>
                    {j.status === "open" && (
                      <button
                        className="button secondary small"
                        onClick={() => void close(j.id)}
                      >
                        Close role
                      </button>
                    )}
                  </div>
                ))
              ) : (
                <p>
                  No roles yet. Post a role with a clear salary range and
                  interview process.
                </p>
              )}
            </div>
          </section>
          <section className="panel">
            <div className="panel-heading">
              <h2>Candidate applications</h2>
              <Link href="/workspace/interviews" className="text-link">
                Offer a round <ArrowRight size={15} />
              </Link>
            </div>
            {w.applications.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Candidate</th>
                      <th scope="col">Note</th>
                      <th scope="col">State</th>
                    </tr>
                  </thead>
                  <tbody>
                    {w.applications.map((a) => (
                      <tr key={a.id}>
                        <td>
                          <strong>{a.candidateName}</strong>
                          <small>{a.email}</small>
                        </td>
                        <td>{a.note}</td>
                        <td>
                          <span className="status">{a.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="panel-body">
                <p>No applications yet.</p>
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}
export function WalletPage() {
  const { workspace: w, role, config } = useApp();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  if (!w) return null;
  const earned = w.rounds
    .filter((r) => r.status === "paid")
    .reduce((n, r) => n + r.amountCents, 0);
  const funded = w.rounds
    .filter((r) => ["funded", "completed"].includes(r.status))
    .reduce((n, r) => n + r.amountCents, 0);
  async function connect() {
    setBusy(true);
    setMessage("");
    try {
      const r = await api<{ url: string }>("connect", {});
      window.location.assign(r.url);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Payment setup failed.");
    } finally {
      setBusy(false);
    }
  }
  function download() {
    if (!w) return;
    const rows = [
      ["Date", "Event", "Round ID", "Amount USD"],
      ...w.ledger.map((l) => [
        l.createdAt,
        l.type,
        l.roundId,
        (l.amountCents / 100).toFixed(2),
      ]),
    ];
    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "fairstage-payment-records.csv";
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <>
      <Heading
        title={role === "employer" ? "Payment records" : "Your interview pay"}
        description="Follow the amount from funded round to connected account."
      >
        <button className="button secondary" onClick={download}>
          <Download size={16} />
          Export CSV
        </button>
      </Heading>
      <div className="stats">
        <Stat
          label="Candidate pay released"
          value={money(earned)}
          note="To connected accounts"
        />
        <Stat
          label="Candidate pay funded"
          value={money(funded)}
          note="Completion or review pending"
        />
        <Stat
          label="Candidate platform fee"
          value="$0"
          note="The employer pays the fee"
        />
      </div>
      <div className="notice alert-space">
        <Info size={18} />
        <span>
          {config.demo
            ? "Demo amounts represent fictional activity. No card, bank account, or real balance exists."
            : "Released means a transfer to the connected account. Stripe controls bank settlement. These records are not tax invoices."}
        </span>
      </div>
      {role === "candidate" && (
        <section className="panel">
          <div className="panel-heading">
            <h2>Payment account</h2>
            <ShieldCheck size={19} />
          </div>
          <div className="panel-body">
            <p>
              {config.demo
                ? "The demo does not collect bank or identity details. A live account uses Stripe&apos;s hosted setup."
                : "Complete payment setup on Stripe. Your account country must match the pilot's supported countries."}
            </p>
            {!config.demo && (
              <button
                className="button"
                onClick={() => void connect()}
                disabled={busy}
              >
                {busy
                  ? "Open payment setup…"
                  : "Set up or update payment account"}
                <ArrowRight size={16} />
              </button>
            )}
            {message && (
              <div
                role="alert"
                className="notice error"
                style={{ marginTop: 20 }}
              >
                {message}
              </div>
            )}
          </div>
        </section>
      )}
      <section className="panel">
        <div className="panel-heading">
          <h2>Payment events</h2>
        </div>
        {w.ledger.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Event</th>
                  <th scope="col">Date</th>
                  <th scope="col">Amount</th>
                  <th scope="col">Round</th>
                </tr>
              </thead>
              <tbody>
                {w.ledger.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <strong>{l.type === "paid" ? "Released" : l.type}</strong>
                    </td>
                    <td>{dateLabel(l.createdAt)}</td>
                    <td>{money(l.amountCents)}</td>
                    <td>
                      {w.rounds.find((r) => r.id === l.roundId)?.kind ||
                        l.roundId.slice(0, 8)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="panel-body">
            <p>No payment events yet.</p>
          </div>
        )}
      </section>
      <p className="small-text muted">
        Funding events include the employer fee. Release events show candidate
        pay. The app does not deduct a salary.
      </p>
    </>
  );
}
export function Profile() {
  const { workspace: w, mutate, config, reset } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  if (!w) return null;
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    const input = Object.fromEntries(new FormData(e.currentTarget));
    try {
      await mutate("profile", input);
      setMessage("Profile saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "The profile could not save.");
    } finally {
      setBusy(false);
    }
  }
  async function verify() {
    setBusy(true);
    setError("");
    try {
      const r = await api<{ message: string }>("auth/verify-request", {});
      setMessage(r.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The email request failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Heading
        title="Account settings"
        description="Keep your profile and payment country accurate."
      />
      {error && (
        <div role="alert" className="notice error alert-space">
          {error}
        </div>
      )}
      {message && (
        <div role="status" className="notice success alert-space">
          {message}
        </div>
      )}
      <section className="form-panel">
        <h2>Your profile</h2>
        <form onSubmit={save} key={w.user.id}>
          <div className="field-row">
            <div className="field">
              <label htmlFor="profile-name">Name</label>
              <input
                id="profile-name"
                name="name"
                defaultValue={w.user.name}
                required
                minLength={2}
                maxLength={100}
              />
            </div>
            <div className="field">
              <label htmlFor="profile-company">Company</label>
              <input
                id="profile-company"
                name="company"
                defaultValue={w.user.company}
                maxLength={100}
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="profile-country">Account country</label>
            <select
              id="profile-country"
              name="country"
              defaultValue={w.user.country}
            >
              {[
                ["US", "United States"],
                ["GB", "United Kingdom"],
                ["CA", "Canada"],
                ["AU", "Australia"],
                ["IN", "India"],
                ["DE", "Germany"],
                ["FR", "France"],
              ].map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
            <small>
              Country support for payments depends on the operator and provider.
            </small>
          </div>
          <div className="field">
            <label htmlFor="profile-bio">Profile note</label>
            <textarea
              id="profile-bio"
              name="bio"
              defaultValue={w.user.bio}
              maxLength={2000}
            />
          </div>
          <button className="button" disabled={busy}>
            {busy ? "Save profile…" : "Save profile"}
          </button>
        </form>
      </section>
      <section className="form-panel">
        <h2>Email and access</h2>
        <p className="muted small-text">
          {w.user.email} ·{" "}
          {w.user.verified
            ? "Verified"
            : "Verification required before payment use"}
        </p>
        {!config.demo && !w.user.verified && (
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => void verify()}
          >
            Send verification link
          </button>
        )}
        {config.demo && (
          <>
            <p className="small-text muted">
              Reset the fictional workspace to its starting state. All demo
              changes in this browser will be removed.
            </p>
            <button className="button secondary" onClick={reset}>
              Reset demo
            </button>
          </>
        )}
      </section>
    </>
  );
}
export function Preparation() {
  const { config } = useApp();
  const [topic, setTopic] = useState(
    "Product design: explain a project and the choices behind it",
  );
  const [kind, setKind] = useState(defaults[1].kind as string);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [output, setOutput] = useState("");
  const [source, setSource] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (config.demo) {
        setOutput(preparationGuide(topic, kind));
        setSource("Local preparation guide");
      } else {
        const r = await api<{ text: string; source: string }>("assistant", {
          topic,
          kind,
          consent,
        });
        setOutput(r.text);
        setSource(r.source);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "The guide could not load.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Heading
        title="Prepare with purpose"
        description="Build a practice plan. A person makes every hire decision."
      />
      <div className="notice alert-space">
        <Sparkles size={18} />
        <span>
          {config.ai && !config.demo
            ? "An optional AI service can suggest questions. Review its output before use."
            : "This deployment uses a local guide. No topic goes to an AI provider."}
        </span>
      </div>
      <section className="form-panel">
        <h2>What is the round about?</h2>
        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="prep-topic">Role or topic</label>
            <textarea
              id="prep-topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              minLength={3}
              maxLength={500}
              required
            />
            <small>
              Use a general topic. Do not include personal identifiers or
              confidential work.
            </small>
          </div>
          <div className="field">
            <label htmlFor="prep-kind">Round type</label>
            <select
              id="prep-kind"
              value={kind}
              onChange={(e) => setKind(e.target.value)}
            >
              {defaults.map((r) => (
                <option key={r.kind}>{r.kind}</option>
              ))}
            </select>
          </div>
          {config.ai && !config.demo && (
            <label className="checkbox">
              <input
                type="checkbox"
                required
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              I consent to send this topic and round type to the configured AI
              service.
            </label>
          )}
          <button className="button" disabled={busy}>
            {busy ? "Create guide…" : "Create preparation guide"}
            <ArrowRight size={16} />
          </button>
        </form>
      </section>
      {error && (
        <div className="notice error alert-space" role="alert">
          {error}
        </div>
      )}
      {output && (
        <section aria-live="polite">
          <h2 style={{ fontSize: 20 }}>Your practice plan</h2>
          <p className="small-text muted">Source: {source}</p>
          <div className="preparation-output">{output}</div>
        </section>
      )}
    </>
  );
}
export function Analytics() {
  const { workspace: w } = useApp();
  if (!w) return null;
  const states = [
    "offered",
    "accepted",
    "funded",
    "completed",
    "paid",
    "disputed",
    "cancelled",
  ];
  const released = w.rounds.filter((r) => r.status === "paid");
  return (
    <>
      <Heading
        title="A view of your process"
        description="Actual workspace records. No predictions or candidate scores."
      />
      <div className="stats">
        <Stat
          label="Recorded rounds"
          value={String(w.rounds.length)}
          note="Across all states"
        />
        <Stat
          label="Released rounds"
          value={String(released.length)}
          note="Both people confirmed completion"
        />
        <Stat
          label="Pay released"
          value={money(released.reduce((n, r) => n + r.amountCents, 0))}
          note="Candidate amount only"
        />
      </div>
      <div className="grid-two">
        <section className="panel">
          <div className="panel-heading">
            <h2>Round states</h2>
          </div>
          <div className="panel-body chart-bars">
            {states.map((s) => {
              const count = w.rounds.filter((r) => r.status === s).length;
              return (
                <div key={s}>
                  <div className="chart-label">
                    <span>
                      {s === "paid"
                        ? "Released"
                        : s[0].toUpperCase() + s.slice(1)}
                    </span>
                    <strong>{count}</strong>
                  </div>
                  <div className="chart-track" aria-hidden="true">
                    <span
                      style={{
                        width: `${w.rounds.length ? (count / w.rounds.length) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h2>Open disputes</h2>
          </div>
          <div className="panel-body">
            {w.disputes.length ? (
              w.disputes.map((d) => (
                <div className="activity-row" key={d.id}>
                  <div>
                    <strong>{d.reason}</strong>
                    <small>
                      {dateLabel(d.createdAt)} · {d.status}
                    </small>
                  </div>
                </div>
              ))
            ) : (
              <p>No disputes in your current records.</p>
            )}
            <p className="result-note">
              Disputes need a support review. The assistant cannot resolve them.
            </p>
            <Link href="/policy" className="text-link">
              Review the pay policy <ArrowRight size={15} />
            </Link>
          </div>
        </section>
      </div>
    </>
  );
}
