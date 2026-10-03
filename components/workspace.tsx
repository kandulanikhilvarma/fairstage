"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  BriefcaseBusiness,
  CalendarDays,
  CircleHelp,
  FileText,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Plus,
  Settings,
  Sparkles,
  Wallet,
} from "lucide-react";
import { Logo } from "./site";
import { api, useApp } from "./provider";
import { dateLabel, money, type Round } from "@/lib/domain";
import { Interviews, NewRound } from "./rounds";
import {
  WorkspaceJobs,
  Profile,
  Preparation,
  WalletPage,
  Analytics,
} from "./workspace-pages";

const routes = [
  { href: "/workspace", name: "Overview", Icon: LayoutDashboard },
  {
    href: "/workspace/interviews",
    name: "Interview rounds",
    Icon: CalendarDays,
  },
  {
    href: "/workspace/jobs",
    name: "Jobs and applications",
    Icon: BriefcaseBusiness,
  },
  { href: "/workspace/wallet", name: "Payments", Icon: Wallet },
  { href: "/workspace/preparation", name: "Preparation", Icon: Sparkles },
  { href: "/workspace/analytics", name: "Insights", Icon: BarChart3 },
  { href: "/workspace/settings", name: "Account settings", Icon: Settings },
];
export function WorkspaceApp() {
  const app = useApp();
  const router = useRouter();
  const pathname = usePathname();
  const selected = routes.find((r) => r.href === pathname);
  const [newRound, setNewRound] = useState(false);
  const [error, setError] = useState("");
  const unknown = !selected;
  async function logout() {
    try {
      await api("auth/logout", {});
      app.clearSession();
      router.replace("/account");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The sign-out request failed.");
    }
  }
  return (
    <div className="workspace">
      <aside className="sidebar">
        <Logo />
        <div className="workspace-select">
          <strong>
            {app.workspace?.user.company ||
              app.workspace?.user.name ||
              "Your workspace"}
          </strong>
          <span>
            {app.role === "employer" ? "Employer" : "Candidate"} workspace
          </span>
        </div>
        <nav className="workspace-nav" aria-label="Workspace navigation">
          {routes.map(({ href, name, Icon }) => (
            <Link
              key={href}
              href={href}
              className={pathname === href ? "active" : ""}
              aria-current={pathname === href ? "page" : undefined}
            >
              <Icon size={19} />
              {name}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <Link href="/policy">
            <CircleHelp size={17} />
            Pay policy and help <ArrowUpRight size={13} />
          </Link>
          <Link href="/open">
            <FileText size={17} />
            Open model
          </Link>
          <p>
            Respect the time.
            <br />
            Pay the person.
          </p>
        </div>
      </aside>
      <div className="workspace-main">
        <header className="workspace-topbar">
          <span>{selected?.name || "Workspace"}</span>
          <div className="topbar-right">
            <span className="small-text muted">
              {app.workspace?.user.email}
            </span>
            {app.workspace && (
              <button
                className="icon-button"
                onClick={() => void logout()}
                aria-label="Sign out"
              >
                <LogOut size={17} />
              </button>
            )}
            <div className="avatar" aria-label={app.workspace?.user.name}>
              {(app.workspace?.user.name || "FS")
                .split(" ")
                .map((n) => n[0])
                .slice(0, 2)
                .join("")}
            </div>
          </div>
        </header>
        <main id="main" className="workspace-content">
          {error && (
            <div role="alert" className="notice error alert-space">
              {error}
            </div>
          )}
          {app.loading ? (
            <div className="skeleton" role="status">
              <LoaderCircle size={25} />
              <p>The workspace will load shortly.</p>
            </div>
          ) : !app.workspace ? (
            <div className="empty">
              <h1>Sign in to your workspace.</h1>
              <p>{app.error || "Your session is not active."}</p>
              <Link href="/account" className="button">
                Sign in <ArrowRight size={16} />
              </Link>
            </div>
          ) : unknown ? (
            <div className="empty">
              <h1>This workspace page does not exist.</h1>
              <Link href="/workspace" className="button">
                Open overview
              </Link>
            </div>
          ) : pathname === "/workspace" ? (
            <>
              <div className="workspace-heading">
                <div>
                  <h1>
                    {app.role === "employer"
                      ? `A fair start, ${app.workspace.user.name.split(" ")[0]}.`
                      : `Your time matters, ${app.workspace.user.name.split(" ")[0]}.`}
                  </h1>
                  <p>
                    {app.role === "employer"
                      ? "Give every interview a clear scope, budget, and next step."
                      : "Your interview rounds and pay, in one place."}
                  </p>
                </div>
                {app.role === "employer" && (
                  <button
                    className="button"
                    onClick={() => setNewRound(!newRound)}
                  >
                    <Plus size={17} />
                    {newRound ? "Close form" : "Offer a round"}
                  </button>
                )}
              </div>
              {newRound && app.role === "employer" && (
                <NewRound onDone={() => setNewRound(false)} />
              )}
              <Overview />
            </>
          ) : pathname.endsWith("/interviews") ? (
            <Interviews />
          ) : pathname.endsWith("/jobs") ? (
            <WorkspaceJobs />
          ) : pathname.endsWith("/wallet") ? (
            <WalletPage />
          ) : pathname.endsWith("/preparation") ? (
            <Preparation />
          ) : pathname.endsWith("/analytics") ? (
            <Analytics />
          ) : (
            <Profile />
          )}
        </main>
      </div>
    </div>
  );
}
export function Status({ round }: { round: Round }) {
  return (
    <span className={`status ${round.status}`}>
      {round.status === "paid" ? "Released" : round.status}
    </span>
  );
}
export function Heading({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="workspace-heading">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children}
    </div>
  );
}
export function Stat({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}
function Overview() {
  const { workspace: w, role, config } = useApp();
  if (!w) return null;
  const currencies = [...new Set(w.rounds.map((r) => r.currency || "USD"))];
  if (!currencies.length) currencies.push(config.currency);
  const paid = currencies
    .map((c) =>
      money(
        w.rounds
          .filter((r) => r.status === "paid" && (r.currency || "USD") === c)
          .reduce((s, r) => s + r.amountCents, 0),
        c,
      ),
    )
    .join(" · ");
  const committed = currencies
    .map((c) =>
      money(
        w.rounds
          .filter(
            (r) =>
              ["funded", "completed"].includes(r.status) &&
              (r.currency || "USD") === c,
          )
          .reduce((s, r) => s + r.amountCents, 0),
        c,
      ),
    )
    .join(" · ");
  const active = w.rounds.filter(
    (r) => !["paid", "cancelled"].includes(r.status),
  );
  return (
    <>
      <div className="workspace-banner">
        <div>
          <h2>
            {role === "employer"
              ? "Make the promise concrete."
              : "Know the pay before you say yes."}
          </h2>
          <p>
            {role === "employer"
              ? "An agreed amount tells candidates you respect their time. Start with the introduction, then set the next round."
              : "Read the terms of an offered round. After the interview, confirm completion to keep the payment on track."}
          </p>
        </div>
        <Link href="/workspace/interviews" className="button dark">
          Review rounds <ArrowRight size={16} />
        </Link>
      </div>
      <div className="stats">
        <Stat
          label={
            role === "employer" ? "Candidate pay released" : "Pay released"
          }
          value={paid}
          note="To connected accounts"
        />
        <Stat
          label="Candidate pay funded"
          value={committed}
          note="Awaiting completion or release"
        />
        <Stat
          label="Active rounds"
          value={String(active.length)}
          note={`${w.disputes.filter((d) => d.status === "open").length} open disputes`}
        />
      </div>
      <section className="panel">
        <div className="panel-heading">
          <h2>Your interview rounds</h2>
          <Link href="/workspace/interviews" className="text-link">
            View all <ArrowRight size={15} />
          </Link>
        </div>
        {w.rounds.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">
                    {role === "employer" ? "Candidate" : "Role"}
                  </th>
                  <th scope="col">Round</th>
                  <th scope="col">Time</th>
                  <th scope="col">Candidate pay</th>
                  <th scope="col">State</th>
                </tr>
              </thead>
              <tbody>
                {w.rounds.slice(0, 4).map((r) => (
                  <tr key={r.id}>
                    <td>
                      <strong>
                        {role === "employer" ? r.candidateName : r.title}
                      </strong>
                      <small>{role === "employer" ? r.title : r.company}</small>
                    </td>
                    <td>{r.kind}</td>
                    <td>{dateLabel(r.scheduledAt)}</td>
                    <td>
                      <strong>{money(r.amountCents, r.currency)}</strong>
                    </td>
                    <td>
                      <Status round={r} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="panel-body">
            <p>No rounds yet. Offer a round or apply for a role.</p>
          </div>
        )}
      </section>
      <div className="grid-two">
        <section className="panel">
          <div className="panel-heading">
            <h2>Payment activity</h2>
            <Wallet size={18} />
          </div>
          <div className="panel-body">
            {w.ledger.length ? (
              w.ledger.slice(0, 4).map((l) => (
                <div className="activity-row" key={l.id}>
                  <div>
                    <strong>
                      {l.type === "paid"
                        ? "Candidate pay released"
                        : l.type === "funded"
                          ? "Round funded"
                          : l.type}
                    </strong>
                    <small>{dateLabel(l.createdAt)}</small>
                  </div>
                  <strong>{money(l.amountCents, l.currency)}</strong>
                </div>
              ))
            ) : (
              <p>No payment events yet.</p>
            )}
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h2>Your next step</h2>
            <ArrowUpRight size={18} />
          </div>
          <div className="panel-body">
            <h3>
              {role === "employer"
                ? "Close the loop after each round."
                : "Prepare a concrete example."}
            </h3>
            <p>
              {role === "employer"
                ? "Confirm a completed round. The candidate also confirms before pay release. A hire decision stays separate."
                : "Use the preparation guide to turn a project into a clear story. Keep private and confidential information out of the topic."}
            </p>
            <Link
              href={
                role === "employer"
                  ? "/workspace/interviews"
                  : "/workspace/preparation"
              }
              className="text-link"
            >
              {role === "employer" ? "Review a round" : "Prepare for a round"}
              <ArrowRight size={16} />
            </Link>
          </div>
        </section>
      </div>
    </>
  );
}
