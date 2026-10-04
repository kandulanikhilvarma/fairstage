import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  operatorCaseDetail,
  operatorCaseKey,
  operatorCaseQueue,
  operatorHealth,
  requireOperator,
  reviewOperatorCase,
} from "@/lib/operator";
import { checkOrigin, HttpError, rateLimit, requestJson } from "@/lib/security";

export const runtime = "nodejs";
type Context = { params: Promise<{ path: string[] }> };

function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function route(request: Request, context: Context) {
  try {
    const user = await requireOperator();
    const writes = request.method !== "GET";
    if (writes) checkOrigin(request);
    await rateLimit(
      `operator:${writes ? "write" : "read"}:${user.id}`,
      writes ? 20 : 120,
      60,
    );
    const { path } = await context.params;
    const url = new URL(request.url);
    if (!writes && path.length === 1) {
      if (path[0] === "session")
        return json({
          operator: { id: user.id, name: user.name, email: user.email },
          financialActionsEnabled: false,
        });
      if (path[0] === "health") return json(await operatorHealth());
      if (path[0] === "cases") return json(await operatorCaseQueue(url));
    }
    if (path[0] === "cases" && path.length === 3) {
      const { kind, id } = operatorCaseKey(path[1], path[2]);
      if (!writes) return json(await operatorCaseDetail(kind, id, url));
      return json(
        await reviewOperatorCase(user, kind, id, await requestJson(request)),
      );
    }
    throw new HttpError(404, "The operator API route does not exist.");
  } catch (error) {
    if (error instanceof HttpError)
      return json({ error: error.message }, error.status);
    if (error instanceof ZodError)
      return json({ error: "Check the operator review values." }, 400);
    const requestId = randomUUID();
    console.error(
      JSON.stringify({ event: "operator_request_failed", requestId }),
    );
    return json(
      {
        error: "The operator request could not complete. Try again later.",
        requestId,
      },
      500,
    );
  }
}

export const GET = route;
export const POST = route;
