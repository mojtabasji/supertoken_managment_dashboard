import crypto from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  buildClearSessionCookie,
  buildSessionCookie,
  createSessionToken,
  verifySessionToken,
} from "@/lib/auth/session";

describe("admin session tokens", () => {
  it("round-trips a valid token", () => {
    const token = createSessionToken("admin@example.com");
    const payload = verifySessionToken(token);
    expect(payload?.sub).toBe("admin@example.com");
    expect(payload?.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it("rejects a tampered payload", () => {
    const token = createSessionToken("admin@example.com");
    const [body, signature] = token.split(".");
    const forgedBody = Buffer.from(
      JSON.stringify({ sub: "attacker@example.com", iat: 0, exp: 2 ** 40 }),
      "utf8",
    ).toString("base64url");
    expect(verifySessionToken(`${forgedBody}.${signature}`)).toBeNull();
    expect(verifySessionToken(`${body}x.${signature}`)).toBeNull();
  });

  it("rejects a tampered signature and garbage input", () => {
    const token = createSessionToken("admin@example.com");
    const [body] = token.split(".");
    expect(verifySessionToken(`${body}.AAAA`)).toBeNull();
    expect(verifySessionToken("not-a-token")).toBeNull();
    expect(verifySessionToken("")).toBeNull();
  });

  it("rejects an expired token even when correctly signed", () => {
    // The test secret mirrors src/tests/setup.ts; signing it here proves the
    // expiry check runs independently of the signature check.
    const now = Math.floor(Date.now() / 1000);
    const body = Buffer.from(JSON.stringify({ sub: "admin@example.com", iat: now - 20, exp: now - 5 }), "utf8").toString(
      "base64url",
    );
    const signature = crypto
      .createHmac("sha256", "test-session-secret-at-least-32-chars")
      .update(body)
      .digest("base64url");
    expect(verifySessionToken(`${body}.${signature}`)).toBeNull();
  });

  it("sets secure cookie attributes", () => {
    const cookie = buildSessionCookie("token.value");
    expect(cookie).toContain("st_admin_session=token.value");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("Max-Age=");

    const cleared = buildClearSessionCookie();
    expect(cleared).toContain("Max-Age=0");
    expect(cleared).toContain("HttpOnly");
  });
});
