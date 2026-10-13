import "server-only";

import crypto from "node:crypto";

import { getEnv } from "@/lib/config/env";

/**
 * Admin session tokens: compact HMAC-SHA256-signed payloads carried in an
 * HttpOnly cookie. Implemented with node:crypto to avoid a JWT dependency; the
 * token is only ever issued to and verified by this application.
 */

export const SESSION_COOKIE_NAME = "st_admin_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8; // 8 hours

export type SessionPayload = {
  /** Admin email (allowlist member). */
  sub: string;
  /** Issued-at, seconds since epoch. */
  iat: number;
  /** Expiry, seconds since epoch. */
  exp: number;
};

function sign(body: string): string {
  return crypto.createHmac("sha256", getEnv().sessionSecret).update(body).digest("base64url");
}

export function createSessionToken(email: string): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = { sub: email, iat: now, exp: now + SESSION_MAX_AGE_SECONDS };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${sign(body)}`;
}

/** Verifies signature and expiry. Returns null for any invalid token. */
export function verifySessionToken(token: string): SessionPayload | null {
  const separatorIndex = token.indexOf(".");
  if (separatorIndex <= 0 || separatorIndex === token.length - 1) {
    return null;
  }
  const body = token.slice(0, separatorIndex);
  const providedSignature = token.slice(separatorIndex + 1);

  const expectedSignature = sign(body);
  const providedBuffer = Buffer.from(providedSignature, "utf8");
  const expectedBuffer = Buffer.from(expectedSignature, "utf8");
  if (providedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(providedBuffer, expectedBuffer)) {
    return null;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof payload !== "object" || payload === null) {
    return null;
  }
  const candidate = payload as Partial<SessionPayload>;
  if (typeof candidate.sub !== "string" || typeof candidate.exp !== "number") {
    return null;
  }
  if (candidate.exp <= Math.floor(Date.now() / 1000)) {
    return null;
  }
  return { sub: candidate.sub, iat: candidate.iat ?? 0, exp: candidate.exp };
}

export function buildSessionCookie(token: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_SECONDS}${secure}`;
}

export function buildClearSessionCookie(): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}
