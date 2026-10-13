import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

import { getEnv } from "@/lib/config/env";
import { jsonError } from "@/lib/http/api";

import { SESSION_COOKIE_NAME, verifySessionToken } from "./session";

/**
 * Server-side authorization for every protected page and API endpoint.
 * Deny by default: no valid, allowlisted session means no access. Hiding UI
 * controls is never treated as authorization.
 */

export type AdminPrincipal = { email: string };

export async function getAdminPrincipal(): Promise<AdminPrincipal | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (token === undefined || token.length === 0) {
    return null;
  }
  const payload = verifySessionToken(token);
  if (payload === null) {
    return null;
  }
  // The allowlist is re-checked on every request so removing an address from
  // ADMIN_EMAILS revokes their access immediately, even mid-session.
  const email = payload.sub.toLowerCase();
  if (!getEnv().adminEmails.includes(email)) {
    return null;
  }
  return { email };
}

export type ApiGuardResult = { admin: AdminPrincipal } | { response: NextResponse };

/** API route guard: returns a 401 response instead of throwing. */
export async function requireApiAdmin(): Promise<ApiGuardResult> {
  const admin = await getAdminPrincipal();
  if (admin === null) {
    return {
      response: jsonError("unauthorized", "Authentication required.", 401),
    };
  }
  return { admin };
}

/**
 * CSRF protection for state-changing requests: the session cookie is
 * SameSite=Lax, and browsers always attach an `Origin` header to cross-origin
 * and same-origin mutation requests, so a mutation without a matching Origin
 * is rejected.
 */
export function isSameOriginMutation(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (origin === null) {
    return false;
  }
  try {
    return new URL(origin).origin === new URL(getEnv().appBaseUrl).origin;
  } catch {
    return false;
  }
}

/** Returns a 403 response when the Origin header is missing or foreign. */
export function enforceSameOriginMutation(request: NextRequest): NextResponse | null {
  if (isSameOriginMutation(request)) {
    return null;
  }
  return jsonError("forbidden", "Cross-origin request rejected.", 403);
}
