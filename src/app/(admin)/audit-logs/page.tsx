"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { EmptyState, ErrorState, SkeletonRows } from "@/components/feedback/States";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { apiGet, errorMessageFor, handleAuthError } from "@/lib/client/api";
import { formatDateTime } from "@/lib/format";
import type { AuditEventDto, AuditLogListDto } from "@/types/api";

type AuditState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; data: AuditLogListDto };

export default function AuditLogsPage(): React.ReactElement {
  const [state, setState] = useState<AuditState>({ kind: "loading" });

  // Cursor stack for id-based pagination; index 0 = newest page.
  const [cursorStack, setCursorStack] = useState<Array<number | undefined>>([undefined]);
  const [busy, setBusy] = useState(false);

  const load = useCallback((beforeId: number | undefined) => {
    const params = new URLSearchParams({ limit: "50" });
    if (beforeId !== undefined) {
      params.set("beforeId", String(beforeId));
    }
    void (async () => {
      try {
        const data = await apiGet<AuditLogListDto>(`/api/admin/audit-logs?${params.toString()}`);
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
  }, []);

  useEffect(() => {
    if (cursorStack.length === 0) {
      return;
    }
    void load(cursorStack[0]);
    
  }, [cursorStack, load]);

  const current = state.kind === "ready" ? state.data : null;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Audit log</h1>
        <p className="text-sm text-slate-500">
          Sign-ins and sensitive administrative actions. No credentials, tokens, or metadata values are recorded.
        </p>
      </div>

      {state.kind === "loading" && <SkeletonRows rows={8} columns={5} />}

      {state.kind === "error" && (
        <ErrorState
          message={state.message}
          onRetry={() => {
            setBusy(true);
            if (cursorStack.length > 0) {
              void load(cursorStack[cursorStack.length - 1]);
            }
          }}
        />
      )}

      {state.kind === "ready" && state.data.events.length === 0 && (
        <EmptyState title="No audit events yet" hint="Sensitive actions will appear here as they happen." />
      )}

      {current !== null && current.events.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="px-4 py-3">Time</th>
                <th scope="col" className="px-4 py-3">Administrator</th>
                <th scope="col" className="px-4 py-3">Action</th>
                <th scope="col" className="px-4 py-3">Target user</th>
                <th scope="col" className="px-4 py-3">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {current.events.map((event: AuditEventDto) => (
                <tr key={event.id} className="hover:bg-slate-50">
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDateTime(event.createdAt)}</td>
                  <td className="px-4 py-3 text-slate-700">{event.adminEmail}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-800">{event.action}</td>
                  <td className="px-4 py-3">
                    {event.targetUserId === null ? (
                      <span className="text-slate-400">—</span>
                    ) : (
                      <Link
                        href={`/users/${encodeURIComponent(event.targetUserId)}`}
                        className="block max-w-[12rem] truncate font-mono text-xs text-indigo-600 hover:underline"
                        title={event.targetUserId}
                      >
                        {event.targetUserId}
                      </Link>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <StatusBadge
                        label={event.status === "success" ? "Success" : "Failure"}
                        tone={event.status === "success" ? "success" : "danger"}
                      />
                      {event.reason !== null && <span className="text-xs text-slate-500">{event.reason}</span>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {current !== null && (
        <div className="flex justify-between">
          <button
            type="button"
            onClick={() => {
              const nextStack = cursorStack.slice(0, -1);
              setCursorStack(nextStack);
              setBusy(true);
              if (nextStack.length > 0) {
                void load(nextStack[nextStack.length - 1]);
              }
            }}
            disabled={cursorStack.length === 1 || busy}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            ← Newer
          </button>
          <button
            type="button"
            onClick={() => {
              if (current.nextBeforeId === null) {
                return;
              }
              const nextStack = [...cursorStack, current.nextBeforeId];
              setCursorStack(nextStack);
              setBusy(true);
              void load(current.nextBeforeId);
            }}
            disabled={current.nextBeforeId === null || busy}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Older →
          </button>
        </div>
      )}
    </div>
  );
}
