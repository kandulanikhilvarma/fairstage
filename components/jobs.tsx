"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Search } from "lucide-react";
import { api, useApp } from "./provider";
import { money, type PageInfo, type PublicJob } from "@/lib/domain";
export function JobsBoard() {
  const { workspace, role, mutate } = useApp();
  const [jobs, setJobs] = useState<PublicJob[]>([]);
  const [page, setPage] = useState<PageInfo>({ total: 0, nextCursor: null });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pageQuery, setPageQuery] = useState("");
  const [retry, setRetry] = useState(0);
  const generation = useRef(0);
  const pending = useRef(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [open, setOpen] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const params = new URLSearchParams({ pageSize: "50" });
  if (search.trim()) params.set("q", search.trim());
  if (category) params.set("category", category);
  const queryKey = params.toString();
  const viewerId = workspace?.user.id;
  const fetchDelay = search.trim() || category ? 250 : 0;
  useEffect(() => {
    const version = ++generation.current;
    let active = true;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const result = await api<{ jobs: PublicJob[]; page: PageInfo }>(
          `jobs?${queryKey}`,
        );
        if (!active || version !== generation.current) return;
        setJobs(result.jobs);
        setPage(result.page ?? { total: result.jobs.length, nextCursor: null });
        setPageQuery(queryKey);
      } catch (error) {
        if (active && version === generation.current) {
          setJobs([]);
          setPage({ total: 0, nextCursor: null });
          setPageQuery(queryKey);
          setError(
            error instanceof Error
              ? error.message
              : "The jobs could not load. Refresh the page.",
          );
        }
      } finally {
        if (active && version === generation.current) setLoading(false);
      }
    }, fetchDelay);
    return () => {
      window.clearTimeout(timer);
      active = false;
    };
  }, [queryKey, viewerId, retry, fetchDelay]);
  async function loadMore() {
    if (!page.nextCursor || pageQuery !== queryKey || pending.current) return;
    pending.current = true;
    const version = generation.current;
    setLoadingMore(true);
    setError("");
    try {
      const result = await api<{ jobs: PublicJob[]; page: PageInfo }>(
        `jobs?${queryKey}&cursor=${encodeURIComponent(page.nextCursor)}`,
      );
      if (version !== generation.current) return;
      setJobs((current) => [
        ...current,
        ...result.jobs.filter(
          (job) => !current.some((previous) => previous.id === job.id),
        ),
      ]);
      setPage(result.page);
    } catch (error) {
      if (version === generation.current)
        setError(
          error instanceof Error
            ? error.message
            : "The next page could not load. Try again.",
        );
    } finally {
      pending.current = false;
      setLoadingMore(false);
    }
  }
  async function apply(id: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await mutate(`jobs/${id}/apply`, { note });
      setJobs((current) =>
        current.map((job) => (job.id === id ? { ...job, applied: true } : job)),
      );
      setMessage(
        "Application saved. You can see it in the candidate workspace.",
      );
      setNote("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "The application failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="search-row">
        <label className="sr-only" htmlFor="job-search">
          Search jobs
        </label>
        <input
          id="job-search"
          className="filter-input"
          placeholder="Search role, company, or location"
          value={search}
          type="search"
          maxLength={200}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label className="sr-only" htmlFor="job-category">
          Job category
        </label>
        <select
          id="job-category"
          className="filter-input"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">All categories</option>
          {["Design", "Engineering", "Product", "Operations"].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
      <p role="status" className="small-text muted">
        {loading || pageQuery !== queryKey
          ? "Load roles…"
          : `${jobs.length} of ${page.total} roles loaded`}
      </p>
      {error && (
        <div role="alert" className="notice error alert-space">
          {error}
          {!jobs.length && (
            <button
              type="button"
              className="button secondary small"
              disabled={loading}
              onClick={() => setRetry((value) => value + 1)}
            >
              Retry roles
            </button>
          )}
        </div>
      )}
      {message && (
        <div role="status" className="notice success alert-space">
          {message}
        </div>
      )}
      <div className="job-list">
        {pageQuery === queryKey &&
          jobs.map((job) => (
            <article className="job-row" key={job.id}>
              <div className="job-summary">
                <div className="company-mark" aria-hidden="true">
                  {job.company[0]}
                </div>
                <div className="job-title">
                  <h2>{job.title}</h2>
                  <p>
                    {job.company} · {job.location}
                  </p>
                </div>
                <div className="job-pay">
                  <strong>
                    {money(job.salaryMin * 100, job.currency)}–
                    {money(job.salaryMax * 100, job.currency)}
                  </strong>
                  <span>Annual salary · {job.stages} paid rounds</span>
                </div>
                <button
                  className="button secondary small"
                  onClick={() => {
                    setOpen(open === job.id ? "" : job.id);
                    setMessage("");
                    setError("");
                  }}
                  aria-expanded={open === job.id}
                >
                  {open === job.id ? "Close" : "View role"}
                  <ArrowRight size={15} />
                </button>
              </div>
              {open === job.id && (
                <div className="job-detail">
                  <p>{job.description}</p>
                  {!workspace ? (
                    <Link className="button" href="/account">
                      Sign in to apply
                    </Link>
                  ) : role !== "candidate" ? (
                    <div>
                      <p>Applications use a candidate account.</p>
                      <Link className="text-link" href="/workspace">
                        Open employer workspace
                      </Link>
                    </div>
                  ) : job.applied ||
                    workspace.applications.some((a) => a.jobId === job.id) ? (
                    <div className="notice success">
                      You applied for this role. The employer can offer a paid
                      round.
                    </div>
                  ) : (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void apply(job.id);
                      }}
                    >
                      <div className="field">
                        <label htmlFor={`note-${job.id}`}>
                          Tell the team why this role interests you
                        </label>
                        <textarea
                          id={`note-${job.id}`}
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          minLength={20}
                          maxLength={3000}
                          required
                          placeholder="Share a short example of relevant work or study."
                        />
                      </div>
                      <button className="button" disabled={busy}>
                        {busy ? "Save application…" : "Send application"}
                        <ArrowRight size={16} />
                      </button>
                    </form>
                  )}
                </div>
              )}
            </article>
          ))}
      </div>
      {!loading && pageQuery === queryKey && !jobs.length && !error && (
        <div className="empty">
          <Search size={28} />
          <h2>No roles match this search.</h2>
          <p>Try another term or category.</p>
        </div>
      )}
      {page.nextCursor && pageQuery === queryKey && (
        <button
          className="button secondary"
          disabled={loading || loadingMore}
          aria-busy={loadingMore}
          onClick={() => void loadMore()}
        >
          {loadingMore ? "Load roles…" : "Load more roles"}
        </button>
      )}
    </>
  );
}
