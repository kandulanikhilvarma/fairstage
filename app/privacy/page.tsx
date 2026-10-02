import { PublicShell } from "@/components/site";
export default function Privacy() {
  return (
    <PublicShell>
      <div className="document">
        <h1>Privacy and data</h1>
        <p>
          This page describes the release&apos;s data behavior. A live operator
          must publish its legal identity, retention periods, and
          country-specific privacy notice.
        </p>
        <h2>Public demo</h2>
        <p>
          The demo stores fictional workspace data in your browser. The Reset
          demo control removes your changes. Do not enter personal or
          confidential data.
        </p>
        <p>
          The demo sends no workspace records to a database or payment service.
          The hosting provider can process ordinary request logs.
        </p>
        <h2>Live accounts</h2>
        <p>
          A configured live service stores the account name, email, role,
          profile, applications, and round records in PostgreSQL.
        </p>
        <p>
          The server stores password hashes and hashed session tokens. The
          browser receives an HTTP-only session cookie with a seven-day limit.
        </p>
        <h2>Payment data</h2>
        <p>
          Stripe collects payment and identity details on its hosted pages.
          Fairstage stores provider identifiers and payment states. The app does
          not store card numbers.
        </p>
        <h2>Optional AI</h2>
        <p>
          The local guide works without an AI provider. A configured AI service
          receives your topic and round type after you consent.
        </p>
        <p>
          Do not submit personal identifiers or confidential work. The app does
          not send applications or candidate profiles to the assistant.
        </p>
        <h2>Access and deletion</h2>
        <p>
          A live operator must handle access, correction, export, and deletion
          requests. Financial records can need a separate legal retention
          period.
        </p>
        <p>
          The repository includes an operator runbook. Before a live launch,
          publish a support contact and a process for privacy requests.
        </p>
      </div>
    </PublicShell>
  );
}
