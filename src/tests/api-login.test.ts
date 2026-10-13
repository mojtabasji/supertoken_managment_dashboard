import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const recordAuditEvent = vi.fn();

vi.mock("@/lib/audit/audit", () => ({
  recordAuditEvent: (...args: unknown[]) => recordAuditEvent(...args),
}));

import { POST } from "@/app/api/admin/auth/login/route";
import { resetRateLimitsForTests } from "@/lib/auth/rate-limit";
import { verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/auth/session";

function loginRequest(body: unknown, ip = "10.0.0.1"): NextRequest {
  return new NextRequest("http://localhost:3000/api/admin/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  resetRateLimitsForTests();
});

describe("POST /api/admin/auth/login", () => {
  it("rejects malformed bodies", async () => {
    const request = new NextRequest("http://localhost:3000/api/admin/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "10.0.0.2" },
      body: "not-json",
    });
    expect((await POST(request)).status).toBe(400);
  });

  it("rejects wrong credentials without issuing a session", async () => {
    const response = await POST(loginRequest({ email: "admin@example.com", password: "wrong-password-123" }));
    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "login.failed", status: "failure", reason: "invalid_password" }),
    );
  });

  it("rejects non-allowlisted emails with the same generic error", async () => {
    const response = await POST(loginRequest({ email: "stranger@example.com", password: "test-password-1234" }));
    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { message: string } };
    expect(body.error.message).toBe("Invalid email or password.");
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "login.failed", reason: "unknown_admin" }),
    );
  });

  it("issues a verifiable session cookie on success and audits it", async () => {
    const response = await POST(loginRequest({ email: "admin@example.com", password: "test-password-1234" }));
    expect(response.status).toBe(200);
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(cookie).toContain("HttpOnly");
    const token = cookie.split(";")[0].split("=").slice(1).join("=");
    expect(verifySessionToken(token)?.sub).toBe("admin@example.com");
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "login.success", status: "success" }),
    );
  });

  it("rate-limits repeated failures per client and email", async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await POST(loginRequest({ email: "admin@example.com", password: "wrong-password-123" }));
      expect(response.status).toBe(401);
    }
    const blocked = await POST(loginRequest({ email: "admin@example.com", password: "test-password-1234" }));
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).not.toBeNull();

    // A different client address is not affected by the first client's bucket.
    const otherClient = await POST(
      loginRequest({ email: "admin@example.com", password: "test-password-1234" }, "10.0.0.99"),
    );
    expect(otherClient.status).toBe(200);
  });
});
