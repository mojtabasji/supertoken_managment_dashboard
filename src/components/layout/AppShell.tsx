"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { apiSend } from "@/lib/client/api";

const NAV_ITEMS = [
  { href: "/overview", label: "Overview" },
  { href: "/users", label: "Users" },
  { href: "/audit-logs", label: "Audit log" },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === "/overview") {
    return pathname === "/" || pathname === href;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ adminEmail, children }: { adminEmail: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut(): Promise<void> {
    setSigningOut(true);
    try {
      await apiSend("POST", "/api/admin/auth/logout");
    } catch {
      // Cookie clearing happens server-side; even on error, go to login.
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  return (
    <div className="min-h-screen lg:flex">
      {/* Sidebar (desktop) */}
      <aside className="hidden border-r border-slate-200 bg-white lg:flex lg:w-60 lg:flex-col lg:fixed lg:inset-y-0">
        <div className="border-b border-slate-200 px-6 py-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">SuperTokens</p>
          <p className="mt-0.5 text-sm font-semibold text-slate-900">Admin Portal</p>
        </div>
        <nav aria-label="Primary" className="flex-1 space-y-1 px-3 py-4">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(pathname, item.href) ? "page" : undefined}
              className={`block rounded-md px-3 py-2 text-sm font-medium ${
                isActive(pathname, item.href)
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-slate-200 px-4 py-4">
          <p className="truncate text-xs text-slate-500" title={adminEmail}>
            {adminEmail}
          </p>
          <button
            onClick={() => void handleSignOut()}
            disabled={signingOut}
            className="mt-2 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </aside>

      {/* Header + content */}
      <div className="flex min-h-screen flex-1 flex-col lg:pl-60">
        <header className="border-b border-slate-200 bg-white lg:hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">SuperTokens</p>
              <p className="text-sm font-semibold text-slate-900">Admin Portal</p>
            </div>
            <button
              onClick={() => void handleSignOut()}
              disabled={signingOut}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
          <nav aria-label="Primary" className="flex gap-1 overflow-x-auto px-2 pb-2">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive(pathname, item.href) ? "page" : undefined}
                className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ${
                  isActive(pathname, item.href)
                    ? "bg-indigo-50 text-indigo-700"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
