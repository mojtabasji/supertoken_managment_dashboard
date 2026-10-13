import { describe, expect, it } from "vitest";

import { ConfigError, validateEnv } from "@/lib/config/env";

const VALID_SOURCE: Record<string, string | undefined> = {
  SUPERTOKENS_CONNECTION_URI: "https://core.example.com:3567",
  SUPERTOKENS_API_KEY: "core-api-key-123",
  ADMIN_EMAILS: "Admin@Example.com, admin@example.com, other@example.com",
  ADMIN_PASSWORD: "a-strong-password-1234",
  SESSION_SECRET: "x".repeat(40),
  APP_BASE_URL: "https://admin.example.com/",
};

describe("validateEnv", () => {
  it("accepts a valid environment and normalizes values", () => {
    const env = validateEnv(VALID_SOURCE);
    expect(env.supertokensConnectionUri).toBe("https://core.example.com:3567");
    expect(env.appBaseUrl).toBe("https://admin.example.com"); // trailing slash stripped
    expect(env.adminEmails).toEqual(["admin@example.com", "other@example.com"]); // lowercased + deduped
    expect(env.supertokensApiKey).toBe("core-api-key-123");
    expect(env.auditDbPath).toBe("data/audit.db"); // default
  });

  it("refuses to start without a Core URL (no silent default)", () => {
    const source = { ...VALID_SOURCE };
    delete source.SUPERTOKENS_CONNECTION_URI;
    expect(() => validateEnv(source)).toThrowError(ConfigError);
    try {
      validateEnv(source);
    } catch (err) {
      expect((err as Error).message).toContain("SUPERTOKENS_CONNECTION_URI");
    }
  });

  it("rejects a non-http Core URL", () => {
    const source = { ...VALID_SOURCE, SUPERTOKENS_CONNECTION_URI: "ftp://core.example.com" };
    expect(() => validateEnv(source)).toThrowError(ConfigError);
  });

  it("rejects an empty administrator allowlist", () => {
    const source = { ...VALID_SOURCE, ADMIN_EMAILS: "  " };
    expect(() => validateEnv(source)).toThrowError(/ADMIN_EMAILS/);
  });

  it("rejects a short admin password and short session secret", () => {
    expect(() => validateEnv({ ...VALID_SOURCE, ADMIN_PASSWORD: "short" })).toThrowError(/ADMIN_PASSWORD/);
    expect(() => validateEnv({ ...VALID_SOURCE, SESSION_SECRET: "x".repeat(16) })).toThrowError(/SESSION_SECRET/);
  });

  it("never echoes configuration values in error messages", () => {
    const source = { ...VALID_SOURCE, SESSION_SECRET: "short-secret-value" };
    try {
      validateEnv(source);
      expect.unreachable("expected ConfigError");
    } catch (err) {
      expect((err as Error).message).not.toContain("short-secret-value");
      expect((err as Error).message).not.toContain("core-api-key-123");
    }
  });
});
