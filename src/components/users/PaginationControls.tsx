"use client";

/** Simple prev/next pagination controls over opaque Core pagination tokens. */
export function PaginationControls({
  hasPrev,
  hasNext,
  busy,
  onPrev,
  onNext,
}: {
  hasPrev: boolean;
  hasNext: boolean;
  busy: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <button
        type="button"
        onClick={onPrev}
        disabled={!hasPrev || busy}
        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        ← Previous
      </button>
      <button
        type="button"
        onClick={onNext}
        disabled={!hasNext || busy}
        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Next →
      </button>
    </div>
  );
}
