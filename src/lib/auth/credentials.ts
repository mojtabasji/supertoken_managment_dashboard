import "server-only";

import crypto from "node:crypto";

import { getEnv } from "@/lib/config/env";

/**
 * Static administrator credentials: an email that must appear in the
 * server-side allowlist (ADMIN_EMAILS) plus a shared password (ADMIN_PASSWORD).
 *
 * The password is compared via SHA-256 digests with a timing-safe comparison
 * so neither the length nor the content of the stored secret leaks through
 * timing. Chosen approach documented in DOCUMENT.md (tradeoffs + mitigations).
 */

export type CredentialCheck =
  | { ok: true; email: string }
  | { ok: false; reason: "unknown_admin" | "invalid_password" };

function digest(value: string): Buffer {
  return crypto.createHash("sha256").update(value, "utf8").digest();
}

export function verifyAdminCredentials(inputEmail: string, password: string): CredentialCheck {
  const env = getEnv();
  const email = inputEmail.trim().toLowerCase();

  if (!env.adminEmails.includes(email)) {
    // Constant-ish work even for unknown admins: still compare a digest so the
    // response timing does not distinguish "not on allowlist" from "wrong
    // password".
    digest(password);
    return { ok: false, reason: "unknown_admin" };
  }

  const expected = digest(env.adminPassword);
  const provided = digest(password);
  if (!crypto.timingSafeEqual(expected, provided)) {
    return { ok: false, reason: "invalid_password" };
  }
  return { ok: true, email };
}
