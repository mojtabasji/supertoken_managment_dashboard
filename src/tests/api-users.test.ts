import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

let cookieToken: string | undefined;

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "st_admin_session" && cookieToken !== undefined ? { name, value: cookieToken } : undefined,
  }),
}));

const listUsers = vi.fn();
const lookupUsers = vi.fn();

vi.mock("@/lib/supertokens/users", () => ({
  listUsers: (...args: unknown[]) => listUsers(...args),
  lookupUsers: (...args: unknown[]) => lookupUsers(...args),
}));

import { GET } from "@/app/api/admin/users/route";
import { createSessionToken } from "@/lib/auth/session";

function requestWith(query: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/admin/users${query}`);
}

beforeEach(() => {
  cookieToken = createSessionToken("admin@example.com");
  listUsers.mockReset().mockResolvedValue({ users: [], nextPaginationToken: undefined });
  lookupUsers.mockReset().mockResolvedValue([]);
});

describe("GET /api/admin/users", () => {
  it("denies unauthenticated access with 401", async () => {
    cookieToken = undefined;
    const response = await GET(requestWith(""));
    expect(response.status).toBe(401);
    expect(listUsers).not.toHaveBeenCalled();
    expect(lookupUsers).not.toHaveBeenCalled();
  });

  it("paginates through the Core token and clamps oversized limits", async () => {
    const response = await GET(requestWith("?limit=500&paginationToken=abc123&order=ASC"));
    expect(response.status).toBe(200);
    expect(listUsers).toHaveBeenCalledWith({ limit: 100, paginationToken: "abc123", order: "ASC" });
    const body = (await response.json()) as { ok: boolean; data: { isSearchResult: boolean } };
    expect(body.ok).toBe(true);
    expect(body.data.isSearchResult).toBe(false);
  });

  it("rejects invalid limits and pagination tokens", async () => {
    expect((await GET(requestWith("?limit=abc"))).status).toBe(400);
    expect((await GET(requestWith("?limit=0"))).status).toBe(400);
    expect((await GET(requestWith("?paginationToken=bad%20token%21"))).status).toBe(400);
    expect((await GET(requestWith("?order=SIDEWAYS"))).status).toBe(400);
    expect(listUsers).not.toHaveBeenCalled();
  });

  it("routes non-empty queries to exact-match lookup and ignores pagination", async () => {
    lookupUsers.mockResolvedValue([{ userId: "u1", recipeId: "emailpassword", timeJoined: 1, emails: ["a@b.co"], phones: [] }]);
    const response = await GET(requestWith("?q=a%40b.co&limit=50"));
    expect(response.status).toBe(200);
    expect(lookupUsers).toHaveBeenCalledWith({ query: "a@b.co" });
    expect(listUsers).not.toHaveBeenCalled();
    const body = (await response.json()) as { data: { isSearchResult: boolean; users: unknown[] } };
    expect(body.data.isSearchResult).toBe(true);
    expect(body.data.users).toHaveLength(1);
  });

  it("treats whitespace-only queries as no query (pagination mode)", async () => {
    const response = await GET(requestWith("?q=%20%20"));
    expect(response.status).toBe(200);
    expect(listUsers).toHaveBeenCalled();
  });

  it("rejects search queries with control characters", async () => {
    const response = await GET(requestWith("?q=abc%0Adef"));
    expect(response.status).toBe(400);
    expect(lookupUsers).not.toHaveBeenCalled();
  });
});
