import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";

import { upsertPurchase } from "@/lib/database";

export const runtime = "nodejs";

function verifyStripeSignature(rawBody: string, signatureHeader: string, webhookSecret: string): boolean {
  const entries = signatureHeader.split(",").map((part) => part.trim());
  const timestamp = entries.find((part) => part.startsWith("t="))?.replace("t=", "");
  const signatures = entries
    .filter((part) => part.startsWith("v1="))
    .map((part) => part.replace("v1=", ""));

  if (!timestamp || signatures.length === 0) {
    return false;
  }

  const payload = `${timestamp}.${rawBody}`;
  const expected = createHmac("sha256", webhookSecret).update(payload).digest("hex");
  const expectedBuffer = Buffer.from(expected, "hex");

  return signatures.some((sig) => {
    const signatureBuffer = Buffer.from(sig, "hex");
    if (signatureBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return timingSafeEqual(signatureBuffer, expectedBuffer);
  });
}

export async function POST(request: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json(
      { ok: false, error: "STRIPE_WEBHOOK_SECRET is not configured." },
      { status: 500 }
    );
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ ok: false, error: "missing_signature" }, { status: 400 });
  }

  const rawBody = await request.text();
  if (!verifyStripeSignature(rawBody, signature, webhookSecret)) {
    return NextResponse.json({ ok: false, error: "invalid_signature" }, { status: 400 });
  }

  const event = JSON.parse(rawBody) as {
    type: string;
    data?: {
      object?: {
        id?: string;
        customer?: string;
        customer_email?: string;
        customer_details?: {
          email?: string;
        };
        amount_total?: number;
        currency?: string;
        metadata?: Record<string, unknown>;
      };
    };
  };

  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    const session = event.data?.object;
    const email = session?.customer_details?.email || session?.customer_email;

    if (!session?.id || !email) {
      return NextResponse.json({ ok: false, error: "missing_checkout_fields" }, { status: 400 });
    }

    await upsertPurchase({
      email,
      sessionId: session.id,
      customerId: session.customer ?? null,
      amountTotal: session.amount_total ?? null,
      currency: session.currency ?? null,
      status: "paid",
      metadata: session.metadata ?? {},
    });
  }

  return NextResponse.json({ received: true });
}
