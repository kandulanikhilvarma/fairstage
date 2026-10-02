"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main id="main" className="document">
      <h1>This page could not load.</h1>
      <p>
        Try the page again. If the problem continues, contact the service owner.
      </p>
      <button className="button" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
