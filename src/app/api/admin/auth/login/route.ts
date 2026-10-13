import { NextRequest } from "next/server";

import { verifyAdminCredentials } from "@/lib/auth/credentials";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { buildSessionCookie, createSessionToken } from "@/lib/auth/session";
import { recordAuditEvent } from "@/lib/audit/audit";
import { clientRateLimitKey, jsonError, jsonOk, readJsonBody } from "@/lib/http/api";
import { validateLoginBody } from "@/lib/validation/params";
import type { LoginResponseDto } from "@/types/api";

export const runtime = "nodejs";

const LOGIN_RATE_LIMIT = { maxAttempts: 5, windowMs: 15 * 60 * 1000 };

/**
 * Administrator sign-in. Issues an HttpOnly, HMAC-signed session cookie on
 * success. Rate-limited per client address + email; all attempts (successful
 * or not) are audited.
 */
export async function POST(request: NextRequest): Promise<Response> {
  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) {
    return jsonError("invalid_request", "A JSON body with email and password is required.", 400);
  }
  const credentials = validateLoginBody(parsedBody.body);
  if (!credentials.ok) {
    return jsonError("invalid_request", credentials.message, 400);
  }

  const emailKey = credentials.value.email.toLowerCase();
  const rateLimitKey = `login:${clientRateLimitKey(request, "unknown")}:${emailKey}`;
  const rate = checkRateLimit(rateLimitKey, LOGIN_RATE_LIMIT);
  if (!rate.allowed) {
    recordAuditEvent({ adminEmail: emailKey, action: "login.rate_limited", status: "failure", reason: "rate_limited" });
    return jsonError("rate_limited", "Too many sign-in attempts. Try again later.", 429, {
      headers: { "Retry-After": String(rate.retryAfterSeconds) },
    });
  }

  const result = verifyAdminCredentials(credentials.value.email, credentials.value.password);
  if (!result.ok) {
    recordAuditEvent({ adminEmail: emailKey, action: "login.failed", status: "failure", reason: result.reason });
    // Same message for unknown-admin and wrong-password: no user enumeration.
    return jsonError("unauthorized", "Invalid email or password.", 401);
  }

  recordAuditEvent({ adminEmail: result.email, action: "login.success", status: "success" });
  const token = createSessionToken(result.email);
  return jsonOk<LoginResponseDto>({ email: result.email }, {
    headers: { "Set-Cookie": buildSessionCookie(token) },
  });
}
