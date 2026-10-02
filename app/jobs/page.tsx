import { JobsBoard } from "@/components/jobs";
import { PublicShell } from "@/components/site";
export default function Jobs() {
  return (
    <PublicShell>
      <div className="container page-heading">
        <h1>
          Find your next
          <br />
          paid interview.
        </h1>
        <p>
          Explore a role. See the process. Agree on the round pay before you
          commit your time.
        </p>
      </div>
      <section className="container page-bottom">
        <JobsBoard />
      </section>
    </PublicShell>
  );
}
