import Link from "next/link";
import { PublicShell } from "@/components/site";
import { ArrowRight } from "lucide-react";
export default function How() {
  return (
    <PublicShell>
      <div className="document">
        <h1>
          Make every round
          <br />a clear agreement.
        </h1>
        <p>
          Fairstage connects a paid interview to a fixed scope and duration. The
          hire decision does not control the candidate pay.
        </p>
        {[
          [
            "Offer a paid round.",
            "The employer sets the amount, duration, date, and meeting link. The candidate reads the terms and accepts or declines.",
          ],
          [
            "Fund the accepted round.",
            "The candidate completes payment setup. The employer funds the candidate amount and platform fee through Stripe Checkout. The provider confirms the payment.",
          ],
          [
            "Confirm the work together.",
            "After the scheduled round ends, both people confirm completion. Either person can open a dispute before release.",
          ],
          [
            "Release the candidate pay.",
            "The app transfers the round amount to the candidate's verified connected account. The payment provider controls the bank settlement schedule.",
          ],
        ].map(([title, text], i) => (
          <article className="how-step" key={title}>
            <span>{i + 1}</span>
            <div>
              <h2>{title}</h2>
              <p>{text}</p>
            </div>
          </article>
        ))}
        <h2>Rejection does not cancel earned pay.</h2>
        <p>
          Completed interviews create a payment obligation. Candidates do not
          repay their interview pay after a rejection. The app cannot deduct a
          first salary.
        </p>
        <h2>Try each side.</h2>
        <p>
          The public demo has an employer workspace and a candidate workspace.
          Switch roles to test acceptance, completion, and payment release.
        </p>
        <Link href="/workspace" className="button">
          Explore the process <ArrowRight size={18} />
        </Link>
      </div>
    </PublicShell>
  );
}
