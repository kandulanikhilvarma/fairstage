"use client";
import { useEffect, useRef, useState } from "react";
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
import {
  dateLabel,
  defaults,
  money,
  type Application,
  type Currency,
  type Role,
  type RecordPage,
  type RoundStatus,
  type WorkspaceCollection,
} from "@/lib/domain";
import { preparationGuide } from "@/lib/preparation";

const applicationStatuses = [
  ["reviewing", "Reviewing"],
  ["interviewing", "Interviewing"],
  ["offered", "Offer sent"],
  ["hired", "Hired"],
  ["rejected", "Not selected"],
] as const;

function profileLink(value?: string) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      ? value
      : undefined;
  } catch {
    return undefined;
  }
}

function CollectionPager({
  collection,
  label,
}: {
  collection: WorkspaceCollection;
  label: string;
}) {
  const { workspace, loadMore, pageBusy, pageErrors } = useApp();
  const page = workspace?.pages?.[collection];
  if (!workspace || !page) return null;
  return (
    <div className="panel-body">
      <p role="status">
        {workspace[collection].length} of {page.total} {label} loaded
      </p>
      {pageErrors[collection] && (
        <p className="notice error" role="alert">
          {pageErrors[collection]}
        </p>
      )}
      {page.nextCursor && (
        <button
          className="button secondary"
          disabled={pageBusy[collection]}
          aria-busy={pageBusy[collection]}
          onClick={() => void loadMore(collection)}
        >
          {pageBusy[collection] ? "Load records…" : `Load more ${label}`}
        </button>
      )}
    </div>
  );
}

function ApplicationsList({
  applications,
  role,
  busy,
  update,
}: {
  applications: Application[];
  role: Role;
  busy: string;
  update: (id: string, status: string) => Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [searchResults, setSearchResults] =
    useState<RecordPage<Application> | null>(null);
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [resultKey, setResultKey] = useState("");
  const [searchRetry, setSearchRetry] = useState(0);
  const searchGeneration = useRef(0);
  const searchPending = useRef(false);
  const searched = !!search.trim() || status !== "all";
  const params = new URLSearchParams({ pageSize: "50" });
  if (search.trim()) params.set("q", search.trim());
  if (status !== "all") params.set("status", status);
  const queryKey = params.toString();
  useEffect(() => {
    const version = ++searchGeneration.current;
    if (!searched) return;
    let active = true;
    const timer = window.setTimeout(async () => {
      setSearchBusy(true);
      setSearchError("");
      try {
        const result = await api<RecordPage<Application>>(
          `workspace/applications?${queryKey}`,
        );
        if (active && version === searchGeneration.current) {
          setSearchResults(result);
          setResultKey(queryKey);
        }
      } catch (error) {
        if (active && version === searchGeneration.current)
          setSearchError(
            error instanceof Error
              ? error.message
              : "The applications could not load. Try again.",
          );
      } finally {
        if (active && version === searchGeneration.current)
          setSearchBusy(false);
      }
    }, 250);
    return () => {
      window.clearTimeout(timer);
      active = false;
    };
  }, [searched, queryKey, applications, searchRetry]);
  async function loadSearch() {
    if (
      !searchResults?.page.nextCursor ||
      searchPending.current ||
      queryKey !== resultKey
    )
      return;
    const version = searchGeneration.current;
    searchPending.current = true;
    setSearchBusy(true);
    setSearchError("");
    try {
      const result = await api<RecordPage<Application>>(
        `workspace/applications?${queryKey}&cursor=${encodeURIComponent(searchResults.page.nextCursor)}`,
      );
      if (version === searchGeneration.current)
        setSearchResults((current) =>
          current
            ? {
                items: [
                  ...current.items,
                  ...result.items.filter(
                    (item) =>
                      !current.items.some(
                        (previous) => previous.id === item.id,
                      ),
                  ),
                ],
                page: result.page,
              }
            : result,
        );
    } catch (error) {
      if (version === searchGeneration.current)
        setSearchError(
          error instanceof Error
            ? error.message
            : "The next page could not load. Try again.",
        );
    } finally {
      searchPending.current = false;
      if (version === searchGeneration.current) setSearchBusy(false);
    }
  }
  const filtered = applications.filter((a) => {
    const words = [
      a.candidateName,
      a.email,
      a.jobTitle,
      a.headline,
      a.note,
      ...(a.skills ?? []),
    ]
      .join(" ")
      .toLowerCase();
    return (
      (status === "all" || a.status === status) &&
      words.includes(search.trim().toLowerCase())
    );
  });
  const results = searched
    ? resultKey === queryKey
      ? (searchResults?.items ?? [])
      : []
    : filtered;
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>
          {role === "employer" ? "Candidate applications" : "Your applications"}
        </h2>
        {role === "employer" && (
          <Link href="/workspace/interviews" className="text-link">
            Offer a round <ArrowRight size={15} />
          </Link>
        )}
      </div>
      <div className="panel-body">
        <div className="field-row">
          <div className="field">
            <label htmlFor="application-search">Search applications</label>
            <input
              id="application-search"
              type="search"
              value={search}
              maxLength={200}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={
                role === "employer"
                  ? "Name, role, or skill"
                  : "Role or application note"
              }
            />
          </div>
          <div className="field">
            <label htmlFor="application-filter">Application state</label>
            <select
              id="application-filter"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="all">All states</option>
              <option value="applied">Applied</option>
              {applicationStatuses.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
              <option value="withdrawn">Withdrawn</option>
            </select>
          </div>
        </div>
        {searched && (
          <p role="status">
            {searchBusy || (resultKey !== queryKey && !searchError)
              ? "Search applications…"
              : resultKey === queryKey
                ? `${results.length} of ${searchResults?.page.total ?? 0} matching applications loaded`
                : "The search could not complete."}
          </p>
        )}
        {searchError && searched && (
          <p role="alert" className="notice error">
            {searchError}
            <button
              type="button"
              className="button secondary small"
              disabled={searchBusy}
              onClick={() => setSearchRetry((value) => value + 1)}
            >
              Retry search
            </button>
          </p>
        )}
        {!results.length &&
          (!searched || !searchBusy) &&
          (!searched || resultKey === queryKey) && (
            <p>
              {applications.length
                ? "No applications match these filters."
                : "No applications yet. A submitted application will appear here."}
            </p>
          )}
        {results.map((a) => (
          <article
            className="round-item"
            key={a.id}
            aria-labelledby={`application-${a.id}`}
          >
            <div className="panel-body" style={{ overflowWrap: "anywhere" }}>
              <div
                className="activity-row"
                style={{ alignItems: "flex-start", flexWrap: "wrap" }}
              >
                <div style={{ minWidth: 0, flex: "1 1 180px" }}>
                  <h3 id={`application-${a.id}`}>
                    {role === "employer"
                      ? a.candidateName
                      : (a.jobTitle ?? "Your application")}
                  </h3>
                  {role === "employer" && (
                    <p>
                      {a.jobTitle ?? "Role application"}
                      {a.headline && <> · {a.headline}</>}
                    </p>
                  )}
                  <small>Applied {dateLabel(a.createdAt)}</small>
                </div>
                <span className={`status ${a.status}`}>{a.status}</span>
              </div>
              {role === "employer" && (
                <>
                  <p>
                    <a
                      href={`mailto:${a.email}`}
                      className="text-link"
                      style={{ display: "inline" }}
                    >
                      {a.email}
                    </a>
                  </p>
                  {!!a.skills?.length && (
                    <p>
                      <strong>Skills:</strong> {a.skills.join(", ")}
                    </p>
                  )}
                  <div className="form-actions">
                    {profileLink(a.portfolioUrl) && (
                      <a
                        href={a.portfolioUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="button secondary small"
                      >
                        View portfolio <ArrowRight size={14} />
                      </a>
                    )}
                    {profileLink(a.resumeUrl) && (
                      <a
                        href={a.resumeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="button secondary small"
                      >
                        View resume <ArrowRight size={14} />
                      </a>
                    )}
                  </div>
                </>
              )}
              <details>
                <summary>Application note</summary>
                <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                  {a.note}
                </p>
              </details>
              {role === "employer" && a.status !== "withdrawn" && (
                <form
                  key={`${a.id}-${a.status}`}
                  onSubmit={(e) => {
                    e.preventDefault();
                    const input = new FormData(e.currentTarget);
                    void update(a.id, String(input.get("status")));
                  }}
                >
                  <div className="field">
                    <label htmlFor={`application-status-${a.id}`}>
                      Application status for {a.candidateName}
                    </label>
                    <select
                      id={`application-status-${a.id}`}
                      name="status"
                      defaultValue={
                        a.status === "applied" ? "reviewing" : a.status
                      }
                      disabled={!!busy}
                    >
                      {applicationStatuses.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button className="button secondary small" disabled={!!busy}>
                    {busy === a.id
                      ? "Update application…"
                      : "Update application"}
                  </button>
                </form>
              )}
              {role === "candidate" &&
                !["hired", "withdrawn"].includes(a.status) && (
                  <div className="form-actions">
                    <button
                      className="button secondary small"
                      disabled={!!busy}
                      onClick={() => void update(a.id, "withdrawn")}
                    >
                      {busy === a.id
                        ? "Withdraw application…"
                        : "Withdraw application"}
                    </button>
                  </div>
                )}
            </div>
          </article>
        ))}
        {searched &&
          resultKey === queryKey &&
          searchResults?.page.nextCursor && (
            <button
              className="button secondary"
              disabled={searchBusy}
              aria-busy={searchBusy}
              onClick={() => void loadSearch()}
            >
              {searchBusy
                ? "Load applications…"
                : "Load more matching applications"}
            </button>
          )}
      </div>
      {!searched && (
        <CollectionPager collection="applications" label="applications" />
      )}
    </section>
  );
}

export function WorkspaceJobs() {
  const { workspace: w, role, mutate, config } = useApp();
  const [form, setForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [applicationBusy, setApplicationBusy] = useState("");
  const [closing, setClosing] = useState("");
  const [jobCurrency, setJobCurrency] = useState<Currency>();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const currency = jobCurrency ?? config.currency;
  if (!w) return null;
  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
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
    setClosing(id);
    setError("");
    setMessage("");
    try {
      await mutate(`jobs/${id}/close`);
      setMessage("Job closed.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "The job could not close.");
    } finally {
      setClosing("");
    }
  }
  async function updateApplication(id: string, status: string) {
    setApplicationBusy(id);
    setError("");
    setMessage("");
    try {
      await mutate(`applications/${id}/status`, { status });
      setMessage(
        status === "withdrawn"
          ? "Application withdrawn."
          : "Application updated.",
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The application could not update.",
      );
    } finally {
      setApplicationBusy("");
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
                <label htmlFor="job-currency">Salary currency</label>
                <select
                  id="job-currency"
                  name="currency"
                  value={currency}
                  onChange={(e) => setJobCurrency(e.target.value as Currency)}
                >
                  <option value="INR">INR · Indian rupee</option>
                  <option value="USD">USD · US dollar</option>
                </select>
              </div>
            </div>
            <div className="field-row">
              <div className="field">
                <label htmlFor="job-min">
                  Minimum annual salary · {currency}
                </label>
                <input
                  id="job-min"
                  name="salaryMin"
                  type="number"
                  min={0}
                  max={100000000}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="job-max">
                  Maximum annual salary · {currency}
                </label>
                <input
                  id="job-max"
                  name="salaryMax"
                  type="number"
                  min={0}
                  max={100000000}
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
          <ApplicationsList
            applications={w.applications}
            role={role}
            busy={applicationBusy}
            update={updateApplication}
          />
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
                      <small>
                        {money(j.salaryMin * 100, j.currency ?? "USD")}–
                        {money(j.salaryMax * 100, j.currency ?? "USD")} per year
                        · {j.currency ?? "USD"}
                      </small>
                    </div>
                    {j.status === "open" && (
                      <button
                        className="button secondary small"
                        onClick={() => void close(j.id)}
                        disabled={!!closing}
                      >
                        {closing === j.id ? "Close role…" : "Close role"}
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
          <CollectionPager collection="jobs" label="roles" />
          <ApplicationsList
            applications={w.applications}
            role={role}
            busy={applicationBusy}
            update={updateApplication}
          />
        </>
      )}
    </>
  );
}
export function WalletPage() {
  const { workspace: w, role, config } = useApp();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  if (!w) return null;
  const currencies =
    w.summary?.currencies.map((total) => total.currency) ??
    Array.from(new Set<Currency>(w.rounds.map((r) => r.currency ?? "USD")));
  if (!currencies.length) currencies.push(config.currency);
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
  async function download() {
    setExporting(true);
    setMessage("");
    try {
      const response = await fetch("/api/ledger/export", {
        credentials: "same-origin",
        cache: "no-store",
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) {
        const failure = await response.json().catch(() => ({}));
        throw new Error(failure.error || "The payment export could not load.");
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = "fairstage-payment-records.csv";
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "The payment export failed.",
      );
    } finally {
      setExporting(false);
    }
  }
  return (
    <>
      <Heading
        title={role === "employer" ? "Payment records" : "Your interview pay"}
        description="Follow the amount from funded round to connected account."
      >
        <button
          className="button secondary"
          onClick={() => void download()}
          disabled={exporting || !w.ledger.length}
          aria-busy={exporting}
        >
          <Download size={16} />
          {exporting ? "Export records…" : "Export CSV"}
        </button>
      </Heading>
      {message && (
        <div role="alert" className="notice error alert-space">
          {message}
        </div>
      )}
      {currencies.map((currency) => (
        <div className="stats" key={currency}>
          <Stat
            label={`Candidate pay released · ${currency}`}
            value={money(
              w.summary?.currencies.find((total) => total.currency === currency)
                ?.paidCents ??
                w.rounds
                  .filter(
                    (r) =>
                      r.status === "paid" && (r.currency ?? "USD") === currency,
                  )
                  .reduce((n, r) => n + r.amountCents, 0),
              currency,
            )}
            note="Gross transfers before reversals"
          />
          <Stat
            label={`Candidate pay funded · ${currency}`}
            value={money(
              w.summary?.currencies.find((total) => total.currency === currency)
                ?.fundedCents ??
                w.rounds
                  .filter(
                    (r) =>
                      ["funded", "completed"].includes(r.status) &&
                      (r.currency ?? "USD") === currency,
                  )
                  .reduce((n, r) => n + r.amountCents, 0),
              currency,
            )}
            note="Completion or review pending"
          />
          <Stat
            label={`Candidate platform fee · ${currency}`}
            value={money(0, currency)}
            note="The employer pays the fee"
          />
        </div>
      ))}
      <div className="notice alert-space">
        <Info size={18} />
        <span>
          Released records show transfers to a provider account. The payment
          provider controls bank settlement. Each currency has its own total.
          These records are not tax invoices.
        </span>
      </div>
      {role === "candidate" && (
        <section className="panel">
          <div className="panel-heading">
            <h2>Payment account</h2>
            <ShieldCheck size={19} />
          </div>
          <div className="panel-body">
            {!w.user.verified && (
              <div className="notice alert-space">
                Verify your email in account settings before payment setup.
              </div>
            )}
            {w.user.country === "IN" && (
              <>
                <h3>INR transfers</h3>
                <p>
                  <strong>
                    {w.user.razorpayReady
                      ? "Provider account verified"
                      : "Provider account setup pending"}
                  </strong>
                </p>
                <p>
                  Your payout account is verified through Razorpay Route with
                  support from the service operator. Bank and identity details
                  go through the provider&apos;s onboarding process. Transfers
                  become available after account approval.
                </p>
                {!config.razorpay && (
                  <p>
                    INR checkout is currently unavailable. Your payment records
                    remain accessible.
                  </p>
                )}
                <Link href="/policy" className="text-link">
                  Payment setup and support <ArrowRight size={15} />
                </Link>
              </>
            )}
            {config.payments && (
              <>
                <h3>Stripe payment account</h3>
                <p>
                  {w.user.connectReady
                    ? "Your connected account is ready for transfers."
                    : w.user.connectId
                      ? "Finish your provider verification to receive transfers."
                      : "Set up a connected account on Stripe. Availability depends on your country and the operator&apos;s supported regions."}
                </p>
                <button
                  className="button"
                  onClick={() => void connect()}
                  disabled={busy || !w.user.verified}
                >
                  {busy
                    ? "Open payment setup…"
                    : "Set up or update payment account"}
                  <ArrowRight size={16} />
                </button>
              </>
            )}
            {!config.payments && w.user.country !== "IN" && (
              <p>
                Payment account setup is not available for your country yet. You
                can still manage your profile and applications.
              </p>
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
                    <td>
                      {money(
                        l.amountCents,
                        l.currency ??
                          w.rounds.find((r) => r.id === l.roundId)?.currency ??
                          "USD",
                      )}{" "}
                      <small>
                        {l.currency ??
                          w.rounds.find((r) => r.id === l.roundId)?.currency ??
                          "USD"}
                      </small>
                    </td>
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
      <CollectionPager collection="ledger" label="payment events" />
      <p className="small-text muted">
        Funding events include the employer fee. Release events show candidate
        pay. The app does not deduct a salary.
      </p>
    </>
  );
}
export function Profile() {
  const { workspace: w, mutate, config } = useApp();
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  if (!w) return null;
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setAction("save");
    setError("");
    setMessage("");
    const input = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const skills = String(input.skills ?? "")
        .split(",")
        .map((skill) => skill.trim())
        .filter(Boolean);
      if (skills.length > 20 || skills.some((skill) => skill.length > 50))
        throw new Error("Use up to 20 skills with at most 50 characters each.");
      await mutate("profile", { ...input, skills });
      setMessage("Profile saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "The profile could not save.");
    } finally {
      setBusy(false);
      setAction("");
    }
  }
  async function verify() {
    setBusy(true);
    setAction("verify");
    setError("");
    setMessage("");
    try {
      const r = await api<{ message: string }>("auth/verify-request", {});
      setMessage(r.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The email request failed.");
    } finally {
      setBusy(false);
      setAction("");
    }
  }
  async function exportAccount() {
    setBusy(true);
    setAction("export");
    setError("");
    setMessage("");
    try {
      const data = await api<Record<string, unknown>>("account/export");
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], {
          type: "application/json;charset=utf-8",
        }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = "fairstage-account-data.json";
      link.click();
      URL.revokeObjectURL(url);
      setMessage("Account data downloaded. Keep this file private.");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The account data could not download.",
      );
    } finally {
      setBusy(false);
      setAction("");
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
            <label htmlFor="profile-headline">Professional headline</label>
            <input
              id="profile-headline"
              name="headline"
              defaultValue={w.user.headline ?? ""}
              maxLength={120}
              placeholder="Your role, interests, or area of work"
            />
          </div>
          <div className="field">
            <label htmlFor="profile-skills">Skills (comma separated)</label>
            <input
              id="profile-skills"
              name="skills"
              defaultValue={w.user.skills?.join(", ") ?? ""}
              maxLength={1038}
              aria-describedby="profile-skills-help"
              placeholder="Research, TypeScript, project planning"
            />
            <small id="profile-skills-help">
              Up to 20 skills. Use at most 50 characters for each skill.
            </small>
          </div>
          <div className="field-row">
            <div className="field">
              <label htmlFor="profile-portfolio">Portfolio URL</label>
              <input
                id="profile-portfolio"
                name="portfolioUrl"
                type="url"
                pattern="https://.*"
                defaultValue={w.user.portfolioUrl ?? ""}
                maxLength={500}
                placeholder="https://"
              />
              <small>
                Optional. Share work that you have permission to show.
              </small>
            </div>
            <div className="field">
              <label htmlFor="profile-resume">Resume URL</label>
              <input
                id="profile-resume"
                name="resumeUrl"
                type="url"
                pattern="https://.*"
                defaultValue={w.user.resumeUrl ?? ""}
                maxLength={500}
                placeholder="https://"
              />
              <small>Optional. Check that employers can open this link.</small>
            </div>
          </div>
          <div className="field">
            <label htmlFor="profile-timezone">Time zone</label>
            <input
              id="profile-timezone"
              name="timezone"
              defaultValue={w.user.timezone ?? "Asia/Kolkata"}
              list="profile-timezones"
              required
              maxLength={80}
              aria-describedby="profile-timezone-help"
            />
            <datalist id="profile-timezones">
              {[
                "Asia/Kolkata",
                "America/New_York",
                "America/Los_Angeles",
                "Europe/London",
                "Europe/Berlin",
                "Asia/Singapore",
                "Asia/Tokyo",
                "Australia/Sydney",
                "UTC",
              ].map((value) => (
                <option key={value} value={value} />
              ))}
            </datalist>
            <small id="profile-timezone-help">
              Use an IANA time zone, such as Asia/Kolkata or Europe/London.
            </small>
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
            {busy && action === "save" ? "Save profile…" : "Save profile"}
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
        {!w.user.verified && (
          <button
            className="button secondary"
            disabled={busy || !config.email}
            onClick={() => void verify()}
          >
            {busy && action === "verify"
              ? "Send verification link…"
              : "Send verification link"}
          </button>
        )}
        {!w.user.verified && !config.email && (
          <p className="small-text muted">
            Email verification is currently unavailable. Please try again later.
          </p>
        )}
      </section>
      <section className="form-panel">
        <h2>Your account data</h2>
        <p className="muted small-text">
          Download your profile, applications, and interview records as JSON.
          The file contains personal information; store it securely.
        </p>
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => void exportAccount()}
        >
          <Download size={16} />
          {busy && action === "export"
            ? "Download account data…"
            : "Download account data"}
        </button>
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
    setOutput("");
    setSource("");
    try {
      if (!config.ai) {
        setOutput(preparationGuide(topic, kind));
        setSource("Local preparation guide");
      } else {
        if (!consent)
          throw new Error(
            "Confirm your consent before you send the topic to the AI service.",
          );
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
          {config.ai
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
          {config.ai && (
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
  const { workspace: w, config } = useApp();
  if (!w) return null;
  const states: RoundStatus[] = [
    "offered",
    "accepted",
    "funded",
    "completed",
    "paid",
    "disputed",
    "cancelled",
  ];
  const released = w.rounds.filter((r) => r.status === "paid");
  const currencies =
    w.summary?.currencies.map((total) => total.currency) ??
    Array.from(new Set<Currency>(released.map((r) => r.currency ?? "USD")));
  if (!currencies.length) currencies.push(config.currency);
  const disputes = w.disputes.filter((d) => d.status === "open");
  return (
    <>
      <Heading
        title="A view of your process"
        description="Track interview progress and review open issues."
      />
      <div className="stats">
        <Stat
          label="Recorded rounds"
          value={String(w.summary?.counts.rounds ?? w.rounds.length)}
          note="Across all states"
        />
        <Stat
          label="Released rounds"
          value={String(w.summary?.roundStates.paid ?? released.length)}
          note="Both people confirmed completion"
        />
        {currencies.map((currency) => (
          <Stat
            key={currency}
            label={`Pay released · ${currency}`}
            value={money(
              w.summary?.currencies.find((total) => total.currency === currency)
                ?.paidCents ??
                released
                  .filter((r) => (r.currency ?? "USD") === currency)
                  .reduce((n, r) => n + r.amountCents, 0),
              currency,
            )}
            note="Candidate amount before reversals"
          />
        ))}
      </div>
      <div className="grid-two">
        <section className="panel">
          <div className="panel-heading">
            <h2>Round states</h2>
          </div>
          <div className="panel-body chart-bars">
            {states.map((s) => {
              const count =
                w.summary?.roundStates[s] ??
                w.rounds.filter((r) => r.status === s).length;
              const total = w.summary?.counts.rounds ?? w.rounds.length;
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
                        width: `${total ? (count / total) * 100 : 0}%`,
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
            <h2>Open disputes{w.summary && ` · ${w.summary.openDisputes}`}</h2>
          </div>
          <div className="panel-body">
            {disputes.length ? (
              disputes.map((d) => (
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
              <p>
                {w.summary?.openDisputes
                  ? "Load more disputes to see earlier open cases."
                  : "No open disputes in your records."}
              </p>
            )}
            <p className="result-note">
              Disputes need a support review. The assistant cannot resolve them.
            </p>
            <Link href="/policy" className="text-link">
              Review the pay policy <ArrowRight size={15} />
            </Link>
          </div>
          <CollectionPager collection="disputes" label="disputes" />
        </section>
      </div>
    </>
  );
}
