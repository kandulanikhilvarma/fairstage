"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Info } from "lucide-react";
import { PublicShell, Tick } from "@/components/site";
import { bonusCredit, defaults, money, plans } from "@/lib/domain";
export default function Pricing() {
  const [counts, setCounts] = useState([10, 5, 2]);
  const [plan, setPlan] = useState(0);
  const [bonus, setBonus] = useState(1000);
  const [offset, setOffset] = useState(false);
  const pay = counts.reduce(
    (total, count, i) => total + count * defaults[i].cents,
    0,
  );
  const fee = Math.round((pay * plans[plan].bps) / 10000);
  const credit = bonusCredit(
    15000,
    Math.round((Number.isFinite(bonus) ? Math.max(0, bonus) : 0) * 100),
  );
  return (
    <PublicShell>
      <section className="container page-heading">
        <h1>
          Fair pay.
          <br />
          Clear costs.
        </h1>
        <p>
          Candidates keep the stated round amount. Employers cover the platform
          fee. Start small and see the cost before you commit.
        </p>
        <div className="notice">
          <Info size={18} />
          <span>
            All prices are pilot proposals in USD. The first release supports
            Launch fees. Team and Scale are cost models.
          </span>
        </div>
      </section>
      <section className="container page-bottom">
        <div className="plan-grid">
          {plans.map((p, i) => (
            <article
              key={p.name}
              className={`plan ${i === 1 ? "highlight" : ""}`}
            >
              <h2>{p.name}</h2>
              <div className="price">
                {money(p.monthlyCents)}
                <span> / month</span>
              </div>
              <p>
                {
                  [
                    "For a first paid-interview pilot.",
                    "A proposed plan for a growing team.",
                    "A proposed plan for a larger program.",
                  ][i]
                }
              </p>
              <ul>
                <li>
                  <Tick>{p.bps / 100}% platform fee</Tick>
                </li>
                <li>
                  <Tick>Clear terms for each round</Tick>
                </li>
                <li>
                  <Tick>Candidate payment records</Tick>
                </li>
                <li>
                  <Tick>Disputes and audit events</Tick>
                </li>
              </ul>
              <Link
                href="/account?role=employer"
                className={`button ${i === 1 ? "lime" : "secondary"}`}
              >
                {i === 0 ? "Try Launch" : "View account options"}
                <ArrowRight size={17} />
              </Link>
            </article>
          ))}
        </div>
        <div className="calculator">
          <h2>Plan your interview budget.</h2>
          <div className="calc-grid">
            <div className="calc-controls">
              <div className="field">
                <label htmlFor="estimate-plan">Plan to estimate</label>
                <select
                  id="estimate-plan"
                  value={plan}
                  onChange={(e) => setPlan(+e.target.value)}
                >
                  {plans.map((p, i) => (
                    <option key={p.name} value={i}>
                      {p.name}
                      {i > 0 ? " (proposed)" : ""}
                    </option>
                  ))}
                </select>
              </div>
              {defaults.map((r, i) => (
                <div key={r.kind} className="field">
                  <label htmlFor={`round-count-${i}`}>
                    {r.kind} · {money(r.cents)} each
                  </label>
                  <div className="calc-range">
                    <input
                      id={`round-count-${i}`}
                      type="range"
                      min="0"
                      max="100"
                      value={counts[i]}
                      onChange={(e) =>
                        setCounts(
                          counts.map((n, j) => (j === i ? +e.target.value : n)),
                        )
                      }
                    />
                    <output htmlFor={`round-count-${i}`}>{counts[i]}</output>
                  </div>
                </div>
              ))}
            </div>
            <div className="calc-result" aria-live="polite">
              <div className="calc-line">
                <span>Candidate pay</span>
                <span>{money(pay)}</span>
              </div>
              <div className="calc-line">
                <span>Platform fee ({plans[plan].bps / 100}%)</span>
                <span>{money(fee)}</span>
              </div>
              <div className="calc-line">
                <span>Proposed monthly fee</span>
                <span>{money(plans[plan].monthlyCents)}</span>
              </div>
              <div className="calc-line total">
                <span>Estimated budget</span>
                <span>{money(pay + fee + plans[plan].monthlyCents)}</span>
              </div>
              <p>
                Taxes are excluded. The Launch fee covers platform service.
                Payment processing reduces the platform margin in this release.
              </p>
              <p>
                Candidates receive the full stated amount. Currency conversion
                or bank fees depend on the provider.
              </p>
            </div>
          </div>
        </div>
        <div className="calculator">
          <h2>What happens after a hire?</h2>
          <p className="muted">
            Interview pay stays with the candidate. Base salary stays separate.
            A future policy can treat the pay as part of a separate signing
            bonus.
          </p>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={offset}
              onChange={(e) => setOffset(e.target.checked)}
            />
            Explore a proposed bonus credit. This is a calculator, not an
            enabled payroll feature.
          </label>
          {offset && (
            <div className="calc-grid">
              <div>
                <div className="field">
                  <label htmlFor="bonus">Separate signing bonus · USD</label>
                  <input
                    id="bonus"
                    type="number"
                    min="0"
                    max="100000"
                    value={bonus}
                    onChange={(e) =>
                      setBonus(
                        Math.min(100000, Math.max(0, Number(e.target.value))),
                      )
                    }
                  />
                </div>
                <p className="small-text muted">
                  Example: all three rounds total $150. The parties must agree
                  to any bonus terms before the first round.
                </p>
              </div>
              <div className="calc-result">
                <div className="calc-line">
                  <span>Interview pay already earned</span>
                  <span>$150</span>
                </div>
                <div className="calc-line">
                  <span>Proposed bonus credit</span>
                  <span>{money(credit.creditCents)}</span>
                </div>
                <div className="calc-line">
                  <span>Remaining bonus</span>
                  <span>{money(credit.remainingBonusCents)}</span>
                </div>
                <div className="calc-line total">
                  <span>Base salary deduction</span>
                  <span>$0</span>
                </div>
              </div>
            </div>
          )}
          <p className="result-note">
            Bonus terms also need local legal review. The app does not deduct
            salary or create a repayment debt.
          </p>
          <Link className="text-link" href="/policy">
            Read the pay policy <ArrowRight size={16} />
          </Link>
        </div>
      </section>
    </PublicShell>
  );
}
