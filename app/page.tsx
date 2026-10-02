import Link from "next/link";
import {
  ArrowRight,
  Check,
  Clock,
  FileCheck,
  MessageCircle,
  Code2,
  ArrowUpRight,
} from "lucide-react";
import { DemoNotice, PublicShell } from "@/components/site";
import { defaults, money } from "@/lib/domain";
export default function Home() {
  return (
    <PublicShell>
      <DemoNotice />
      <section className="hero">
        <div className="container hero-grid">
          <div className="hero-copy">
            <h1>
              Good interviews.
              <br />
              <span>Fair pay.</span>
            </h1>
            <p>
              Employers pay candidates for each round. Agree on the amount
              before you give your time.
            </p>
            <div className="hero-actions">
              <Link className="button lime" href="/workspace">
                Explore the demo <ArrowRight size={20} />
              </Link>
              <Link className="text-link on-blue" href="/how-it-works">
                See how it works <ArrowUpRight size={17} />
              </Link>
            </div>
            <div className="hero-promise">
              <Check size={16} /> Candidates never pay a platform fee.
            </div>
          </div>
          <div
            className="round-path"
            aria-label="Illustrative paid interview rounds"
          >
            {defaults.map((r, i) => {
              const Icon = [MessageCircle, Code2, FileCheck][i];
              return (
                <div className="path-step" key={r.kind}>
                  <span className="step-number">{i + 1}</span>
                  <div className="path-row">
                    <span className="path-icon">
                      <Icon size={24} />
                    </span>
                    <div>
                      <strong>{r.kind}</strong>
                      <span>
                        <Clock size={13} />
                        {r.minutes} minutes
                      </span>
                    </div>
                    <b>{money(r.cents)}</b>
                  </div>
                </div>
              );
            })}
            <div className="path-total">
              <span className="check-disc">
                <Check size={24} />
              </span>
              <div>
                <strong>Your time, accounted for.</strong>
                <span>Pay stays yours, whatever the decision.</span>
              </div>
            </div>
            <p className="path-caption">Illustrative pilot prices · USD</p>
          </div>
        </div>
      </section>
      <section className="role-section">
        <div className="container roles">
          <div>
            <h2>
              Build a process
              <br />
              people want to join.
            </h2>
            <p>
              Set a budget for every round. Give candidates clear terms and a
              reason to commit.
            </p>
            <Link className="button dark" href="/workspace">
              Open employer workspace <ArrowRight size={18} />
            </Link>
          </div>
          <div>
            <h2>
              Bring your skills.
              <br />
              Keep your pay.
            </h2>
            <p>
              See the amount up front. Track your rounds, review the terms, and
              keep a record of your pay.
            </p>
            <Link className="button secondary" href="/workspace?role=candidate">
              Open candidate workspace <ArrowRight size={18} />
            </Link>
          </div>
        </div>
      </section>
      <section className="container process-section">
        <div className="section-intro">
          <h2>
            A small agreement.
            <br />A better interview.
          </h2>
          <p>
            The amount is only one part. A good round also has a clear scope, a
            time limit, and a fair way to resolve a problem.
          </p>
        </div>
        <div className="process-list">
          <article>
            <h3>Agree on visible terms.</h3>
            <p>
              The candidate sees the time, amount, and task before they accept.
            </p>
          </article>
          <article>
            <h3>Fund the agreed round.</h3>
            <p>
              The employer funds the accepted round through the payment
              provider.
            </p>
          </article>
          <article>
            <h3>Confirm the round. Release the pay.</h3>
            <p>
              Both people confirm completion. A dispute stops the release for
              review.
            </p>
          </article>
        </div>
      </section>
      <section className="open-band">
        <div className="container open-content">
          <Code2 size={44} />
          <div>
            <h2>
              The rules are open.
              <br />
              So is the code.
            </h2>
            <p>
              Transparent fees. A public money model. An optional AI assistant
              you can connect to an open-weight model.
            </p>
          </div>
          <Link href="/open" className="button lime">
            Explore the open model <ArrowRight size={18} />
          </Link>
        </div>
      </section>
      <section className="container closing">
        <h2>Start with a fair round.</h2>
        <p>
          Try both sides of the process. The demo runs with fictional data and
          cannot move money.
        </p>
        <Link href="/workspace" className="button">
          Try Fairstage <ArrowRight size={18} />
        </Link>
      </section>
    </PublicShell>
  );
}
