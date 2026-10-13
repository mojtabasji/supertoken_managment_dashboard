import { NextRequest } from "next/server";

import { enforceSameOriginMutation, requireApiAdmin } from "@/lib/auth/guard";
import { recordAuditEvent } from "@/lib/audit/audit";
import { jsonError, jsonOk, readJsonBody } from "@/lib/http/api";
import { classifyCoreError, getUserDetail, updateMetadata } from "@/lib/supertokens/users";
import { validateMetadataPatch, validateUserId } from "@/lib/validation/params";
import type { MetadataPatchRequestDto } from "@/types/api";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ userId: string }> };
type MetadataResponseDto = { metadata: Record<string, unknown> };

/**
 * Updates user metadata via the usermetadata recipe. The Core deep-merges the
 * patch into existing metadata (keys absent from the patch are preserved).
 * Only the key names — never values — are summarized for auditing.
 */
export async function PATCH(request: NextRequest, context: RouteContext): Promise<Response> {
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

  const parsedBody = await readJsonBody<MetadataPatchRequestDto>(request);
  if (!parsedBody.ok) {
    return jsonError("invalid_request", "A JSON body is required.", 400);
  }
  const patchResult = validateMetadataPatch(parsedBody.body?.metadata);
  if (!patchResult.ok) {
    return jsonError("invalid_request", patchResult.message, 400);
  }

  try {
    // Existence check first: metadata is an independent Core store and would
    // otherwise happily create entries for unknown user ids.
    const existing = await getUserDetail(userId);
    if (existing === null) {
      recordAuditEvent({
        adminEmail,
        action: "users.update_metadata",
        targetUserId: userId,
        status: "failure",
        reason: "not_found",
      });
      return jsonError("not_found", "User not found.", 404);
    }

    const metadata = await updateMetadata(userId, patchResult.value as Record<string, unknown> as Parameters<typeof updateMetadata>[1]);
    recordAuditEvent({
      adminEmail,
      action: "users.update_metadata",
      targetUserId: userId,
      status: "success",
      reason: `keys_${Object.keys(patchResult.value).length}`,
    });
    return jsonOk<MetadataResponseDto>({ metadata });
  } catch (err) {
    const category = classifyCoreError(err);
    recordAuditEvent({
      adminEmail,
      action: "users.update_metadata",
      targetUserId: userId,
      status: "failure",
      reason: category,
    });
    return jsonError(
      "core_unavailable",
      `Metadata update failed: SuperTokens Core unavailable (${category}).`,
      502,
    );
  }
}
