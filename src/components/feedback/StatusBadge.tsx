/** Badges pair color with text so state is never color-only (accessibility). */

type Tone = "neutral" | "success" | "warning" | "danger" | "info";

const TONE_CLASSES: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-700 ring-slate-200",
  success: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  warning: "bg-amber-50 text-amber-800 ring-amber-200",
  danger: "bg-red-50 text-red-800 ring-red-200",
  info: "bg-indigo-50 text-indigo-700 ring-indigo-200",
};

export function StatusBadge({ label, tone = "neutral" }: { label: string; tone?: Tone }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONE_CLASSES[tone]}`}
    >
      {label}
    </span>
  );
}

const RECIPE_LABELS: Record<string, string> = {
  emailpassword: "Email + password",
  thirdparty: "Third-party",
  passwordless: "Passwordless",
};

export function RecipeBadge({ recipeId }: { recipeId: string }) {
  return <StatusBadge label={RECIPE_LABELS[recipeId] ?? recipeId} tone="info" />;
}
