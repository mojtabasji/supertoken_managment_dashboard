import { requireApiAdmin } from "@/lib/auth/guard";
import { jsonOk } from "@/lib/http/api";
import { getCoreHealth } from "@/lib/supertokens/users";
import type { CoreHealthDto } from "@/types/api";

export const runtime = "nodejs";

/**
 * Core connectivity and counts for the overview page. Returns only sanitized
 * categories on failure — never raw SDK errors or configuration.
 */
export async function GET(): Promise<Response> {
  const guard = await requireApiAdmin();
  if ("response" in guard) {
    return guard.response;
  }

  const health = await getCoreHealth();
  return jsonOk<CoreHealthDto>(health);
}
