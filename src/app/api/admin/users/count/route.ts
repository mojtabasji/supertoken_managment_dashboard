import { requireApiAdmin } from "@/lib/auth/guard";
import { jsonError, jsonOk } from "@/lib/http/api";
import { classifyCoreError, getUserCounts } from "@/lib/supertokens/users";
import type { UserCountsDto } from "@/types/api";

export const runtime = "nodejs";

/**
 * Total and per-recipe user counts for the overview page.
 *
 * Kept separate from `/api/admin/health` so connectivity probes never query
 * user data. Loaded on demand by the page that displays the numbers.
 */
export async function GET(): Promise<Response> {
  const guard = await requireApiAdmin();
  if ("response" in guard) {
    return guard.response;
  }

  try {
    const counts = await getUserCounts();
    return jsonOk<UserCountsDto>(counts);
  } catch (err) {
    return jsonError(
      "core_unavailable",
      `User counts failed: SuperTokens Core unavailable (${classifyCoreError(err)}).`,
      502,
    );
  }
}
