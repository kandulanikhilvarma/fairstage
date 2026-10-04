"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Search } from "lucide-react";
import { api, useApp } from "./provider";
import { money, type Job } from "@/lib/domain";
export function JobsBoard() {
  const { workspace, role, mutate } = useApp();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [open, setOpen] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<{ jobs: Job[] }>("jobs")
      .then((r) => setJobs(r.jobs))
      .catch(() => setError("The jobs could not load. Refresh the page."));
  }, []);
  const all = jobs;
  const filtered = all.filter(
    (j) =>
      j.status === "open" &&
      (!category || j.category === category) &&
      `${j.title} ${j.company} ${j.location}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  async function apply(id: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await mutate(`jobs/${id}/apply`, { note });
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
      <div className="job-list">
        {filtered.map((job) => (
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
                ) : workspace.applications.some((a) => a.jobId === job.id) ? (
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
      {!filtered.length && (
        <div className="empty">
          <Search size={28} />
          <h2>No roles match this search.</h2>
          <p>Try another term or category.</p>
        </div>
      )}
    </>
  );
}
