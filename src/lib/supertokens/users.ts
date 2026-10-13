import "server-only";

import {
  deleteUser as coreDeleteUser,
  getUserCount,
  getUsersNewestFirst,
  getUsersOldestFirst,
} from "supertokens-node";
import EmailPassword from "supertokens-node/recipe/emailpassword";
import Passwordless from "supertokens-node/recipe/passwordless";
import Session from "supertokens-node/recipe/session";
import ThirdParty from "supertokens-node/recipe/thirdparty";
import EmailVerification from "supertokens-node/recipe/emailverification";
import UserMetadata from "supertokens-node/recipe/usermetadata";

import type {
  AdminUserDetailDto,
  AdminUserSummaryDto,
  CoreHealthDto,
  RecipeId,
  UserAccountDto,
} from "@/types/api";

import { initSuperTokens } from "./client";

/**
 * User-management service layer for supertokens-node@9.2.3.
 *
 * Every function talks to the existing SuperTokens Core through the official
 * SDK — never the database. All methods are server-only.
 *
 * API notes (verified against the installed package's typings):
 * - Listing/pagination: `getUsersOldestFirst` / `getUsersNewestFirst` with
 *   `paginationToken` (this SDK version has no `listUsersByPagination` and no
 *   server-side free-text search — exact-match lookups are used instead).
 * - `deleteUser(userId)`, `getUserCount(includeRecipeIds?)`.
 * - Per-recipe lookups: EmailPassword/ThirdParty `getUserById(userId)`,
 *   Passwordless `getUserById({ userId })`.
 * - Sessions: `Session.revokeAllSessionsForUser` / `getAllSessionHandlesForUser`.
 * - Metadata: `UserMetadata.getUserMetadata` / `updateUserMetadata` (Core
 *   deep-merges the patch into existing metadata).
 * - Email verification: `EmailPassword.isEmailVerified(userId)` answers for any
 *   recipe's user id via the emailverification recipe.
 */

const CORE_CALL_TIMEOUT_MS = 8000;

class CoreTimeoutError extends Error {
  constructor() {
    super("SuperTokens Core did not respond in time.");
    this.name = "CoreTimeoutError";
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new CoreTimeoutError()), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  });
}

/**
 * Shapes of raw recipe user objects returned by Core 9.x-era SDKs.
 */
type CoreRecipeUser = {
  id: string;
  timeJoined?: number;
  email?: string;
  phoneNumber?: string;
  thirdParty?: { id: string; userId: string };
};

/**
 * Core's user listing may return either a per-recipe user object (fields at
 * the top level, `recipeId` on the row) or a multi-recipe user object
 * (`emailPassword` / `thirdParty` / `passwordless` properties). The SDK types
 * this payload as `any`, so the mapper tolerates both shapes; the shapes were
 * derived from the recipe `types.d.ts` files in the installed package.
 */
type CoreListedUser = CoreRecipeUser & {
  emailPassword?: CoreRecipeUser;
  thirdParty?: CoreRecipeUser;
  passwordless?: CoreRecipeUser;
};

function summarizeRow(row: { recipeId: string; user: unknown }): AdminUserSummaryDto {
  const user = row.user as CoreListedUser;
  const emails: string[] = [];
  const phones: string[] = [];
  let timeJoined: number | null = null;

  const collect = (candidate: CoreRecipeUser | undefined): void => {
    if (candidate === undefined) {
      return;
    }
    if (typeof candidate.email === "string" && candidate.email.length > 0 && !emails.includes(candidate.email)) {
      emails.push(candidate.email);
    }
    if (
      typeof candidate.phoneNumber === "string" &&
      candidate.phoneNumber.length > 0 &&
      !phones.includes(candidate.phoneNumber)
    ) {
      phones.push(candidate.phoneNumber);
    }
    if (timeJoined === null && typeof candidate.timeJoined === "number") {
      timeJoined = candidate.timeJoined;
    }
  };

  collect(user.emailPassword);
  collect(user.thirdParty);
  collect(user.passwordless);
  // Single-recipe shape: the row user carries the fields itself.
  collect(user);

  return {
    userId: user.id,
    recipeId: row.recipeId,
    timeJoined,
    emails,
    phones,
  };
}

export type ListUsersParams = {
  limit: number;
  paginationToken?: string;
  order: "ASC" | "DESC";
};

export type ListUsersResult = {
  users: AdminUserSummaryDto[];
  nextPaginationToken: string | undefined;
};

export async function listUsers(params: ListUsersParams): Promise<ListUsersResult> {
  initSuperTokens();
  const input = {
    limit: params.limit,
    paginationToken: params.paginationToken,
  };
  const result = await withTimeout(
    params.order === "DESC" ? getUsersNewestFirst(input) : getUsersOldestFirst(input),
    CORE_CALL_TIMEOUT_MS,
  );
  return {
    users: result.users.map(summarizeRow),
    nextPaginationToken: result.nextPaginationToken,
  };
}

export async function getUserCounts(): Promise<{ total: number; byRecipe: Record<string, number> }> {
  initSuperTokens();
  const recipeIds: RecipeId[] = ["emailpassword", "thirdparty", "passwordless"];
  const [total, ...perRecipe] = await withTimeout(
    Promise.all([getUserCount(), ...recipeIds.map((id) => getUserCount([id]))]),
    CORE_CALL_TIMEOUT_MS,
  );
  const byRecipe: Record<string, number> = {};
  recipeIds.forEach((id, index) => {
    byRecipe[id] = perRecipe[index];
  });
  return { total, byRecipe };
}

export async function getUserDetail(userId: string): Promise<AdminUserDetailDto | null> {
  initSuperTokens();

  const [emailPasswordUser, thirdPartyUser, passwordlessUser] = await withTimeout(
    Promise.all([
      EmailPassword.getUserById(userId),
      ThirdParty.getUserById(userId),
      Passwordless.getUserById({ userId }),
    ]),
    CORE_CALL_TIMEOUT_MS,
  );

  if (emailPasswordUser === undefined && thirdPartyUser === undefined && passwordlessUser === undefined) {
    return null;
  }

  const accounts: UserAccountDto[] = [];
  let timeJoined: number | null = null;

  const earliestJoin = (candidate: number | undefined): void => {
    if (typeof candidate === "number" && (timeJoined === null || candidate < timeJoined)) {
      timeJoined = candidate;
    }
  };

  if (emailPasswordUser !== undefined) {
    accounts.push({ recipeId: "emailpassword", email: emailPasswordUser.email });
    earliestJoin(emailPasswordUser.timeJoined);
  }
  if (thirdPartyUser !== undefined) {
    accounts.push({
      recipeId: "thirdparty",
      providerId: thirdPartyUser.thirdParty.id,
      email: thirdPartyUser.email,
    });
    earliestJoin(thirdPartyUser.timeJoined);
  }
  if (passwordlessUser !== undefined) {
    accounts.push({
      recipeId: "passwordless",
      email: passwordlessUser.email,
      phoneNumber: passwordlessUser.phoneNumber,
    });
    earliestJoin(passwordlessUser.timeJoined);
  }

  // Email verification only applies when at least one account has an email.
  let emailVerified: boolean | null = null;
  const emailForVerification =
    emailPasswordUser?.email ??
    thirdPartyUser?.email ??
    passwordlessUser?.email;
  if (emailForVerification !== undefined) {
    try {
      emailVerified = await withTimeout(EmailPassword.isEmailVerified(userId), CORE_CALL_TIMEOUT_MS);
    } catch {
      // Verification state unavailable (e.g. no known recipe answers for this
      // user); shown as null rather than failing the whole detail view.
      emailVerified = null;
    }
  }

  // Metadata and session count are supplementary: keep the detail view usable
  // even if these optional lookups fail.
  let metadata: Record<string, unknown> | null = null;
  try {
    const metadataResult = await withTimeout(UserMetadata.getUserMetadata(userId), CORE_CALL_TIMEOUT_MS);
    metadata = metadataResult.metadata as Record<string, unknown>;
  } catch {
    metadata = null;
  }

  let activeSessionCount: number | null = null;
  try {
    const handles = await withTimeout(Session.getAllSessionHandlesForUser(userId), CORE_CALL_TIMEOUT_MS);
    activeSessionCount = handles.length;
  } catch {
    activeSessionCount = null;
  }

  return {
    userId,
    timeJoined,
    accounts,
    emailVerified,
    metadata,
    activeSessionCount,
  };
}

export async function updateMetadata(
  userId: string,
  metadataPatch: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  initSuperTokens();
  const result = await withTimeout(
    UserMetadata.updateUserMetadata(userId, metadataPatch as Record<string, unknown> as Parameters<typeof UserMetadata.updateUserMetadata>[1]),
    CORE_CALL_TIMEOUT_MS,
  );
  return result.metadata as Record<string, unknown>;
}

export async function revokeAllSessions(userId: string): Promise<number> {
  initSuperTokens();
  const revokedHandles = await withTimeout(
    Session.revokeAllSessionsForUser(userId),
    CORE_CALL_TIMEOUT_MS,
  );
  return revokedHandles.length;
}

export async function deleteUser(userId: string): Promise<void> {
  initSuperTokens();
  await withTimeout(coreDeleteUser(userId), CORE_CALL_TIMEOUT_MS);
}

export type LookupQuery = {
  /** Exact-match search over user id, email, or phone number. */
  query: string;
};

/**
 * Exact-match user lookup — the only search this SDK version supports
 * (no server-side fuzzy/partial search exists in 9.2.3). Classification:
 * contains "@" -> email; digits/+ only -> phone; otherwise -> user id.
 */
export async function lookupUsers({ query }: LookupQuery): Promise<AdminUserSummaryDto[]> {
  initSuperTokens();
  const trimmed = query.trim();

  type SummarySeed = { recipeId: string; user: CoreRecipeUser };
  let seeds: SummarySeed[] = [];

  if (trimmed.includes("@")) {
    const [emailPasswordUser, thirdPartyUsers, passwordlessUser] = await withTimeout(
      Promise.all([
        EmailPassword.getUserByEmail(trimmed),
        ThirdParty.getUsersByEmail(trimmed),
        Passwordless.getUserByEmail({ email: trimmed }),
      ]),
      CORE_CALL_TIMEOUT_MS,
    );
    seeds = [
      ...(emailPasswordUser !== undefined
        ? [{ recipeId: "emailpassword", user: emailPasswordUser as CoreRecipeUser }]
        : []),
      ...thirdPartyUsers.map((user) => ({ recipeId: "thirdparty", user: user as CoreRecipeUser })),
      ...(passwordlessUser !== undefined
        ? [{ recipeId: "passwordless", user: passwordlessUser as CoreRecipeUser }]
        : []),
    ];
  } else if (/^\+?[\d\s()\-]{6,25}$/.test(trimmed)) {
    const passwordlessUser = await withTimeout(
      Passwordless.getUserByPhoneNumber({ phoneNumber: trimmed }),
      CORE_CALL_TIMEOUT_MS,
    );
    seeds = passwordlessUser !== undefined
      ? [{ recipeId: "passwordless", user: passwordlessUser as CoreRecipeUser }]
      : [];
  } else {
    const [emailPasswordUser, thirdPartyUser, passwordlessUser] = await withTimeout(
      Promise.all([
        EmailPassword.getUserById(trimmed),
        ThirdParty.getUserById(trimmed),
        Passwordless.getUserById({ userId: trimmed }),
      ]),
      CORE_CALL_TIMEOUT_MS,
    );
    seeds = [
      ...(emailPasswordUser !== undefined
        ? [{ recipeId: "emailpassword", user: emailPasswordUser as CoreRecipeUser }]
        : []),
      ...(thirdPartyUser !== undefined
        ? [{ recipeId: "thirdparty", user: thirdPartyUser as CoreRecipeUser }]
        : []),
      ...(passwordlessUser !== undefined
        ? [{ recipeId: "passwordless", user: passwordlessUser as CoreRecipeUser }]
        : []),
    ];
  }

  // Dedupe: the same SuperTokens user can legitimately appear once per recipe.
  const seen = new Set<string>();
  const summaries: AdminUserSummaryDto[] = [];
  for (const seed of seeds) {
    const key = seed.user.id;
    if (seen.has(key)) {
      const existing = summaries.find((s) => s.userId === key);
      if (existing !== undefined) {
        if (seed.user.email !== undefined && !existing.emails.includes(seed.user.email)) {
          existing.emails.push(seed.user.email);
        }
        if (seed.user.phoneNumber !== undefined && !existing.phones.includes(seed.user.phoneNumber)) {
          existing.phones.push(seed.user.phoneNumber);
        }
      }
      continue;
    }
    seen.add(key);
    summaries.push(summarizeRow({ recipeId: seed.recipeId, user: seed.user }));
  }
  return summaries;
}

export type CoreHealth = CoreHealthDto & { reachable: true } | CoreHealthDto & { reachable: false };

/**
 * Core connectivity probe: resolves counts only when the Core answers.
 * Returns a sanitized failure category instead of raw SDK errors so nothing
 * internal (URLs, keys, stack traces) can reach the client.
 */
export async function getCoreHealth(): Promise<CoreHealth> {
  initSuperTokens();
  const started = Date.now();
  try {
    const { total, byRecipe } = await getUserCounts();
    return {
      reachable: true,
      userCount: total,
      recipeCounts: byRecipe,
      latencyMs: Date.now() - started,
    };
  } catch (err) {
    return {
      reachable: false,
      errorCategory: classifyCoreError(err),
      latencyMs: Date.now() - started,
    };
  }
}

/** Maps SDK/network errors to a small, sanitized category set. */
export function classifyCoreError(err: unknown): "timeout" | "unauthorized" | "unreachable" {
  if (err instanceof CoreTimeoutError) {
    return "timeout";
  }
  const message = err instanceof Error ? err.message : "";
  // The 9.2.x querier surfaces auth failures with status text rather than a
  // typed error; match conservatively on non-secret indicators only.
  if (/\b(401|403)\b|unauthorized|invalid api key/i.test(message)) {
    return "unauthorized";
  }
  return "unreachable";
}

// Suppress the `unused-import` warning on the only-per-type import.
void (EmailVerification as never);
