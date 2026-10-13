"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";

import { EmptyState, ErrorState, SkeletonRows } from "@/components/feedback/States";
import { RecipeBadge } from "@/components/feedback/StatusBadge";
import { PaginationControls } from "@/components/users/PaginationControls";
import { apiGet, errorMessageFor, handleAuthError } from "@/lib/client/api";
import { formatDateTime } from "@/lib/format";
import type { UserListDto } from "@/types/api";

type UsersState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; data: UserListDto };

export default function UsersPage(): React.ReactElement {
  const [state, setState] = useState<UsersState>({ kind: "loading" });
  const [searchInput, setSearchInput] = useState("");
  const [activeQuery, setActiveQuery] = useState<string | null>(null);

  // Stack of Core pagination tokens; index 0 is the first page (no token).
  const [tokenStack, setTokenStack] = useState<Array<string | undefined>>([undefined]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    (paginationToken: string | undefined, query: string | null) => {
      const params = new URLSearchParams({ limit: "20" });
      if (paginationToken !== undefined) {
        params.set("paginationToken", paginationToken);
      }
      if (query !== null) {
        params.set("q", query);
      }
      void (async () => {
        try {
          const data = await apiGet<UserListDto>(`/api/admin/users?${params.toString()}`);
          setState({ kind: "ready", data });
        } catch (error) {
          if (handleAuthError(error)) {
            return;
          }
          setState({ kind: "error", message: errorMessageFor(error) });
        } finally {
          setBusy(false);
        }
      })();
    },
    [],
  );

  useEffect(() => {
    load(tokenStack[0], activeQuery);
  }, [load, tokenStack, activeQuery]);

  function handleSearch(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const query = searchInput.trim();
    const nextQuery = query.length > 0 ? query : null;
    setActiveQuery(nextQuery);
    setTokenStack([undefined]);
    setBusy(true);
    load(undefined, nextQuery);
  }

  function goToPage(token: string | undefined, stack: Array<string | undefined>): void {
    setTokenStack(stack);
    setBusy(true);
    load(token, activeQuery);
  }

  const current = state.kind === "ready" ? state.data : null;
  const isFirstPage = tokenStack.length === 1;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Users</h1>
          <p className="text-sm text-slate-500">
            {activeQuery !== null
              ? "Exact-match search by user ID, email, or phone number."
              : "All users known to the SuperTokens Core."}
          </p>
        </div>
      </div>

      <form onSubmit={handleSearch} role="search" className="flex gap-2">
        <label htmlFor="user-search" className="sr-only">
          Search users
        </label>
        <input
          id="user-search"
          type="search"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="Search by user ID, email, or phone"
          className="w-full max-w-md rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          Search
        </button>
        {activeQuery !== null && (
          <button
            type="button"
            onClick={() => {
              setSearchInput("");
              setActiveQuery(null);
              setTokenStack([undefined]);
              setBusy(true);
              load(undefined, null);
            }}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Clear
          </button>
        )}
      </form>

      {state.kind === "loading" && <SkeletonRows rows={6} columns={4} />}

      {state.kind === "error" && (
        <ErrorState
          message={state.message}
          onRetry={() => {
            setBusy(true);
            load(tokenStack[tokenStack.length - 1], activeQuery);
          }}
        />
      )}

      {state.kind === "ready" && state.data.users.length === 0 && activeQuery !== null && (
        <EmptyState title={`No users match “${activeQuery}”`} hint="Search is exact-match on user ID, email, or phone." />
      )}

      {state.kind === "ready" && state.data.users.length === 0 && activeQuery === null && (
        <EmptyState title="No users found" hint="The SuperTokens Core reported zero users." />
      )}

      {current !== null && current.users.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="px-4 py-3">User</th>
                <th scope="col" className="px-4 py-3">Email</th>
                <th scope="col" className="px-4 py-3">Phone</th>
                <th scope="col" className="px-4 py-3">Method</th>
                <th scope="col" className="px-4 py-3">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {current.users.map((user) => (
                <tr key={`${user.recipeId}:${user.userId}`} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/users/${encodeURIComponent(user.userId)}`}
                      className="block max-w-[14rem] truncate font-mono text-xs text-indigo-600 hover:underline"
                      title={user.userId}
                    >
                      {user.userId}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {user.emails.length > 0 ? user.emails.join(", ") : "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {user.phones.length > 0 ? user.phones.join(", ") : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <RecipeBadge recipeId={user.recipeId} />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-slate-600">{formatDateTime(user.timeJoined)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {current !== null && current.users.length > 0 && !current.isSearchResult && (
        <PaginationControls
          hasPrev={!isFirstPage}
          hasNext={current.nextPaginationToken !== null}
          busy={busy}
          onPrev={() => {
            const nextStack = tokenStack.slice(0, -1);
            goToPage(nextStack[nextStack.length - 1], nextStack);
          }}
          onNext={() =>
            current.nextPaginationToken !== null &&
            goToPage(current.nextPaginationToken, [...tokenStack, current.nextPaginationToken])
          }
        />
      )}
    </div>
  );
}
