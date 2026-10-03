import Link from "next/link";
import { PublicShell } from "@/components/site";
import { interviewTemplates } from "@/lib/templates";
import { ArrowRight } from "lucide-react";
export default function Examples() {
  return (
    <PublicShell>
      <div className="document">
        <h1>Two ways to start a fair round.</h1>
        <p>
          Use these interview templates as a starting point. Set the amount,
          schedule, and scope with the candidate before you fund a round.
        </p>
        {interviewTemplates.map((t, i) => (
          <section key={t.name}>
            <h2>{t.name}</h2>
            <p>{t.terms}</p>
            <p>
              {i === 0
                ? "Suggested duration: 30 minutes."
                : "Suggested duration: 60 minutes."}
            </p>
            <Link className="button secondary" href="/account?role=employer">
              Use this approach <ArrowRight size={17} />
            </Link>
          </section>
        ))}
        <p>
          The employer can choose USD or INR. Payment methods depend on the
          provider and the candidate account.
        </p>
      </div>
    </PublicShell>
  );
}
