import "server-only";

import { NextRequest, NextResponse } from "next/server";

import type { ApiErrorCode, ApiFailure, ApiSuccess } from "@/types/api";

/** Consistent JSON envelope for every admin API response. */

export const REQUEST_BODY_LIMIT_BYTES = 32 * 1024;

export function jsonOk<T>(data: T, init?: ResponseInit): NextResponse<ApiSuccess<T>> {
  return NextResponse.json({ ok: true, data } satisfies ApiSuccess<T>, init);
}

export function jsonError(code: ApiErrorCode, message: string, status: number, init?: ResponseInit): NextResponse<ApiFailure> {
  return NextResponse.json({ ok: false, error: { code, message } } satisfies ApiFailure, {
    status,
    ...init,
  });
}

export type ParsedBody<T> = { ok: true; body: T } | { ok: false };

/**
 * Reads and parses a JSON request body with a hard size cap. Rejects invalid
 * JSON and oversized payloads without leaking parsing details to the client.
 */
export async function readJsonBody<T = unknown>(request: NextRequest): Promise<ParsedBody<T>> {
  const text = await request.text();
  if (text.length === 0 || text.length > REQUEST_BODY_LIMIT_BYTES) {
    return { ok: false };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false };
  }
  return { ok: true, body: parsed as T };
}

/** Best-effort client address for rate-limit keying; never trusted for auth. */
export function clientRateLimitKey(request: NextRequest, fallback: string): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded !== null && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }
  return fallback;
}
