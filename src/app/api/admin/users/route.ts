import { NextRequest } from "next/server";

import { requireApiAdmin } from "@/lib/auth/guard";
import { jsonError, jsonOk } from "@/lib/http/api";
import { classifyCoreError, lookupUsers, listUsers } from "@/lib/supertokens/users";
import { validateLimit, validateOrder, validatePaginationToken, validateSearchQuery } from "@/lib/validation/params";
import type { UserListDto } from "@/types/api";

export const runtime = "nodejs";

/**
 * Paginated user listing, or exact-match search when `q` is provided.
 * Pagination is delegated to the Core's opaque tokens — users are never loaded
 * wholesale into memory.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const guard = await requireApiAdmin();
  if ("response" in guard) {
    return guard.response;
  }

  const { searchParams } = new URL(request.url);

  const searchResult = validateSearchQuery(searchParams.get("q"));
  if (!searchResult.ok) {
    return jsonError("invalid_request", searchResult.message, 400);
  }

  if (searchResult.value !== undefined) {
    try {
      const users = await lookupUsers({ query: searchResult.value });
      return jsonOk<UserListDto>({ users, nextPaginationToken: null, isSearchResult: true });
    } catch (err) {
      return jsonError(
        "core_unavailable",
        `User search failed: SuperTokens Core unavailable (${classifyCoreError(err)}).`,
        502,
      );
    }
  }

  const limitResult = validateLimit(searchParams.get("limit"));
  if (!limitResult.ok) {
    return jsonError("invalid_request", limitResult.message, 400);
  }
  const tokenResult = validatePaginationToken(searchParams.get("paginationToken"));
  if (!tokenResult.ok) {
    return jsonError("invalid_request", tokenResult.message, 400);
  }
  const orderResult = validateOrder(searchParams.get("order"));
  if (!orderResult.ok) {
    return jsonError("invalid_request", orderResult.message, 400);
  }

  try {
    const result = await listUsers({
      limit: limitResult.value,
      paginationToken: tokenResult.value,
      order: orderResult.value,
    });
    return jsonOk<UserListDto>({
      users: result.users,
      nextPaginationToken: result.nextPaginationToken ?? null,
      isSearchResult: false,
    });
  } catch (err) {
    return jsonError(
      "core_unavailable",
      `User listing failed: SuperTokens Core unavailable (${classifyCoreError(err)}).`,
      502,
    );
  }
}
