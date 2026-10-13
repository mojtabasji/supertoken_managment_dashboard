import { redirect } from "next/navigation";

import { getAdminPrincipal } from "@/lib/auth/guard";
import { AppShell } from "@/components/layout/AppShell";

/**
 * Guards every page in the (admin) group. This is a convenience redirect for
 * the UI only — the real authorization boundary is `requireApiAdmin` in each
 * API route.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await getAdminPrincipal();
  if (admin === null) {
    redirect("/login");
  }
  return <AppShell adminEmail={admin.email}>{children}</AppShell>;
}
