"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ClipboardList,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { Logo } from "@/components/site";
import { ApiError } from "@/components/provider";
import { money, type Currency } from "@/lib/domain";

type CaseKind = "dispute" | "repair";
type ReviewStatus = "open" | "in_review" | "waiting_provider" | "closed";
type Decision =
  "pending" | "needs_information" | "provider_review" | "no_action";
type OperatorSession = {
  operator: { id: string; name: string; email: string };
  financialActionsEnabled: false;
};
type Overview = {
  counts: {
    openDisputes: number;
    disputedRounds: number;
    repairSignals: number;
    unreviewedCases: number;
    waitingProviderCases: number;
  };
  providerEvents: {
    stripeLastAt: string | null;
    razorpayLastAt: string | null;
  };
};
type ReviewCase = {
  id: string;
  kind: CaseKind;
  roundId: string | null;
  title: string | null;
  source: string;
  roundStatus: string | null;
  paymentProvider: string | null;
  amountCents: number | null;
  currency: Currency | null;
  createdAt: string;
  status: ReviewStatus;
  decision: Decision;
  ownerId: string | null;
  version: number;
  reason?: string | null;
};
type AuditNote = {
  id: string;
  actorId: string;
  actorName: string;
  note: string;
  status: ReviewStatus;
  decision: Decision;
  createdAt: string;
};
type CasePage = { items: ReviewCase[]; nextCursor: string | null };
type CaseDetail = {
  case: ReviewCase;
  notes: AuditNote[];
  nextCursor: string | null;
};
type LoadState<T> =
  | { phase: "loading" }
  | { phase: "ready"; data: T }
  | { phase: "error"; message: string };
type AccessState =
  | { phase: "checking" }
  | { phase: "ready"; session: OperatorSession }
  | { phase: "restricted" | "unavailable" | "error"; message: string };

const statusLabels: Record<ReviewStatus, string> = {
  open: "Open",
  in_review: "In review",
  waiting_provider: "Await provider",
  closed: "Review closed",
};
const decisionLabels: Record<Decision, string> = {
  pending: "Review pending",
  needs_information: "Needs information",
  provider_review: "Provider review",
  no_action: "No action from this review",
};
const sourceLabels: Record<string, string> = {
  participant_dispute: "Participant dispute",
  provider_state_review: "Provider state review",
  transfer_reversal_pending: "Stripe reversal pending",
  razorpay_reversal_review: "Razorpay reversal review",
  razorpay_payment_review: "Razorpay payment review",
  razorpay_transfer_failed: "Razorpay transfer failed",
  checkout_payment_failed: "Stripe checkout failed",
};

function timestamp(value: string | null) {
  if (!value) return "No event recorded";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

async function operatorRequest<T>(
  route: string,
  signal?: AbortSignal,
  body?: unknown,
): Promise<T> {
  const response = await fetch(`/api/operator/${route}`, {
    method: body === undefined ? "GET" : "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(20000)])
      : AbortSignal.timeout(20000),
  });
  const result = await response.json().catch(() => {
    throw new ApiError(
      "The console did not receive a valid response. Try again.",
      response.ok ? 502 : response.status,
    );
  });
  if (!response.ok)
    throw new ApiError(
      typeof result?.error === "string"
        ? result.error
        : "The console request failed. Try again.",
      response.status,
    );
  if (!result || typeof result !== "object" || Array.isArray(result))
    throw new ApiError(
      "The console did not receive a valid response. Try again.",
      502,
    );
  return result;
}

function errorMessage(error: unknown) {
  return error instanceof Error && error.name !== "TimeoutError"
    ? error.message
    : "The console did not answer in time. Try again.";
}

function accessFailure(error: unknown): AccessState | null {
  if (!(error instanceof ApiError)) return null;
  if (error.status === 401 || error.status === 403)
    return { phase: "restricted", message: error.message };
  if (error.status === 503)
    return { phase: "unavailable", message: error.message };
  return null;
}

function Loading({ children }: { children: React.ReactNode }) {
  return (
    <div className="skeleton" role="status">
      <LoaderCircle size={24} aria-hidden="true" />
      <p>{children}</p>
    </div>
  );
}

export function OperatorConsole() {
  const [access, setAccess] = useState<AccessState>({ phase: "checking" });
  const [attempt, setAttempt] = useState(0);
  const denyAccess = useCallback((error: unknown) => {
    const failure = accessFailure(error);
    if (!failure) return false;
    setAccess(failure);
    return true;
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    operatorRequest<OperatorSession>("session", controller.signal)
      .then((session) => setAccess({ phase: "ready", session }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setAccess(
          accessFailure(error) || {
            phase: "error",
            message: errorMessage(error),
          },
        );
      });
    return () => controller.abort();
  }, [attempt]);

  return (
    <div className="operator-shell">
      <header className="operator-header">
        <Logo />
        <nav aria-label="Operator navigation">
          <Link href="/workspace" className="button small secondary">
            <ArrowLeft size={16} aria-hidden="true" /> Your workspace
          </Link>
        </nav>
      </header>
      <main id="main" className="workspace-content operator-console">
        <div className="workspace-heading">
          <div>
            <h1>Operator console</h1>
            <p>Review disputes and provider repair signals.</p>
          </div>
          <span className="operator-mode">
            <ShieldCheck size={18} aria-hidden="true" /> Review access
          </span>
        </div>
        {access.phase === "checking" ? (
          <Loading>Check operator access.</Loading>
        ) : access.phase === "ready" ? (
          <OperatorDashboard session={access.session} denyAccess={denyAccess} />
        ) : (
          <section className="panel" aria-labelledby="operator-access-title">
            <div className="panel-body">
              <h2 id="operator-access-title">
                {access.phase === "restricted"
                  ? "Operator access is restricted."
                  : access.phase === "unavailable"
                    ? "The operator console is unavailable."
                    : "The operator console could not load."}
              </h2>
              <p role={access.phase === "error" ? "alert" : "status"}>
                {access.message}
              </p>
              <p>Use a verified account approved for operator access.</p>
              <div className="form-actions">
                <Link href="/account" className="button">
                  Sign in
                </Link>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => {
                    setAccess({ phase: "checking" });
                    setAttempt((value) => value + 1);
                  }}
                >
                  <RefreshCw size={16} aria-hidden="true" /> Check access again
                </button>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function OperatorDashboard({
  session,
  denyAccess,
}: {
  session: OperatorSession;
  denyAccess: (error: unknown) => boolean;
}) {
  const [overview, setOverview] = useState<LoadState<Overview>>({
    phase: "loading",
  });
  const [healthAttempt, setHealthAttempt] = useState(0);
  const [query, setQuery] = useState({
    kind: "all" as CaseKind | "all",
    status: "all" as ReviewStatus | "all",
    cursors: [null] as (string | null)[],
    attempt: 0,
  });
  const [queue, setQueue] = useState<LoadState<CasePage>>({ phase: "loading" });
  const [selected, setSelected] = useState<ReviewCase | null>(null);
  const [saving, setSaving] = useState(false);
  const pageNumber = query.cursors.length;
  const cursor = query.cursors[pageNumber - 1];

  useEffect(() => {
    const controller = new AbortController();
    operatorRequest<Overview>("health", controller.signal)
      .then((data) => setOverview({ phase: "ready", data }))
      .catch((error: unknown) => {
        if (!controller.signal.aborted && !denyAccess(error))
          setOverview({ phase: "error", message: errorMessage(error) });
      });
    return () => controller.abort();
  }, [healthAttempt, denyAccess]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      kind: query.kind,
      status: query.status,
      limit: "25",
    });
    if (cursor) params.set("cursor", cursor);
    operatorRequest<CasePage>(`cases?${params}`, controller.signal)
      .then((data) => setQueue({ phase: "ready", data }))
      .catch((error: unknown) => {
        if (!controller.signal.aborted && !denyAccess(error))
          setQueue({ phase: "error", message: errorMessage(error) });
      });
    return () => controller.abort();
  }, [query.kind, query.status, query.attempt, cursor, denyAccess]);

  function refresh() {
    setOverview({ phase: "loading" });
    setQueue({ phase: "loading" });
    setHealthAttempt((value) => value + 1);
    setQuery((value) => ({ ...value, attempt: value.attempt + 1 }));
  }

  function changeFilter(kind: typeof query.kind, status: typeof query.status) {
    setQueue({ phase: "loading" });
    setSelected(null);
    setQuery((value) => ({ ...value, kind, status, cursors: [null] }));
  }

  return (
    <>
      <div className="operator-session">
        <span>Signed in as {session.operator.name}</span>
        <button
          type="button"
          className="button small secondary"
          disabled={
            saving || queue.phase === "loading" || overview.phase === "loading"
          }
          onClick={refresh}
        >
          <RefreshCw size={16} aria-hidden="true" /> Refresh console
        </button>
      </div>
      <div className="notice alert-space">
        This console records review notes and status. Financial actions need the
        approved provider procedure. Review closure keeps dispute and payment
        blocks in place.
      </div>
      <section
        aria-label="Queue overview"
        aria-busy={overview.phase === "loading"}
      >
        {overview.phase === "loading" ? (
          <Loading>Load the queue overview.</Loading>
        ) : overview.phase === "error" ? (
          <div className="notice error alert-space" role="alert">
            {overview.message}
          </div>
        ) : (
          <>
            <div className="stats operator-summary">
              {(
                [
                  ["Open disputes", overview.data.counts.openDisputes],
                  ["Disputed rounds", overview.data.counts.disputedRounds],
                  ["Repair signals", overview.data.counts.repairSignals],
                  ["Unreviewed cases", overview.data.counts.unreviewedCases],
                  ["Await provider", overview.data.counts.waitingProviderCases],
                ] as const
              ).map(([label, count]) => (
                <div className="stat" key={label}>
                  <span>{label}</span>
                  <strong>{count}</strong>
                </div>
              ))}
            </div>
            <div className="operator-event-times small-text muted">
              <span>
                Last Stripe event:{" "}
                {timestamp(overview.data.providerEvents.stripeLastAt)}
              </span>
              <span>
                Last Razorpay event:{" "}
                {timestamp(overview.data.providerEvents.razorpayLastAt)}
              </span>
            </div>
          </>
        )}
      </section>
      <div className="operator-layout">
        <section className="panel" aria-labelledby="operator-queue-title">
          <div className="panel-heading">
            <h2 id="operator-queue-title">Review queue</h2>
          </div>
          <div className="panel-body operator-filters">
            <div className="field">
              <label htmlFor="operator-kind">Case type</label>
              <select
                id="operator-kind"
                value={query.kind}
                disabled={saving}
                onChange={(event) =>
                  changeFilter(
                    event.target.value as typeof query.kind,
                    query.status,
                  )
                }
              >
                <option value="all">All cases</option>
                <option value="dispute">Disputes</option>
                <option value="repair">Provider repairs</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="operator-filter-status">Review status</label>
              <select
                id="operator-filter-status"
                value={query.status}
                disabled={saving}
                onChange={(event) =>
                  changeFilter(
                    query.kind,
                    event.target.value as typeof query.status,
                  )
                }
              >
                <option value="all">All review statuses</option>
                {Object.entries(statusLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div aria-busy={queue.phase === "loading"}>
            {queue.phase === "loading" ? (
              <Loading>Load review cases.</Loading>
            ) : queue.phase === "error" ? (
              <div className="panel-body">
                <div className="notice error" role="alert">
                  {queue.message}
                </div>
              </div>
            ) : queue.data.items.length === 0 ? (
              <div className="empty">
                <ClipboardList size={28} aria-hidden="true" />
                <h3>No cases match these filters.</h3>
                <p>Refresh the console to check for new review signals.</p>
              </div>
            ) : (
              <ul className="operator-case-list">
                {queue.data.items.map((item) => (
                  <li key={`${item.kind}:${item.id}`}>
                    <button
                      type="button"
                      className="operator-case-button"
                      aria-pressed={
                        selected?.id === item.id && selected.kind === item.kind
                      }
                      aria-controls="operator-case-review"
                      disabled={saving}
                      onClick={() => setSelected(item)}
                    >
                      <span className="operator-case-content">
                        <strong>
                          {item.title || "Round record unavailable"}
                        </strong>
                        <span>
                          {sourceLabels[item.source] ||
                            item.source.replaceAll("_", " ")}
                        </span>
                        <span className="operator-case-meta">
                          {item.amountCents !== null && item.currency && (
                            <span>
                              {money(item.amountCents, item.currency)}{" "}
                              {item.currency}
                            </span>
                          )}
                          <time dateTime={item.createdAt}>
                            {timestamp(item.createdAt)}
                          </time>
                        </span>
                      </span>
                      <span className={`status operator-status-${item.status}`}>
                        {statusLabels[item.status]}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="operator-pagination">
            <button
              type="button"
              className="button small secondary"
              disabled={saving || queue.phase !== "ready" || pageNumber === 1}
              onClick={() => {
                setQueue({ phase: "loading" });
                setSelected(null);
                setQuery((value) => ({
                  ...value,
                  cursors: value.cursors.slice(0, -1),
                }));
              }}
            >
              <ArrowLeft size={16} aria-hidden="true" /> Previous cases
            </button>
            <span className="small-text" aria-live="polite">
              Page {pageNumber}
            </span>
            <button
              type="button"
              className="button small secondary"
              disabled={
                saving || queue.phase !== "ready" || !queue.data.nextCursor
              }
              onClick={() => {
                if (queue.phase !== "ready" || !queue.data.nextCursor) return;
                const nextCursor = queue.data.nextCursor;
                setQueue({ phase: "loading" });
                setSelected(null);
                setQuery((value) => ({
                  ...value,
                  cursors: [...value.cursors, nextCursor],
                }));
              }}
            >
              Next cases <ArrowRight size={16} aria-hidden="true" />
            </button>
          </div>
        </section>
        {selected ? (
          <CaseReview
            key={`${selected.kind}:${selected.id}`}
            item={selected}
            denyAccess={denyAccess}
            onBusy={setSaving}
            onSaved={refresh}
          />
        ) : (
          <section
            id="operator-case-review"
            className="panel"
            aria-label="Case review"
          >
            <div className="empty">
              <h2>Select a case to review.</h2>
              <p>
                Read the case record and audit notes before you record a review.
              </p>
            </div>
          </section>
        )}
      </div>
    </>
  );
}

function CaseReview({
  item,
  denyAccess,
  onBusy,
  onSaved,
}: {
  item: ReviewCase;
  denyAccess: (error: unknown) => boolean;
  onBusy: (value: boolean) => void;
  onSaved: () => void;
}) {
  const [detail, setDetail] = useState<LoadState<CaseDetail>>({
    phase: "loading",
  });
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState(item.status);
  const [decision, setDecision] = useState(item.decision);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [notesBusy, setNotesBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [conflict, setConflict] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const actionController = useRef<AbortController | null>(null);
  const route = `cases/${item.kind}/${encodeURIComponent(item.id)}`;

  useEffect(() => {
    const controller = new AbortController();
    operatorRequest<CaseDetail>(`${route}?limit=25`, controller.signal)
      .then((data) => {
        setDetail({ phase: "ready", data });
        setStatus(data.case.status);
        setDecision(data.case.decision);
        setConflict(false);
        setError("");
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted && !denyAccess(failure))
          setDetail({ phase: "error", message: errorMessage(failure) });
      });
    return () => controller.abort();
  }, [route, attempt, denyAccess]);

  useEffect(() => {
    heading.current?.focus();
    return () => actionController.current?.abort();
  }, []);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || notesBusy || conflict || detail.phase !== "ready") return;
    const body = note.trim();
    if (body.length < 10) {
      setError("Write a review note with at least 10 characters.");
      return;
    }
    setBusy(true);
    onBusy(true);
    setError("");
    setMessage("");
    const controller = new AbortController();
    actionController.current = controller;
    try {
      const result = await operatorRequest<{
        message: string;
        case: ReviewCase;
      }>(route, controller.signal, {
        note: body,
        status,
        decision,
        expectedVersion: detail.data.case.version,
      });
      if (controller.signal.aborted) return;
      setNote("");
      setMessage(result.message);
      setDetail({ phase: "loading" });
      setAttempt((value) => value + 1);
      onSaved();
    } catch (failure: unknown) {
      if (!controller.signal.aborted && !denyAccess(failure)) {
        const changed = failure instanceof ApiError && failure.status === 409;
        setConflict(changed);
        setError(
          changed
            ? "Another operator changed this case. Reload the case before you save. Your note remains in the form."
            : errorMessage(failure),
        );
      }
    } finally {
      if (!controller.signal.aborted) {
        setBusy(false);
        onBusy(false);
      }
    }
  }

  async function moreNotes() {
    if (detail.phase !== "ready" || !detail.data.nextCursor || notesBusy)
      return;
    setNotesBusy(true);
    setError("");
    const controller = new AbortController();
    actionController.current = controller;
    try {
      const params = new URLSearchParams({
        limit: "25",
        cursor: detail.data.nextCursor,
      });
      const next = await operatorRequest<CaseDetail>(
        `${route}?${params}`,
        controller.signal,
      );
      if (!controller.signal.aborted)
        setDetail((value) =>
          value.phase === "ready"
            ? {
                phase: "ready",
                data: {
                  ...value.data,
                  notes: [...value.data.notes, ...next.notes],
                  nextCursor: next.nextCursor,
                },
              }
            : value,
        );
    } catch (failure: unknown) {
      if (!controller.signal.aborted && !denyAccess(failure))
        setError(errorMessage(failure));
    } finally {
      if (!controller.signal.aborted) setNotesBusy(false);
    }
  }

  const decisions: Decision[] =
    status === "closed"
      ? ["no_action"]
      : status === "waiting_provider"
        ? ["provider_review"]
        : ["pending", "needs_information"];

  return (
    <section
      id="operator-case-review"
      className="panel operator-case-review"
      aria-labelledby="operator-case-title"
      aria-busy={detail.phase === "loading" || busy}
    >
      <div className="panel-heading">
        <h2 id="operator-case-title" ref={heading} tabIndex={-1}>
          Case review
        </h2>
        <button
          type="button"
          className="button small secondary"
          disabled={busy || notesBusy || detail.phase === "loading"}
          onClick={() => {
            setDetail({ phase: "loading" });
            setAttempt((value) => value + 1);
          }}
        >
          <RefreshCw size={16} aria-hidden="true" /> Reload case
        </button>
      </div>
      <div className="panel-body">
        {message && (
          <div className="notice success alert-space" role="status">
            {message}
          </div>
        )}
        {error && (
          <div className="notice error alert-space" role="alert">
            {error}
          </div>
        )}
        {detail.phase === "loading" ? (
          <Loading>Load the case record.</Loading>
        ) : detail.phase === "error" ? (
          <div className="notice error" role="alert">
            {detail.message}
          </div>
        ) : (
          <>
            <h3>{detail.data.case.title || "Round record unavailable"}</h3>
            <dl className="operator-case-details">
              <div>
                <dt>Case type</dt>
                <dd>
                  {item.kind === "dispute"
                    ? "Participant dispute"
                    : "Provider repair"}
                </dd>
              </div>
              <div>
                <dt>Source</dt>
                <dd>
                  {sourceLabels[detail.data.case.source] ||
                    detail.data.case.source.replaceAll("_", " ")}
                </dd>
              </div>
              <div>
                <dt>Review status</dt>
                <dd>{statusLabels[detail.data.case.status]}</dd>
              </div>
              <div>
                <dt>Round status</dt>
                <dd>
                  {detail.data.case.roundStatus?.replaceAll("_", " ") ||
                    "Unavailable"}
                </dd>
              </div>
              <div>
                <dt>Provider</dt>
                <dd>{detail.data.case.paymentProvider || "Unavailable"}</dd>
              </div>
              {detail.data.case.amountCents !== null &&
                detail.data.case.currency && (
                  <div>
                    <dt>Candidate pay</dt>
                    <dd>
                      {money(
                        detail.data.case.amountCents,
                        detail.data.case.currency,
                      )}{" "}
                      {detail.data.case.currency}
                    </dd>
                  </div>
                )}
              <div>
                <dt>Case ID</dt>
                <dd>{item.id}</dd>
              </div>
              {detail.data.case.roundId && (
                <div>
                  <dt>Round ID</dt>
                  <dd>{detail.data.case.roundId}</dd>
                </div>
              )}
              <div>
                <dt>Created</dt>
                <dd>{timestamp(detail.data.case.createdAt)}</dd>
              </div>
            </dl>
            {detail.data.case.reason && (
              <div className="operator-case-reason">
                <h3>Reported reason</h3>
                <p>{detail.data.case.reason}</p>
              </div>
            )}
            <form
              onSubmit={(event) => void save(event)}
              aria-label="Record case review"
            >
              <div className="field-row">
                <div className="field">
                  <label htmlFor="operator-review-status">
                    New review status
                  </label>
                  <select
                    id="operator-review-status"
                    value={status}
                    disabled={busy || notesBusy}
                    onChange={(event) => {
                      const next = event.target.value as ReviewStatus;
                      setStatus(next);
                      setDecision(
                        next === "closed"
                          ? "no_action"
                          : next === "waiting_provider"
                            ? "provider_review"
                            : "pending",
                      );
                    }}
                  >
                    {Object.entries(statusLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="operator-review-decision">
                    Review outcome
                  </label>
                  <select
                    id="operator-review-decision"
                    value={decision}
                    disabled={busy || notesBusy}
                    onChange={(event) =>
                      setDecision(event.target.value as Decision)
                    }
                  >
                    {decisions.map((value) => (
                      <option key={value} value={value}>
                        {decisionLabels[value]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="field">
                <label htmlFor="operator-review-note">Review note</label>
                <textarea
                  id="operator-review-note"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  required
                  minLength={10}
                  maxLength={3000}
                  rows={5}
                  disabled={busy || notesBusy}
                  aria-describedby="operator-note-hint"
                />
                <small id="operator-note-hint">
                  Record evidence references and next steps. Keep bank data,
                  identity documents, and passwords out of this note.
                </small>
              </div>
              {status === "closed" && (
                <div className="notice warning alert-space">
                  This closes the review record. The underlying dispute,
                  provider hold, and payment blocks remain unchanged.
                </div>
              )}
              <button
                type="submit"
                className="button"
                disabled={
                  busy || notesBusy || conflict || note.trim().length < 10
                }
              >
                {busy ? (
                  <>
                    <LoaderCircle size={16} aria-hidden="true" /> Save review...
                  </>
                ) : (
                  "Save review"
                )}
              </button>
            </form>
            <div className="operator-audit">
              <h3>Audit notes</h3>
              {detail.data.notes.length === 0 ? (
                <p>No operator notes have been recorded.</p>
              ) : (
                <ol className="operator-audit-list">
                  {detail.data.notes.map((entry) => (
                    <li key={entry.id}>
                      <div className="operator-audit-meta">
                        <strong>{entry.actorName || "Operator"}</strong>
                        <time dateTime={entry.createdAt}>
                          {timestamp(entry.createdAt)}
                        </time>
                      </div>
                      <p>{entry.note}</p>
                      <span className="small-text muted">
                        {statusLabels[entry.status]} ·{" "}
                        {decisionLabels[entry.decision]}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
              {detail.data.nextCursor && (
                <button
                  type="button"
                  className="button small secondary"
                  disabled={busy || notesBusy}
                  onClick={() => void moreNotes()}
                >
                  {notesBusy ? "Load notes..." : "Load older notes"}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
