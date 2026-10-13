import { describe, expect, it } from "vitest";

import { verifyAdminCredentials } from "@/lib/auth/credentials";

describe("verifyAdminCredentials", () => {
  it("accepts an allowlisted email with the correct password", () => {
    const result = verifyAdminCredentials("admin@example.com", "test-password-1234");
    expect(result).toEqual({ ok: true, email: "admin@example.com" });
  });

  it("is case-insensitive on the email", () => {
    const result = verifyAdminCredentials("  ADMIN@Example.com ", "test-password-1234");
    expect(result.ok).toBe(true);
  });

  it("rejects emails outside the allowlist", () => {
    const result = verifyAdminCredentials("stranger@example.com", "test-password-1234");
    expect(result).toEqual({ ok: false, reason: "unknown_admin" });
  });

  it("rejects a wrong password for an allowlisted email", () => {
    const result = verifyAdminCredentials("admin@example.com", "wrong-password-here");
    expect(result).toEqual({ ok: false, reason: "invalid_password" });
  });
});
