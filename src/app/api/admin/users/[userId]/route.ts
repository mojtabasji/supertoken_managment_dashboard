import { NextRequest } from "next/server";

import { enforceSameOriginMutation, requireApiAdmin } from "@/lib/auth/guard";
import { recordAuditEvent } from "@/lib/audit/audit";
import { jsonError, jsonOk } from "@/lib/http/api";
import { classifyCoreError, deleteUser, getUserDetail } from "@/lib/supertokens/users";
import { validateUserId } from "@/lib/validation/params";
import type { AdminUserDetailDto, DeleteUserResponseDto } from "@/types/api";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ userId: string }> };

export async function GET(_request: NextRequest, context: RouteContext): Promise<Response> {
  const guard = await requireApiAdmin();
  if ("response" in guard) {
    return guard.response;
  }

  const { userId: rawUserId } = await context.params;
  const userIdResult = validateUserId(rawUserId);
  if (!userIdResult.ok) {
    return jsonError("invalid_request", userIdResult.message, 400);
  }

  try {
    const detail = await getUserDetail(userIdResult.value);
    if (detail === null) {
      return jsonError("not_found", "User not found.", 404);
    }
    return jsonOk<AdminUserDetailDto>(detail);
  } catch (err) {
    return jsonError("core_unavailable", `SuperTokens Core unavailable (${classifyCoreError(err)}).`, 502);
  }
}

/**
 * Deletes a SuperTokens user. Irreversible, therefore:
 * - requires the `X-Confirm-Delete` header to equal the target userId
 *   (server-side confirmation; also defeats accidental double-submits),
 * - verifies the user exists first (no silent no-op),
 * - is audited on success and failure.
 *
 * Note: deleting SuperTokens sessions does not necessarily invalidate an
 * already-issued stateless access token immediately in every configuration —
 * see DOCUMENT.md.
 */
export async function DELETE(request: NextRequest, context: RouteContext): Promise<Response> {
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

  const confirmation = request.headers.get("x-confirm-delete");
  if (confirmation !== userId) {
    recordAuditEvent({
      adminEmail,
      action: "users.delete",
      targetUserId: userId,
      status: "failure",
      reason: "confirmation_mismatch",
    });
    return jsonError(
      "invalid_request",
      "Confirmation required: the X-Confirm-Delete header must contain the exact userId.",
      400,
    );
  }

  try {
    const existing = await getUserDetail(userId);
    if (existing === null) {
      recordAuditEvent({
        adminEmail,
        action: "users.delete",
        targetUserId: userId,
        status: "failure",
        reason: "not_found",
      });
      return jsonError("not_found", "User not found.", 404);
    }

    await deleteUser(userId);
    recordAuditEvent({ adminEmail, action: "users.delete", targetUserId: userId, status: "success" });
    return jsonOk<DeleteUserResponseDto>({ deleted: true, userId });
  } catch (err) {
    const category = classifyCoreError(err);
    recordAuditEvent({
      adminEmail,
      action: "users.delete",
      targetUserId: userId,
      status: "failure",
      reason: category,
    });
    return jsonError("core_unavailable", `Delete failed: SuperTokens Core unavailable (${category}).`, 502);
  }
}
