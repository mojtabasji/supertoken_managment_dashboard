import type { Metadata } from "next";

import { getCoreHealth } from "@/lib/supertokens/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Health",
  description: "SuperTokens Admin Portal health status",
};

function StatusBadge({ healthy, label }: { healthy: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ${
        healthy ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
      }`}
    >
      <span
        aria-hidden="true"
        className={`h-2 w-2 rounded-full ${healthy ? "bg-emerald-500" : "bg-red-500"}`}
      />
      {label}
    </span>
  );
}

export default async function HealthPage(): Promise<React.ReactElement> {
  const core = await getCoreHealth();

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <section className="w-full max-w-xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">System status</p>
            <h1 className="mt-1 text-xl font-semibold text-slate-900">Application health</h1>
          </div>
          <StatusBadge healthy={core.reachable} label={core.reachable ? "Healthy" : "Degraded"} />
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-medium text-slate-500">Admin portal</p>
            <p className="mt-2 text-sm font-semibold text-slate-900">Operational</p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-medium text-slate-500">SuperTokens Core</p>
            <p className="mt-2 text-sm font-semibold text-slate-900">
              {core.reachable ? "Connected" : "Unavailable"}
            </p>
            {typeof core.latencyMs === "number" && (
              <p className="mt-1 text-xs text-slate-500">Response time: {core.latencyMs} ms</p>
            )}
            {!core.reachable && core.errorCategory && (
              <p className="mt-1 text-xs text-slate-500">Reason: {core.errorCategory}</p>
            )}
          </div>
        </div>

        <p className="mt-5 text-xs text-slate-400">Checked: {new Date().toISOString()}</p>
      </section>
    </main>
  );
}
