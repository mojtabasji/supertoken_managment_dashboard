import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * Authorization guard tests. `next/headers` cookies() is mocked so we can
 * present arbitrary session tokens to the guard.
 */
let cookieToken: string | undefined;

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "st_admin_session" && cookieToken !== undefined ? { name, value: cookieToken } : undefined,
  }),
}));

import { enforceSameOriginMutation, getAdminPrincipal, isSameOriginMutation, requireApiAdmin } from "@/lib/auth/guard";
import { createSessionToken } from "@/lib/auth/session";

beforeEach(() => {
  cookieToken = undefined;
});

describe("getAdminPrincipal", () => {
  it("returns null without a session cookie", async () => {
    expect(await getAdminPrincipal()).toBeNull();
  });

  it("returns the admin for a valid, allowlisted session", async () => {
    cookieToken = createSessionToken("admin@example.com");
    expect(await getAdminPrincipal()).toEqual({ email: "admin@example.com" });
  });

  it("rejects a validly-signed session for an address no longer allowlisted", async () => {
    cookieToken = createSessionToken("former-admin@example.com");
    expect(await getAdminPrincipal()).toBeNull();
  });

  it("rejects tampered tokens", async () => {
    cookieToken = "forged.token";
    expect(await getAdminPrincipal()).toBeNull();
  });
});

describe("requireApiAdmin", () => {
  it("returns a 401 JSON response when unauthenticated", async () => {
    const result = await requireApiAdmin();
    expect("response" in result).toBe(true);
    if ("response" in result) {
      expect(result.response.status).toBe(401);
      const body = (await result.response.json()) as { ok: boolean; error: { code: string } };
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("unauthorized");
    }
  });

  it("passes the principal through when authenticated", async () => {
    cookieToken = createSessionToken("admin@example.com");
    const result = await requireApiAdmin();
    expect("admin" in result).toBe(true);
  });
});

describe("same-origin mutation enforcement", () => {
  const mutation = (headers: Record<string, string>) =>
    new NextRequest("http://localhost:3000/api/admin/users", { method: "POST", headers });

  it("accepts requests with a matching Origin", () => {
    expect(isSameOriginMutation(mutation({ origin: "http://localhost:3000" }))).toBe(true);
    expect(enforceSameOriginMutation(mutation({ origin: "http://localhost:3000" }))).toBeNull();
  });

  it("rejects missing or foreign Origin headers", () => {
    expect(isSameOriginMutation(mutation({}))).toBe(false);
    expect(isSameOriginMutation(mutation({ origin: "https://evil.example.com" }))).toBe(false);
    const rejected = enforceSameOriginMutation(mutation({ origin: "https://evil.example.com" }));
    expect(rejected?.status).toBe(403);
  });
});
