import { cleanExpiredAuth, maintenanceAuthorized } from "@/lib/maintenance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  if (!maintenanceAuthorized(request))
    return Response.json(
      { error: "This request is not authorized." },
      { status: 401, headers },
    );
  if (!process.env.DATABASE_URL)
    return Response.json(
      { error: "Maintenance is not available." },
      { status: 503, headers },
    );
  try {
    return Response.json(await cleanExpiredAuth(), { headers });
  } catch {
    console.error("The scheduled maintenance job failed.");
    return Response.json(
      { error: "Maintenance could not complete." },
      { status: 503, headers },
    );
  }
}
