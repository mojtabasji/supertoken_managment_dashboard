import { NextRequest } from "next/server";

import { enforceSameOriginMutation, requireApiAdmin } from "@/lib/auth/guard";
import { recordAuditEvent } from "@/lib/audit/audit";
import { jsonError, jsonOk } from "@/lib/http/api";
import { classifyCoreError, getUserDetail, revokeAllSessions } from "@/lib/supertokens/users";
import { validateUserId } from "@/lib/validation/params";
import type { RevokeSessionsResponseDto } from "@/types/api";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ userId: string }> };

/**
 * Revokes all database-backed sessions for a user. The user can sign in again.
 * Security-sensitive, therefore audited; note that a database-backed session
 * revocation does not necessarily invalidate an already-issued stateless
 * access token immediately in every configuration (see DOCUMENT.md).
 */
export async function POST(request: NextRequest, context: RouteContext): Promise<Response> {
  const guard = await requireApiAdmin();
  if ("response" in guard) {
    return guard.response;
  }
  const adminEmail = guard.admin.email;

  const originRejection = enforceSameOriginMutation(request);
  if (originRejection !== null) {
    return originRejection;
  }

  const { userId: rawUserId } = await context.params;
  const userIdResult = validateUserId(rawUserId);
  if (!userIdResult.ok) {
    return jsonError("invalid_request", userIdResult.message, 400);
  }
  const userId = userIdResult.value;

  try {
    const existing = await getUserDetail(userId);
    if (existing === null) {
      recordAuditEvent({
        adminEmail,
        action: "users.revoke_sessions",
        targetUserId: userId,
        status: "failure",
        reason: "not_found",
      });
      return jsonError("not_found", "User not found.", 404);
    }

    const revokedSessionCount = await revokeAllSessions(userId);
    recordAuditEvent({
      adminEmail,
      action: "users.revoke_sessions",
      targetUserId: userId,
      status: "success",
    });
    return jsonOk<RevokeSessionsResponseDto>({ revokedSessionCount });
  } catch (err) {
    const category = classifyCoreError(err);
    recordAuditEvent({
      adminEmail,
      action: "users.revoke_sessions",
      targetUserId: userId,
      status: "failure",
      reason: category,
    });
    return jsonError("core_unavailable", `Session revocation failed: SuperTokens Core unavailable (${category}).`, 502);
  }
}
