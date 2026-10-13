import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

let cookieToken: string | undefined;

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "st_admin_session" && cookieToken !== undefined
        ? { name, value: cookieToken }
        : undefined,
  }),
}));

const getUserDetail = vi.fn();
const deleteUser = vi.fn();
const updateMetadata = vi.fn();
const revokeAllSessions = vi.fn();

vi.mock("@/lib/supertokens/users", () => ({
  getUserDetail: (...args: unknown[]) => getUserDetail(...args),
  deleteUser: (...args: unknown[]) => deleteUser(...args),
  updateMetadata: (...args: unknown[]) => updateMetadata(...args),
  revokeAllSessions: (...args: unknown[]) => revokeAllSessions(...args),
  classifyCoreError: (err: unknown) =>
    err instanceof Error && /timeout/i.test(err.message)
      ? ("timeout" as const)
      : ("unreachable" as const),
}));

const recordAuditEvent = vi.fn();

vi.mock("@/lib/audit/audit", () => ({
  recordAuditEvent: (...args: unknown[]) => recordAuditEvent(...args),
}));

import { DELETE, GET } from "@/app/api/admin/users/[userId]/route";
import { PATCH } from "@/app/api/admin/users/[userId]/metadata/route";
import { POST as revokePost } from "@/app/api/admin/users/[userId]/revoke-sessions/route";
import { createSessionToken } from "@/lib/auth/session";

const USER_ID = "user-abc-123";
const ORIGIN = { origin: "http://localhost:3000" };

function context(): { params: Promise<{ userId: string }> } {
  return { params: Promise.resolve({ userId: USER_ID }) };
}

function deleteRequest(headers: Record<string, string>): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/admin/users/${USER_ID}`,
    { method: "DELETE", headers },
  );
}

beforeEach(() => {
  cookieToken = createSessionToken("admin@example.com");
  vi.clearAllMocks();
  getUserDetail.mockResolvedValue({ userId: USER_ID });
  deleteUser.mockResolvedValue({ status: "OK" });
});

describe("GET /api/admin/users/:userId", () => {
  it("denies unauthenticated access with 401", async () => {
    cookieToken = undefined;
    const response = await GET(
      new NextRequest(`http://localhost:3000/api/admin/users/${USER_ID}`),
      context(),
    );
    expect(response.status).toBe(401);
    expect(getUserDetail).not.toHaveBeenCalled();
  });

  it("returns 404 for unknown users", async () => {
    getUserDetail.mockResolvedValue(null);
    const response = await GET(
      new NextRequest(`http://localhost:3000/api/admin/users/${USER_ID}`),
      context(),
    );
    expect(response.status).toBe(404);
  });

  it("rejects path-traversal-style user ids", async () => {
    const badContext = { params: Promise.resolve({ userId: "../etc/passwd" }) };
    const response = await GET(
      new NextRequest("http://localhost:3000/api/admin/users/x"),
      badContext,
    );
    expect(response.status).toBe(400);
    expect(getUserDetail).not.toHaveBeenCalled();
  });

  it("maps Core failures to a sanitized 502", async () => {
    getUserDetail.mockRejectedValue(
      new Error("connect ECONNREFUSED 127.0.0.1:3567 apiKey=secret-key"),
    );
    const response = await GET(
      new NextRequest(`http://localhost:3000/api/admin/users/${USER_ID}`),
      context(),
    );
    expect(response.status).toBe(502);
    const text = JSON.stringify(await response.json());
    expect(text).not.toContain("secret-key");
    expect(text).not.toContain("ECONNREFUSED");
  });
});

describe("DELETE /api/admin/users/:userId", () => {
  it("denies unauthenticated access with 401", async () => {
    cookieToken = undefined;
    const response = await DELETE(
      deleteRequest({ ...ORIGIN, "x-confirm-delete": USER_ID }),
      context(),
    );
    expect(response.status).toBe(401);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("rejects cross-origin requests even with a session", async () => {
    const response = await DELETE(
      deleteRequest({
        origin: "https://example.com",
        "x-confirm-delete": USER_ID,
      }),
      context(),
    );
    expect(response.status).toBe(403);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("requires the confirmation header to match the userId", async () => {
    const response = await DELETE(deleteRequest(ORIGIN), context());
    expect(response.status).toBe(400);
    expect(deleteUser).not.toHaveBeenCalled();
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "users.delete",
        status: "failure",
        reason: "confirmation_mismatch",
      }),
    );
  });

  it("returns 404 and does not delete unknown users", async () => {
    getUserDetail.mockResolvedValue(null);
    const response = await DELETE(
      deleteRequest({ ...ORIGIN, "x-confirm-delete": USER_ID }),
      context(),
    );
    expect(response.status).toBe(404);
    expect(deleteUser).not.toHaveBeenCalled();
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "users.delete",
        status: "failure",
        reason: "not_found",
      }),
    );
  });

  it("deletes a confirmed user and audits success", async () => {
    const response = await DELETE(
      deleteRequest({ ...ORIGIN, "x-confirm-delete": USER_ID }),
      context(),
    );
    expect(response.status).toBe(200);
    expect(deleteUser).toHaveBeenCalledWith(USER_ID);
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        adminEmail: "admin@example.com",
        action: "users.delete",
        targetUserId: USER_ID,
        status: "success",
      }),
    );
  });

  it("returns a sanitized 502 and audits failure when the Core errors", async () => {
    deleteUser.mockRejectedValue(
      new Error("socket hang up api-key-abc123"),
    );
    const response = await DELETE(
      deleteRequest({ ...ORIGIN, "x-confirm-delete": USER_ID }),
      context(),
    );
    expect(response.status).toBe(502);
    const text = JSON.stringify(await response.json());
    expect(text).not.toContain("api-key-abc123");
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "users.delete",
        status: "failure",
        reason: "unreachable",
      }),
    );
  });
});

describe("PATCH /api/admin/users/:userId/metadata", () => {
  function patchRequest(body: unknown): NextRequest {
    return new NextRequest(
      `http://localhost:3000/api/admin/users/${USER_ID}/metadata`,
      {
        method: "PATCH",
        headers: { ...ORIGIN, "content-type": "application/json" },
        body: JSON.stringify(body),
      },
    );
  }

  it("denies unauthenticated access with 401", async () => {
    cookieToken = undefined;
    const response = await PATCH(patchRequest({ metadata: { a: 1 } }), context());
    expect(response.status).toBe(401);
    expect(updateMetadata).not.toHaveBeenCalled();
  });

  it("rejects non-object metadata", async () => {
    for (const bad of [
      { metadata: [1, 2, 3] },
      { metadata: {} },
      {},
      { metadata: "nope" },
    ]) {
      const response = await PATCH(patchRequest(bad), context());
      expect(response.status).toBe(400);
    }
    expect(updateMetadata).not.toHaveBeenCalled();
  });

  it("404s for unknown users before touching metadata", async () => {
    getUserDetail.mockResolvedValue(null);
    const response = await PATCH(
      patchRequest({ metadata: { plan: "pro" } }),
      context(),
    );
    expect(response.status).toBe(404);
    expect(updateMetadata).not.toHaveBeenCalled();
  });

  it("updates metadata, audits key count (not values), and never stores values", async () => {
    updateMetadata.mockResolvedValue({
      plan: "pro",
      token: "sensitive-value-xyz",
    });
    const response = await PATCH(
      patchRequest({ metadata: { plan: "pro", token: "sensitive-value-xyz" } }),
      context(),
    );
    expect(response.status).toBe(200);
    expect(updateMetadata).toHaveBeenCalledWith(USER_ID, {
      plan: "pro",
      token: "sensitive-value-xyz",
    });

    const auditCall = recordAuditEvent.mock.calls[0][0] as { reason?: string };
    expect(auditCall.reason).toBe("keys_2");
    // Redaction proof: metadata values must not appear in the audit trail.
    expect(recordAuditEvent.mock.calls.map((c) => JSON.stringify(c))).not.toContain(
      "sensitive-value-xyz",
    );
  });
});

describe("POST /api/admin/users/:userId/revoke-sessions", () => {
  function revokeRequest(): NextRequest {
    return new NextRequest(
      `http://localhost:3000/api/admin/users/${USER_ID}/revoke-sessions`,
      {
        method: "POST",
        headers: ORIGIN,
      },
    );
  }

  it("denies unauthenticated access with 401", async () => {
    cookieToken = undefined;
    const response = await revokePost(revokeRequest(), context());
    expect(response.status).toBe(401);
    expect(revokeAllSessions).not.toHaveBeenCalled();
  });

  it("revokes sessions, reports the count, and audits", async () => {
    revokeAllSessions.mockResolvedValue(3);
    const response = await revokePost(revokeRequest(), context());
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: { revokedSessionCount: number };
    };
    expect(body.data.revokedSessionCount).toBe(3);
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "users.revoke_sessions",
        status: "success",
      }),
    );
  });
});
