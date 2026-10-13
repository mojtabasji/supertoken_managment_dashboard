/**
 * Shared API types used by both server route handlers and client pages.
 * This module must stay free of server-only imports.
 */

export type ApiErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "invalid_request"
  | "rate_limited"
  | "core_unavailable"
  | "conflict"
  | "internal_error";

export type ApiSuccess<T> = { ok: true; data: T };

export type ApiFailure = {
  ok: false;
  error: { code: ApiErrorCode; message: string };
};

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export type RecipeId = "emailpassword" | "thirdparty" | "passwordless";

export type AdminUserSummaryDto = {
  userId: string;
  recipeId: string;
  timeJoined: number | null;
  emails: string[];
  phones: string[];
};

export type UserAccountDto = {
  recipeId: string;
  /** Third-party provider id (e.g. "google"), when the account is third-party. */
  providerId?: string;
  email?: string;
  phoneNumber?: string;
};

export type AdminUserDetailDto = {
  userId: string;
  timeJoined: number | null;
  accounts: UserAccountDto[];
  /**
   * Email verification state for the user's primary email, when the user has an
   * email. `null` when the emailverification recipe cannot answer for this user.
   */
  emailVerified: boolean | null;
  /** User metadata as stored by the SuperTokens usermetadata recipe. */
  metadata: Record<string, unknown> | null;
  /** Number of currently active (non-revoked) sessions. */
  activeSessionCount: number | null;
};

export type UserListDto = {
  users: AdminUserSummaryDto[];
  /** Opaque Core pagination token for the next page; null when exhausted. */
  nextPaginationToken: string | null;
  /** True when the list came from an exact-match search rather than pagination. */
  isSearchResult: boolean;
};

export type CoreHealthDto = {
  reachable: boolean;
  /** Total user count across recipes; only present when reachable. */
  userCount?: number;
  /** Per-recipe user counts; only present when reachable. */
  recipeCounts?: Record<string, number>;
  latencyMs?: number;
  /** Sanitized failure category — never contains secrets or raw SDK errors. */
  errorCategory?: "timeout" | "unauthorized" | "unreachable";
};

export type OverviewDto = {
  core: CoreHealthDto;
  recentUsers: AdminUserSummaryDto[];
};

export type AuditEventDto = {
  id: number;
  adminEmail: string;
  action: string;
  targetUserId: string | null;
  status: "success" | "failure";
  reason: string | null;
  createdAt: string;
};

export type AuditLogListDto = {
  events: AuditEventDto[];
  /** Pass as `beforeId` to fetch the next (older) page; null when exhausted. */
  nextBeforeId: number | null;
};

export type LoginRequestDto = { email: string; password: string };
export type LoginResponseDto = { email: string };

export type MetadataPatchRequestDto = { metadata: Record<string, unknown> };
export type RevokeSessionsResponseDto = { revokedSessionCount: number };
export type DeleteUserResponseDto = { deleted: true; userId: string };
