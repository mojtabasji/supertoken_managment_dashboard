import { describe, expect, it } from "vitest";

import {
  DEFAULT_PAGE_SIZE,
  validateLimit,
  validateLoginBody,
  validateMetadataPatch,
  validateOrder,
  validatePaginationToken,
  validateSearchQuery,
  validateUserId,
} from "@/lib/validation/params";

describe("validateUserId", () => {
  it("accepts typical SuperTokens user ids", () => {
    expect(validateUserId("2c3074d4-9a35-4b52-b4ee-3f4a40d92f08")).toEqual({
      ok: true,
      value: "2c3074d4-9a35-4b52-b4ee-3f4a40d92f08",
    });
    expect(validateUserId(" custom_user.id-123 ")).toEqual({ ok: true, value: "custom_user.id-123" });
  });

  it("rejects traversal-style and oversized ids", () => {
    expect(validateUserId("../etc/passwd").ok).toBe(false);
    expect(validateUserId("a/b").ok).toBe(false);
    expect(validateUserId("a\\b").ok).toBe(false);
    expect(validateUserId("x".repeat(129)).ok).toBe(false);
    expect(validateUserId("").ok).toBe(false);
  });
});

describe("validateLimit", () => {
  it("defaults to 20 and clamps to 100", () => {
    expect(validateLimit(null)).toEqual({ ok: true, value: DEFAULT_PAGE_SIZE });
    expect(validateLimit("500")).toEqual({ ok: true, value: 100 });
    expect(validateLimit("10")).toEqual({ ok: true, value: 10 });
  });

  it("rejects non-positive and non-integer values", () => {
    expect(validateLimit("0").ok).toBe(false);
    expect(validateLimit("-3").ok).toBe(false);
    expect(validateLimit("abc").ok).toBe(false);
    expect(validateLimit("1.5").ok).toBe(false);
  });
});

describe("validatePaginationToken", () => {
  it("passes through URL-safe tokens and empty values", () => {
    expect(validatePaginationToken(null)).toEqual({ ok: true, value: undefined });
    expect(validatePaginationToken("1699999999999_abc-DEF+/=")).toEqual({
      ok: true,
      value: "1699999999999_abc-DEF+/=",
    });
  });

  it("rejects tokens with spaces or control characters", () => {
    expect(validatePaginationToken("bad token").ok).toBe(false);
    expect(validatePaginationToken("a\nb").ok).toBe(false);
    expect(validatePaginationToken("x".repeat(1025)).ok).toBe(false);
  });
});

describe("validateOrder", () => {
  it("accepts ASC/DESC with DESC default", () => {
    expect(validateOrder(null)).toEqual({ ok: true, value: "DESC" });
    expect(validateOrder("ASC")).toEqual({ ok: true, value: "ASC" });
    expect(validateOrder("nope").ok).toBe(false);
  });
});

describe("validateSearchQuery", () => {
  it("trims and treats blank as no query", () => {
    expect(validateSearchQuery(null)).toEqual({ ok: true, value: undefined });
    expect(validateSearchQuery("   ")).toEqual({ ok: true, value: undefined });
    expect(validateSearchQuery(" user@example.com ")).toEqual({ ok: true, value: "user@example.com" });
  });

  it("rejects oversized queries and control characters", () => {
    expect(validateSearchQuery("x".repeat(257)).ok).toBe(false);
    expect(validateSearchQuery("a\u0000b").ok).toBe(false);
    expect(validateSearchQuery("a/b").ok).toBe(false);
  });
});

describe("validateMetadataPatch", () => {
  it("accepts non-empty JSON objects", () => {
    expect(validateMetadataPatch({ plan: "pro", nested: { a: 1 } })).toEqual({
      ok: true,
      value: { plan: "pro", nested: { a: 1 } },
    });
  });

  it("rejects arrays, null, empty objects, and oversized patches", () => {
    expect(validateMetadataPatch([1, 2]).ok).toBe(false);
    expect(validateMetadataPatch(null).ok).toBe(false);
    expect(validateMetadataPatch({}).ok).toBe(false);
    const huge: Record<string, string> = {};
    for (let i = 0; i < 500; i += 1) {
      huge[`key_${i}`] = "x".repeat(50);
    }
    expect(validateMetadataPatch(huge).ok).toBe(false);
  });
});

describe("validateLoginBody", () => {
  it("requires string email and password within bounds", () => {
    expect(validateLoginBody({ email: " a@b.co ", password: "pw" })).toEqual({
      ok: true,
      value: { email: "a@b.co", password: "pw" },
    });
    expect(validateLoginBody({ email: "", password: "pw" }).ok).toBe(false);
    expect(validateLoginBody({ email: "a@b.co" }).ok).toBe(false);
    expect(validateLoginBody({ email: 42, password: "pw" }).ok).toBe(false);
    expect(validateLoginBody("string").ok).toBe(false);
  });
});
