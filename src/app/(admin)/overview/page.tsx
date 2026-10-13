"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Card, EmptyState, ErrorState, SkeletonRows, Spinner } from "@/components/feedback/States";
import { RecipeBadge, StatusBadge } from "@/components/feedback/StatusBadge";
import { errorMessageFor, handleAuthError, apiGet } from "@/lib/client/api";
import { formatDateTime } from "@/lib/format";
import type { AdminUserSummaryDto, CoreHealthDto, UserListDto } from "@/types/api";

type OverviewState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; core: CoreHealthDto; recentUsers: AdminUserSummaryDto[] };

export default function OverviewPage(): React.ReactElement {
  const [state, setState] = useState<OverviewState>({ kind: "loading" });

  const load = useCallback(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [core, recent] = await Promise.all([
          apiGet<CoreHealthDto>("/api/admin/health"),
          apiGet<UserListDto>("/api/admin/users?limit=5&order=DESC"),
        ]);
        if (!cancelled) {
          setState({ kind: "ready", core, recentUsers: recent.users });
        }
      } catch (error) {
        if (handleAuthError(error) || cancelled) {
          return;
        }
        setState({ kind: "error", message: errorMessageFor(error) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancel = false;
    void (async () => {
      try {
        const [core, recent] = await Promise.all([
          apiGet<CoreHealthDto>("/api/admin/health"),
          apiGet<UserListDto>("/api/admin/users?limit=5&order=DESC"),
        ]);
        if (!cancel) {
          setState({ kind: "ready", core, recentUsers: recent.users });
        }
      } catch (error) {
        if (handleAuthError(error) || cancel) {
          return;
        }
        setState({ kind: "error", message: errorMessageFor(error) });
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Overview</h1>
        <p className="text-sm text-slate-500">SuperTokens Core connectivity and recent activity.</p>
      </div>

      {state.kind === "loading" && (
        <div className="space-y-4">
          <SkeletonRows rows={2} columns={2} />
          <Card title="Recent users">
            <SkeletonRows rows={4} columns={3} />
          </Card>
        </div>
      )}

      {state.kind === "error" && <ErrorState message={state.message} onRetry={load} />}

      {state.kind === "ready" && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Card title="Core connection">
              {state.core.reachable ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <StatusBadge label="Connected" tone="success" />
                    {typeof state.core.latencyMs === "number" && (
                      <span className="text-xs text-slate-500">{state.core.latencyMs} ms</span>
                    )}
                  </div>
                  <dl className="grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded-md bg-slate-50 px-3 py-2">
                      <dt className="text-xs text-slate-500">Total users</dt>
                      <dd className="font-semibold text-slate-900">{state.core.userCount ?? "—"}</dd>
                    </div>
                    {Object.entries(state.core.recipeCounts ?? {}).map(([recipeId, count]) => (
                      <div key={recipeId} className="rounded-md bg-slate-50 px-3 py-2">
                        <dt className="text-xs text-slate-500">
                          <RecipeBadge recipeId={recipeId} />
                        </dt>
                        <dd className="mt-1 font-semibold text-slate-900">{count}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ) : (
                <div className="space-y-3">
                  <StatusBadge label="Unavailable" tone="danger" />
                  <p className="text-sm text-slate-600">
                    The portal cannot reach the SuperTokens Core
                    {state.core.errorCategory !== undefined ? ` (${state.core.errorCategory})` : ""}. User data shown
                    elsewhere may be stale.
                  </p>
                  <button
                    onClick={load}
                    className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Retry
                  </button>
                </div>
              )}
            </Card>

            <Card
              title="Recent users"
              action={
                <Link href="/users" className="text-sm font-medium text-indigo-600 hover:text-indigo-700">
                  View all →
                </Link>
              }
            >
              {state.recentUsers.length === 0 ? (
                <EmptyState title="No users yet" />
              ) : (
                <ul className="divide-y divide-slate-100">
                  {state.recentUsers.map((user) => (
                    <li key={`${user.recipeId}:${user.userId}`}>
                      <Link
                        href={`/users/${encodeURIComponent(user.userId)}`}
                        className="flex items-center justify-between gap-3 py-2 hover:bg-slate-50"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-slate-900">
                            {user.emails[0] ?? user.phones[0] ?? "No email or phone"}
                          </span>
                          <span className="block truncate font-mono text-xs text-slate-500">{user.userId}</span>
                        </span>
                        <span className="flex-none text-xs text-slate-500">{formatDateTime(user.timeJoined)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}

      {state.kind === "ready" && state.core.reachable === false && (
        <p className="sr-only">
          <Spinner label="Retrying Core connection" />
        </p>
      )}
    </div>
  );
}
