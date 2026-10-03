import { authRoute, verifyMagicLink } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function POST(request: Request) {
  return authRoute(() => verifyMagicLink(request));
}
