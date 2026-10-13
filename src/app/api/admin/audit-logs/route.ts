import { NextRequest } from "next/server";

import { requireApiAdmin } from "@/lib/auth/guard";
import { jsonError, jsonOk } from "@/lib/http/api";
import { listAuditEvents } from "@/lib/audit/audit";
import { validateAuditQuery } from "@/lib/validation/params";
import type { AuditLogListDto } from "@/types/api";

export const runtime = "nodejs";

/**
 * Audit trail for authorized administrators, newest first, with id-based
 * cursor pagination. Access is restricted to the admin allowlist; the audit
 * database itself is never exposed directly.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const guard = await requireApiAdmin();
  if ("response" in guard) {
    return guard.response;
  }

  const { searchParams } = new URL(request.url);
  const queryResult = validateAuditQuery(searchParams.get("limit"), searchParams.get("beforeId"));
  if (!queryResult.ok) {
    return jsonError("invalid_request", queryResult.message, 400);
  }

  const { events, nextBeforeId } = listAuditEvents(queryResult.value);
  return jsonOk<AuditLogListDto>({ events, nextBeforeId });
}
