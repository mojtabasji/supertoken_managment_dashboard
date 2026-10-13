import { NextRequest } from "next/server";

import { enforceSameOriginMutation, requireApiAdmin } from "@/lib/auth/guard";
import { buildClearSessionCookie } from "@/lib/auth/session";
import { recordAuditEvent } from "@/lib/audit/audit";
import { jsonOk } from "@/lib/http/api";

export const runtime = "nodejs";

type LogoutResponseDto = { loggedOut: true };

/**
 * Administrator sign-out: clears the session cookie and records an audit
 * event. Idempotent — succeeds even without a valid session (the cookie is
 * cleared regardless).
 */
export async function POST(request: NextRequest): Promise<Response> {
  const guard = await requireApiAdmin();
  if ("response" in guard) {
    return jsonOk<LogoutResponseDto>({ loggedOut: true }, {
      headers: { "Set-Cookie": buildClearSessionCookie() },
    });
  }

  const originRejection = enforceSameOriginMutation(request);
  if (originRejection !== null) {
    return originRejection;
  }

  recordAuditEvent({ adminEmail: guard.admin.email, action: "logout", status: "success" });
  return jsonOk<LogoutResponseDto>({ loggedOut: true }, {
    headers: { "Set-Cookie": buildClearSessionCookie() },
  });
}
