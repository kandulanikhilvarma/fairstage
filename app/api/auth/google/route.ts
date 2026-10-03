import { authRoute } from "@/lib/auth";
import { startGoogleSignIn } from "@/lib/google-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function POST(request: Request) {
  return authRoute(() => startGoogleSignIn(request));
}
