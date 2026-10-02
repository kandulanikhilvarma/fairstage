import Link from "next/link";
import { PublicShell } from "@/components/site";
import { ArrowUpRight, Code2 } from "lucide-react";
export default function Open() {
  return (
    <PublicShell>
      <div className="document">
        <h1>
          An open model
          <br />
          for a fair round.
        </h1>
        <p>
          The code is open source under the MIT License. You can inspect the fee
          calculations, payment states, and candidate protections.
        </p>
        <h2>Open-source software</h2>
        <p>
          Self-host the app or adapt it to your pilot. The repository includes
          the database schema, API, tests, setup guide, and launch checklist.
        </p>
        <h2>Transparent economics</h2>
        <p>
          The Launch plan adds an 8% employer fee to the candidate amount. A $45
          interview costs the employer $48.60 before any applicable tax.
        </p>
        <p>
          The candidate receives $45 in their connected account. Processing
          costs reduce the platform margin. The pilot has no candidate fee.
        </p>
        <h2>Open-weight AI, when you want it</h2>
        <p>
          Connect an OpenAI-compatible endpoint from vLLM or another model
          server. Choose your model and review its license before use.
        </p>
        <p>
          The assistant suggests questions and a preparation plan. It does not
          score people, rank applicants, or decide who gets a job.
        </p>
        <p>
          Without an endpoint, Fairstage gives a local preparation guide. The
          demo uses this local guide.
        </p>
        <div className="notice">
          <Code2 size={19} />
          <span>
            The adapter supports an open-weight model. This repository does not
            include model weights or claim a model&apos;s output is correct.
          </span>
        </div>
        <h2>Help improve the rules.</h2>
        <p>
          Inspect the project and suggest a concrete change through GitHub. The
          contribution guide explains tests and money-state requirements.
        </p>
        <a
          className="button"
          href="https://github.com/kandulanikhilvarma/fairstage"
        >
          View the repository <ArrowUpRight size={18} />
        </a>
        <p style={{ marginTop: 24 }}>
          <Link href="/pricing">Explore the pilot prices</Link>
        </p>
      </div>
    </PublicShell>
  );
}
