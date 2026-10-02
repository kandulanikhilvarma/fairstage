import { NextResponse } from "next/server";
import { isDemo } from "@/lib/db";
import { stripe, processWebhook } from "@/lib/payments";

export const runtime = "nodejs";
export async function POST(request: Request) {
  if (isDemo() || !process.env.STRIPE_WEBHOOK_SECRET)
    return NextResponse.json(
      { error: "Payments are not configured." },
      { status: 503 },
    );
  const signature = request.headers.get("stripe-signature");
  if (!signature)
    return NextResponse.json(
      { error: "The signature is missing." },
      { status: 400 },
    );
  const body = await request.text();
  if (body.length > 1000000)
    return NextResponse.json(
      { error: "The event is too large." },
      { status: 413 },
    );
  let event;
  try {
    event = stripe().webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch {
    return NextResponse.json(
      { error: "The event signature is not valid." },
      { status: 400 },
    );
  }
  try {
    await processWebhook(event);
    return NextResponse.json({ received: true });
  } catch {
    console.error(
      JSON.stringify({
        event: "webhook_failed",
        id: event.id,
        type: event.type,
      }),
    );
    return NextResponse.json(
      { error: "The event could not complete. Retry the event." },
      { status: 500 },
    );
  }
}
