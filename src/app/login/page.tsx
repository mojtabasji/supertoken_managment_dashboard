"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { ApiClientError, apiSend } from "@/lib/client/api";
import type { LoginResponseDto } from "@/types/api";

type SubmitState = { kind: "idle" } | { kind: "submitting" } | { kind: "error"; message: string; retryAfter?: number };

export default function LoginPage(): React.ReactElement {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [state, setState] = useState<SubmitState>({ kind: "idle" });

  // Already signed in (valid session)? Skip the form.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/admin/health", { credentials: "same-origin" });
        if (response.ok && !cancelled) {
          router.replace("/overview");
        }
      } catch {
        // Stay on the login form; the API will be reachable again or the user
        // will see the error after submitting.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setState({ kind: "submitting" });
    try {
      await apiSend<LoginResponseDto>("POST", "/api/admin/auth/login", { body: { email, password } });
      router.replace("/overview");
      router.refresh();
    } catch (error) {
      if (error instanceof ApiClientError && error.code === "rate_limited") {
        setState({ kind: "error", message: error.message });
        return;
      }
      setState({ kind: "error", message: "Invalid email or password." });
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">SuperTokens</p>
          <h1 className="mt-1 text-xl font-semibold text-slate-900">Admin Portal</h1>
          <p className="mt-1 text-sm text-slate-500">Sign in with an authorized administrator account.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none"
              placeholder="admin@example.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-700">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none"
              placeholder="••••••••••••"
            />
          </div>

          {state.kind === "error" && (
            <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {state.message}
            </p>
          )}

          <button
            type="submit"
            disabled={state.kind === "submitting"}
            className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {state.kind === "submitting" ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </main>
  );
}
