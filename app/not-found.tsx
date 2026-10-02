import Link from "next/link";
import { PublicShell } from "@/components/site";
export default function NotFound() {
  return (
    <PublicShell>
      <div className="document">
        <h1>This page does not exist.</h1>
        <p>Return to Fairstage to explore the process.</p>
        <Link className="button" href="/">
          Open Fairstage
        </Link>
      </div>
    </PublicShell>
  );
}
