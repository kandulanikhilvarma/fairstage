import type { Metadata } from "next";
import "@fontsource/manrope/600.css";
import "@fontsource/manrope/700.css";
import "@fontsource/manrope/800.css";
import "@fontsource/public-sans/400.css";
import "@fontsource/public-sans/500.css";
import "@fontsource/public-sans/600.css";
import "./globals.css";
import { Provider } from "@/components/provider";
import { isDemo } from "@/lib/db";

export const metadata: Metadata = {
  title: {
    default: "Fairstage — Good interviews. Fair pay.",
    template: "%s | Fairstage",
  },
  description:
    "An open-source paid-interview platform. Employers pay candidates for each round, with clear terms and auditable payment states.",
  metadataBase: new URL(process.env.APP_URL || "https://fairstage.vercel.app"),
  openGraph: {
    title: "Fairstage — Good interviews. Fair pay.",
    description: "Agree on the round. Respect the time. Pay the person.",
    type: "website",
  },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <script
          type="application/json"
          id="design-contract"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              THESIS: "Paid rounds make interview time a clear agreement.",
              "OWN-WORLD":
                "Civic co-op identity; blue fields, lime actions, Manrope, Public Sans, precise round paths.",
              STORY: "Know the amount; explore the employer or candidate demo.",
              "FIRST VIEWPORT":
                "Blue split hero; large left offer; three connected round rows on the right; lime CTA.",
              FORM: "Direction 3; seed 06c69640; user delegated brand and layout; split comp approved.",
              FINISH:
                "unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md",
            }),
          }}
        />
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <Provider demo={isDemo()}>{children}</Provider>
      </body>
    </html>
  );
}
