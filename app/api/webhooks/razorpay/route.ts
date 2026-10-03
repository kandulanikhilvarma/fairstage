import { NextResponse } from "next/server";
import { HttpError } from "@/lib/security";
import { processRazorpayWebhook, razorpayWebhookReady } from "@/lib/razorpay";
export const runtime = "nodejs";
export async function POST(request: Request) {
  if (!process.env.DATABASE_URL || !razorpayWebhookReady())
    return NextResponse.json(
      { error: "Payments are not configured." },
      { status: 503 },
    );
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > 1000000)
    return NextResponse.json(
      { error: "The event is too large." },
      { status: 413 },
    );
  try {
    await processRazorpayWebhook(
      raw,
      request.headers.get("x-razorpay-signature") ?? "",
      request.headers.get("x-razorpay-event-id") ?? "",
    );
    return NextResponse.json({ received: true });
  } catch (error) {
    if (error instanceof HttpError && error.status < 500)
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    console.error(
      JSON.stringify({
        event: "razorpay_webhook_failed",
        id: request.headers.get("x-razorpay-event-id"),
      }),
    );
    return NextResponse.json(
      { error: "The event could not complete. Retry the event." },
      { status: 500 },
    );
  }
}
