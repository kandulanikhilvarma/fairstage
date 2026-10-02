"use client";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Plus,
  ShieldAlert,
} from "lucide-react";
import { useApp } from "./provider";
import { Heading, Status } from "./workspace";
import { dateLabel, defaults, money, quote } from "@/lib/domain";

export function NewRound({ onDone }: { onDone: () => void }) {
  const { mutate, config } = useApp();
  const [kind, setKind] = useState(0);
  const [amount, setAmount] = useState(15);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const q =
    Number.isFinite(amount) && amount >= 5 && amount <= 10000
      ? quote(Math.round(amount * 100))
      : null;
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const d = Object.fromEntries(new FormData(e.currentTarget));
    try {
      await mutate("rounds", {
        ...d,
        kind: defaults[kind].kind,
        minutes: Number(d.minutes),
        amountCents: Math.round(amount * 100),
        scheduledAt: new Date(String(d.scheduledAt)).toISOString(),
      });
      onDone();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "The round could not save.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="form-panel">
      <h2>Offer a paid round</h2>
      <p className="small-text muted">
        Set the terms first. The candidate accepts before you fund the round.
      </p>
      {config.demo && (
        <div className="notice alert-space">
          This is a demo invitation. It goes to the fictional candidate
          workspace in this browser.
        </div>
      )}
      {error && (
        <div className="notice error alert-space" role="alert">
          {error}
        </div>
      )}
      <form onSubmit={submit}>
        <div className="field-row">
          <div className="field">
            <label htmlFor="round-email">Candidate email</label>
            <input
              id="round-email"
              name="candidateEmail"
              type="email"
              required
              defaultValue={config.demo ? "alex@example.test" : ""}
              maxLength={254}
            />
          </div>
          <div className="field">
            <label htmlFor="round-title">Role title</label>
            <input
              id="round-title"
              name="title"
              required
              defaultValue="Product designer"
              minLength={2}
              maxLength={100}
            />
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="round-kind">Round type</label>
            <select
              id="round-kind"
              value={kind}
              onChange={(e) => {
                const i = +e.target.value;
                setKind(i);
                setAmount(defaults[i].cents / 100);
              }}
            >
              {defaults.map((r, i) => (
                <option key={r.kind} value={i}>
                  {r.kind}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="round-minutes">Duration · minutes</label>
            <input
              key={kind}
              id="round-minutes"
              name="minutes"
              type="number"
              min={15}
              max={180}
              required
              defaultValue={defaults[kind].minutes}
            />
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="round-amount">Candidate pay · USD</label>
            <input
              id="round-amount"
              type="number"
              min={5}
              max={10000}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(+e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="round-date">Date and time · your local time</label>
            <input
              id="round-date"
              name="scheduledAt"
              type="datetime-local"
              required
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="round-url">Meeting link</label>
          <input
            id="round-url"
            name="meetingUrl"
            type="url"
            required
            defaultValue={config.demo ? "https://meet.example.test/demo" : ""}
            placeholder="https://…"
            maxLength={500}
          />
        </div>
        <div className="field">
          <label htmlFor="round-terms">Scope and terms</label>
          <textarea
            id="round-terms"
            name="terms"
            required
            minLength={20}
            maxLength={3000}
            defaultValue="We will discuss one relevant project within the agreed time. You keep the round pay regardless of the hire decision. No salary deduction applies."
          />
        </div>
        {q && (
          <div className="notice alert-space">
            Candidate receives {money(q.amountCents)}. Employer pays{" "}
            {money(q.totalCents)}, including the {money(q.feeCents)} platform
            fee.
          </div>
        )}
        <div className="form-actions">
          <button className="button" disabled={busy}>
            {busy ? "Save round…" : "Send round offer"}
            <ArrowRight size={16} />
          </button>
          <button type="button" className="button secondary" onClick={onDone}>
            Cancel
          </button>
        </div>
      </form>
    </section>
  );
}
export function Interviews() {
  const { workspace: w, role, config, mutate } = useApp();
  const [filter, setFilter] = useState("all");
  const [open, setOpen] = useState("");
  const [form, setForm] = useState(false);
  const [dispute, setDispute] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  if (!w) return null;
  const rounds = w.rounds.filter(
    (r) =>
      filter === "all" ||
      (filter === "active"
        ? !["paid", "cancelled"].includes(r.status)
        : r.status === filter),
  );
  async function action(
    id: string,
    act: string,
    input: Record<string, unknown> = {},
  ) {
    setBusy(id + act);
    setError("");
    setMessage("");
    try {
      const result = await mutate(`rounds/${id}/${act}`, input);
      if (result.url) window.location.assign(result.url);
      else
        setMessage(
          config.demo
            ? "Demo round updated. No real money moved."
            : "Round updated.",
        );
      setDispute("");
      setReason("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "The round action failed.");
    } finally {
      setBusy("");
    }
  }
  return (
    <>
      <Heading
        title="Interview rounds"
        description="Clear terms, a stated amount, and a visible payment state."
      >
        {role === "employer" && (
          <button className="button" onClick={() => setForm(!form)}>
            <Plus size={17} />
            {form ? "Close form" : "Offer a round"}
          </button>
        )}
      </Heading>
      {form && <NewRound onDone={() => setForm(false)} />}
      <div className="pill-row" role="group" aria-label="Filter rounds">
        {["all", "active", "paid", "disputed", "cancelled"].map((f) => (
          <button
            key={f}
            aria-pressed={filter === f}
            className={filter === f ? "active" : ""}
            onClick={() => setFilter(f)}
          >
            {f === "paid" ? "Released" : f[0].toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>
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
      {rounds.map((r) => {
        const expanded = open === r.id;
        const confirmed =
          role === "employer" ? r.employerConfirmed : r.candidateConfirmed;
        const hasEnded = Date.parse(r.scheduledAt) + r.minutes * 60000 <= now;
        return (
          <article className="round-item" key={r.id}>
            <div className="round-summary">
              <div>
                <h2>
                  {r.kind} · {r.title}
                </h2>
                <p>
                  {role === "employer" ? r.candidateName : r.company} ·{" "}
                  {dateLabel(r.scheduledAt)}
                </p>
              </div>
              <Status round={r} />
              <strong className="amount">{money(r.amountCents)}</strong>
              <button
                className="button secondary small"
                aria-expanded={expanded}
                onClick={() => setOpen(expanded ? "" : r.id)}
              >
                {expanded ? "Close" : "Details"}
                {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
            </div>
            {expanded && (
              <div className="round-details">
                <div className="round-details-grid">
                  <div>
                    <h3>Agreed scope</h3>
                    <p>{r.terms}</p>
                    <p>{r.minutes} minutes · No salary deduction</p>
                    {config.demo ? (
                      <p>Demo meeting link. No live call exists.</p>
                    ) : (
                      <a
                        className="text-link"
                        href={r.meetingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Open meeting link <ExternalLink size={15} />
                      </a>
                    )}
                  </div>
                  <div>
                    <h3>Payment breakdown</h3>
                    <div className="money-row">
                      <span>Candidate pay</span>
                      <strong>{money(r.amountCents)}</strong>
                    </div>
                    <div className="money-row">
                      <span>Employer platform fee</span>
                      <strong>{money(r.feeCents)}</strong>
                    </div>
                    <div className="money-row">
                      <span>Employer total</span>
                      <strong>{money(r.amountCents + r.feeCents)}</strong>
                    </div>
                  </div>
                </div>
                {["funded", "completed"].includes(r.status) && (
                  <p className="small-text muted" style={{ marginTop: 18 }}>
                    Employer confirmed: {r.employerConfirmed ? "Yes" : "No"} ·
                    Candidate confirmed: {r.candidateConfirmed ? "Yes" : "No"}
                    {!hasEnded && " · Confirm after the scheduled round ends."}
                  </p>
                )}
                {r.status === "paid" && (
                  <div className="notice success">
                    <Check size={18} />
                    Pay released to the connected account. Bank settlement
                    follows the provider schedule.
                  </div>
                )}
                {r.status === "disputed" && (
                  <div className="notice warning">
                    <ShieldAlert size={18} />
                    This round needs support review. Payment release is blocked.
                  </div>
                )}
                <div className="round-actions">
                  {role === "candidate" && r.status === "offered" && (
                    <button
                      className="button"
                      disabled={!!busy}
                      onClick={() => void action(r.id, "accept")}
                    >
                      Accept terms
                    </button>
                  )}
                  {role === "employer" && r.status === "accepted" && (
                    <button
                      className="button"
                      disabled={!!busy}
                      onClick={() => void action(r.id, "fund")}
                    >
                      {config.demo ? "Simulate funding" : "Fund round"}
                    </button>
                  )}
                  {["funded", "completed"].includes(r.status) &&
                    !confirmed &&
                    hasEnded && (
                      <button
                        className="button"
                        disabled={!!busy}
                        onClick={() => void action(r.id, "complete")}
                      >
                        Confirm completion
                      </button>
                    )}
                  {r.status === "completed" &&
                    r.employerConfirmed &&
                    r.candidateConfirmed && (
                      <button
                        className="button"
                        disabled={!!busy}
                        onClick={() => void action(r.id, "release")}
                      >
                        {config.demo
                          ? "Simulate pay release"
                          : "Release candidate pay"}
                      </button>
                    )}
                  {["offered", "accepted"].includes(r.status) && (
                    <button
                      className="button secondary"
                      disabled={!!busy}
                      onClick={() => void action(r.id, "cancel")}
                    >
                      Cancel round
                    </button>
                  )}
                  {["funded", "completed"].includes(r.status) && (
                    <button
                      className="button secondary"
                      disabled={!!busy}
                      onClick={() => setDispute(dispute === r.id ? "" : r.id)}
                    >
                      Open dispute
                    </button>
                  )}
                </div>
                {dispute === r.id && (
                  <form
                    className="inline-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void action(r.id, "dispute", { reason });
                    }}
                  >
                    <div className="field">
                      <label htmlFor={`reason-${r.id}`}>
                        Explain the problem
                      </label>
                      <textarea
                        id={`reason-${r.id}`}
                        required
                        minLength={20}
                        maxLength={3000}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Explain which agreed term was not met. Do not include sensitive personal data."
                      />
                    </div>
                    <button className="button danger" disabled={!!busy}>
                      Submit dispute
                    </button>
                  </form>
                )}
              </div>
            )}
          </article>
        );
      })}
      {!rounds.length && (
        <div className="empty">
          <CalendarDays size={30} />
          <h2>No rounds in this view.</h2>
          <p>
            {role === "employer"
              ? "Offer a paid round to get started."
              : "Apply for a role or wait for an employer's round offer."}
          </p>
        </div>
      )}
    </>
  );
}
