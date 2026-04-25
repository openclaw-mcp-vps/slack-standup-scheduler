import { createHmac, timingSafeEqual } from "crypto";

const ACCESS_COOKIE_NAME = "standup_access";
const ACCESS_DURATION_SECONDS = 60 * 60 * 24 * 30;

function getSigningSecret(): string {
  return (
    process.env.PAYWALL_COOKIE_SECRET ||
    process.env.STRIPE_WEBHOOK_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    "dev-only-secret"
  );
}

function sign(payload: string): string {
  return createHmac("sha256", getSigningSecret()).update(payload).digest("hex");
}

export function getAccessCookieName(): string {
  return ACCESS_COOKIE_NAME;
}

export function createAccessCookieValue(email: string): string {
  const normalizedEmail = email.trim().toLowerCase();
  const expiresAt = Math.floor(Date.now() / 1000) + ACCESS_DURATION_SECONDS;
  const payload = `${normalizedEmail}|${expiresAt}`;
  const signature = sign(payload);
  return Buffer.from(`${payload}|${signature}`, "utf8").toString("base64url");
}

export function verifyAccessCookieValue(cookieValue: string | undefined): {
  valid: boolean;
  email?: string;
} {
  if (!cookieValue) {
    return { valid: false };
  }

  let decoded = "";
  try {
    decoded = Buffer.from(cookieValue, "base64url").toString("utf8");
  } catch {
    return { valid: false };
  }

  const [email, expiresAtRaw, signature] = decoded.split("|");
  if (!email || !expiresAtRaw || !signature) {
    return { valid: false };
  }

  const payload = `${email}|${expiresAtRaw}`;
  const expectedSignature = sign(payload);
  const signatureBuffer = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expectedSignature, "hex");

  if (signatureBuffer.length !== expectedBuffer.length) {
    return { valid: false };
  }

  if (!timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return { valid: false };
  }

  const expiresAt = Number(expiresAtRaw);
  if (Number.isNaN(expiresAt) || expiresAt < Math.floor(Date.now() / 1000)) {
    return { valid: false };
  }

  return { valid: true, email };
}

export function getAccessCookieMaxAge(): number {
  return ACCESS_DURATION_SECONDS;
}
