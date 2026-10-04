import type { Metadata } from "next";
import { OperatorConsole } from "@/components/operator-console";

export const metadata: Metadata = {
  title: "Operator console",
  robots: { index: false, follow: false },
};

export default function OperatorPage() {
  return <OperatorConsole />;
}
