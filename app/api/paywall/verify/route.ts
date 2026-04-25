import { NextRequest, NextResponse } from "next/server";

import { hasPaidPurchase } from "@/lib/database";
import {
  createAccessCookieValue,
  getAccessCookieMaxAge,
  getAccessCookieName,
} from "@/lib/paywall";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { email?: string } | null;
  const email = body?.email?.trim().toLowerCase();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ ok: false, error: "Please provide a valid work email." }, { status: 400 });
  }

  const hasPurchase = await hasPaidPurchase(email);
  if (!hasPurchase) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "No paid checkout found for that email yet. Use the same email in Stripe checkout and wait a minute for webhook delivery.",
      },
      { status: 402 }
    );
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: getAccessCookieName(),
    value: createAccessCookieValue(email),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: getAccessCookieMaxAge(),
  });

  return response;
}
