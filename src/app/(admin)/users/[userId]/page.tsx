"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { Card, ErrorState, SkeletonRows } from "@/components/feedback/States";
import { ConfirmDialog } from "@/components/feedback/ConfirmDialog";
import { RecipeBadge, StatusBadge } from "@/components/feedback/StatusBadge";
import { apiGet, apiSend, errorMessageFor, handleAuthError } from "@/lib/client/api";
import { formatDateTime } from "@/lib/format";
import type { AdminUserDetailDto, DeleteUserResponseDto, RevokeSessionsResponseDto } from "@/types/api";

type DetailState =
  | { kind: "loading" }
  | { kind: "error"; message: string; notFound: boolean }
  | { kind: "ready"; detail: AdminUserDetailDto };

export default function UserDetailPage(): React.ReactElement {
  const params = useParams<{ userId: string }>();
  const userId = params.userId;
  const router = useRouter();

  const [state, setState] = useState<DetailState>({ kind: "loading" });
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showRevokeDialog, setShowRevokeDialog] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const detail = await apiGet<AdminUserDetailDto>(`/api/admin/users/${encodeURIComponent(userId)}`);
        if (!cancelled) {
          setState({ kind: "ready", detail });
        }
      } catch (error) {
        if (handleAuthError(error) || cancelled) {
          return;
        }
        setState({
          kind: "error",
          message: errorMessageFor(error),
          notFound: error instanceof Error && error.message.includes("not found"),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const load = useCallback(() => {
    let cancelled = false;
    void (async () => {
      try {
        const detail = await apiGet<AdminUserDetailDto>(`/api/admin/users/${encodeURIComponent(userId)}`);
        if (!cancelled) {
          setState({ kind: "ready", detail });
        }
      } catch (error) {
        if (handleAuthError(error) || cancelled) {
          return;
        }
        setState({
          kind: "error",
          message: errorMessageFor(error),
          notFound: error instanceof Error && error.message.includes("not found"),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  async function handleRevokeSessions(): Promise<void> {
    const result = await apiSend<RevokeSessionsResponseDto>(
      "POST",
      `/api/admin/users/${encodeURIComponent(userId)}/revoke-sessions`,
    );
    setShowRevokeDialog(false);
    setFlash(`Revoked ${result.revokedSessionCount} session(s).`);
    load();
  }

  async function handleDelete(): Promise<void> {
    await apiSend<DeleteUserResponseDto>("DELETE", `/api/admin/users/${encodeURIComponent(userId)}`, {
      headers: { "X-Confirm-Delete": userId },
    });
    router.push("/users");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Link href="/users" className="text-sm font-medium text-indigo-600 hover:text-indigo-700">
            ← Back to users
          </Link>
          <h1 className="mt-1 truncate text-lg font-semibold text-slate-900" title={userId}>
            User detail
          </h1>
          <p className="mt-0.5 break-all font-mono text-xs text-slate-500">{userId}</p>
        </div>
        {state.kind === "ready" && (
          <button
            onClick={() => setShowDeleteDialog(true)}
            className="flex-none rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
          >
            Delete user
          </button>
        )}
      </div>

      {flash !== null && (
        <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {flash}
        </p>
      )}

      {state.kind === "loading" && <SkeletonRows rows={4} columns={2} />}

      {state.kind === "error" && (
        <ErrorState
          message={state.notFound ? "This user does not exist in the SuperTokens Core." : state.message}
          onRetry={state.notFound ? undefined : load}
        />
      )}

      {state.kind === "ready" && (
        <>
          <Card title="Account">
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-xs text-slate-500">Created</dt>
                <dd className="text-slate-900">{formatDateTime(state.detail.timeJoined)}</dd>
              </div>
              <div>
                <dt className="mb-1 text-xs text-slate-500">Login methods</dt>
                <dd className="space-y-2">
                  {state.detail.accounts.map((account) => (
                    <div
                      key={`${account.recipeId}:${account.providerId ?? account.email ?? account.phoneNumber ?? ""}`}
                      className="flex flex-wrap items-center gap-2 rounded-md bg-slate-50 px-3 py-2"
                    >
                      <RecipeBadge recipeId={account.recipeId} />
                      {account.providerId !== undefined && (
                        <span className="text-xs text-slate-500">provider: {account.providerId}</span>
                      )}
                      {account.email !== undefined && <span className="text-slate-800">{account.email}</span>}
                      {account.phoneNumber !== undefined && (
                        <span className="text-slate-800">{account.phoneNumber}</span>
                      )}
                    </div>
                  ))}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Email verification</dt>
                <dd className="mt-1">
                  {state.detail.emailVerified === null ? (
                    <StatusBadge label="Unknown" tone="neutral" />
                  ) : state.detail.emailVerified ? (
                    <StatusBadge label="Verified" tone="success" />
                  ) : (
                    <StatusBadge label="Not verified" tone="warning" />
                  )}
                </dd>
              </div>
            </dl>
          </Card>

          <Card
            title="Sessions"
            action={
              state.detail.activeSessionCount !== null && state.detail.activeSessionCount > 0 ? (
                <button
                  onClick={() => setShowRevokeDialog(true)}
                  className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-50"
                >
                  Revoke all sessions
                </button>
              ) : undefined
            }
          >
            {state.detail.activeSessionCount === null ? (
              <p className="text-sm text-slate-500">Session information is not available for this user.</p>
            ) : (
              <p className="text-sm text-slate-700">
                <span className="font-semibold">{state.detail.activeSessionCount}</span> active session(s).
              </p>
            )}
            <p className="mt-2 text-xs text-slate-500">
              Revoking sessions removes database-backed sessions. An already-issued access token may remain valid
              until it expires, depending on the session verification policy of the deployed application.
            </p>
          </Card>

          <MetadataCard detail={state.detail} onSaved={() => { setFlash("Metadata updated."); load(); }} />

          <ConfirmDialog
            open={showRevokeDialog}
            title="Revoke all sessions?"
            description={
              <span>
                This signs <strong>{userId}</strong> out of every active session. The user can sign in again.
              </span>
            }
            confirmLabel="Revoke sessions"
            onConfirm={handleRevokeSessions}
            onCancel={() => setShowRevokeDialog(false)}
          />

          <ConfirmDialog
            open={showDeleteDialog}
            title="Delete this user permanently?"
            description={
              <span>
                This deletes <strong>{userId}</strong> and their sessions from the SuperTokens Core. This action is
                irreversible. Data stored by other applications for this user is not affected by this portal.
              </span>
            }
            confirmLabel="Delete permanently"
            confirmPhrase={userId}
            onConfirm={handleDelete}
            onCancel={() => setShowDeleteDialog(false)}
          />
        </>
      )}
    </div>
  );
}

function MetadataCard({ detail, onSaved }: { detail: AdminUserDetailDto; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentJson = detail.metadata === null ? "" : JSON.stringify(detail.metadata, null, 2);

  function startEditing(): void {
    setDraft(currentJson);
    setError(null);
    setEditing(true);
  }

  async function save(): Promise<void> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(draft);
    } catch {
      setError("Metadata must be valid JSON.");
      return;
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      setError("Metadata must be a JSON object.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiSend("PATCH", `/api/admin/users/${encodeURIComponent(detail.userId)}/metadata`, {
        body: { metadata: parsed },
      });
      setEditing(false);
      onSaved();
    } catch (err) {
      setError(errorMessageFor(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card
      title="Metadata"
      action={
        detail.metadata !== null && !editing ? (
          <button
            onClick={startEditing}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Edit
          </button>
        ) : undefined
      }
    >
      {detail.metadata === null && !editing && (
        <p className="text-sm text-slate-500">Metadata is not available for this user.</p>
      )}
      {editing ? (
        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            Merged into existing metadata by the SuperTokens Core: keys omitted here are preserved. Keys removed by
            setting them to <code>null</code> depend on Core behavior — prefer updating values.
          </p>
          <label htmlFor="metadata-editor" className="sr-only">
            Metadata JSON
          </label>
          <textarea
            id="metadata-editor"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={10}
            spellCheck={false}
            className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs text-slate-900 focus:border-indigo-500 focus:outline-none"
          />
          {error !== null && (
            <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
          <div className="flex gap-3">
            <button
              onClick={() => void save()}
              disabled={saving}
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save metadata"}
            </button>
            <button
              onClick={() => setEditing(false)}
              disabled={saving}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        detail.metadata !== null && (
          <pre className="overflow-x-auto rounded-md bg-slate-50 p-3 font-mono text-xs text-slate-800">
            {currentJson}
          </pre>
        )
      )}
    </Card>
  );
}
