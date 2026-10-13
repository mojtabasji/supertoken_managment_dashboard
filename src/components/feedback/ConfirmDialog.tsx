"use client";

import { FormEvent, ReactNode, useEffect, useRef, useState } from "react";

/**
 * Confirmation dialog for destructive / security-sensitive actions.
 * Uses a native <dialog> for accessible modality (focus containment, Escape).
 * When `confirmPhrase` is set the operator must type it exactly — required for
 * irreversible actions like user deletion.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  confirmPhrase,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  confirmPhrase?: string;
  onConfirm: () => Promise<void> | void;
  onCancel: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [typedPhrase, setTypedPhrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) {
      return;
    }
    if (open && !dialog.open) {
      setTypedPhrase("");
      setError(null);
      setBusy(false);
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const phraseSatisfied = confirmPhrase === undefined || typedPhrase === confirmPhrase;

  async function handleConfirm(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!phraseSatisfied || busy) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.");
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="confirm-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) {
          onCancel();
        }
      }}
      className="m-auto w-[calc(100vw-2rem)] max-w-md rounded-xl border border-slate-200 bg-white p-0 shadow-xl backdrop:bg-slate-900/40"
    >
      <form onSubmit={(event) => void handleConfirm(event)} className="p-6">
        <h2 id="confirm-dialog-title" className="text-base font-semibold text-slate-900">
          {title}
        </h2>
        <div className="mt-2 text-sm text-slate-600">{description}</div>

        {confirmPhrase !== undefined && (
          <div className="mt-4">
            <label htmlFor="confirm-phrase" className="block text-sm font-medium text-slate-700">
              Type <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs">{confirmPhrase}</code> to
              confirm
            </label>
            <input
              id="confirm-phrase"
              value={typedPhrase}
              onChange={(event) => setTypedPhrase(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
            />
          </div>
        )}

        {error !== null && (
          <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!phraseSatisfied || busy}
            className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </form>
    </dialog>
  );
}
