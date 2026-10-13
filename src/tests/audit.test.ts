import fs from "node:fs";
import path from "node:path";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { closeAuditDbForTests, listAuditEvents, recordAuditEvent } from "@/lib/audit/audit";
import { resetEnvCacheForTests } from "@/lib/config/env";

const DB_PATH = path.resolve(process.cwd(), "data", "test-audit.db");

beforeEach(() => {
  closeAuditDbForTests();
  removeDbFiles();
});

afterAll(() => {
  closeAuditDbForTests();
  removeDbFiles();
  delete process.env.AUDIT_DB_PATH;
  resetEnvCacheForTests();
});

describe("audit storage", () => {
  it("records and lists events newest first with cursor pagination", () => {
    recordAuditEvent({
      adminEmail: "admin@example.com",
      action: "users.delete",
      targetUserId: "u1",
      status: "success",
    });
    recordAuditEvent({
      adminEmail: "admin@example.com",
      action: "logout",
      status: "success",
    });
    recordAuditEvent({
      adminEmail: "admin@example.com",
      action: "users.delete",
      targetUserId: "u2",
      status: "failure",
      reason: "unreachable",
    });

    const firstPage = listAuditEvents({ limit: 2 });
    expect(firstPage.events).toHaveLength(2);
    expect(firstPage.events[0].action).toBe("users.delete"); // newest first
    expect(firstPage.nextBeforeId).not.toBeNull();

    const nextPage = listAuditEvents({
      limit: 2,
      beforeId: firstPage.nextBeforeId ?? undefined,
    });
    expect(nextPage.events).toHaveLength(1);
    expect(nextPage.events[0].targetUserId).toBe("u1");
    expect(nextPage.nextBeforeId).toBeNull();
  });

  it("redacts any reason outside the allowlist to \"other\"", () => {
    recordAuditEvent({
      adminEmail: "admin@example.com",
      action: "users.delete",
      targetUserId: "u1",
      status: "failure",
      // Simulates a careless caller passing a raw error message:
      reason:
        "Invalid API key sk_live_Zq9Xy8W encountered at https://core.internal:3567",
    });

    const { events } = listAuditEvents({ limit: 10 });
    expect(events[0].reason).toBe("other");
    // Redaction proof: no fragment of the secret or URL reaches the database.
    const serialized = JSON.stringify(events[0]);
    expect(serialized).not.toContain("sk_live");
    expect(serialized).not.toContain("core.internal");
    expect(serialized).not.toContain("https");
  });

  it("keeps allowlisted categories and keys_N metadata summaries", () => {
    recordAuditEvent({
      adminEmail: "admin@example.com",
      action: "users.update_metadata",
      targetUserId: "u1",
      status: "success",
      reason: "keys_3",
    });
    recordAuditEvent({
      adminEmail: "admin@example.com",
      action: "login.failed",
      status: "failure",
      reason: "invalid_password",
    });
    const { events } = listAuditEvents({ limit: 10 });
    expect(events.map((e) => e.reason)).toContain("keys_3");
    expect(events.map((e) => e.reason)).toContain("invalid_password");
  });

  it("normalizes action names", () => {
    recordAuditEvent({
      adminEmail: "admin@example.com",
      action: "Users.Delete Now!",
      status: "failure",
    });
    const { events } = listAuditEvents({ limit: 10 });
    expect(events[0].action).toBe("users.deletenow");
  });

  it("never throws into the request path on write problems", () => {
    // Create a path whose parent has a file blocking directory creation.
    const blockerDir = path.resolve(process.cwd(), "data-aud-block");
    const blockerFile = path.join(blockerDir, "block");
    const blockerDbPath = path.join(blockerDir, "block", "test-audit.db");
    try {
      // Write a file under a path that the test will later try to use as a
      // directory (the audit module's mkdirSync call targets the parent
      // dir, so we pre-create a file at that parent to force EEXIST).
      fs.mkdirSync(blockerDir, { recursive: true });
      fs.writeFileSync(blockerFile, "file-not-dir", "utf8");
      process.env.AUDIT_DB_PATH = blockerDbPath;
      resetEnvCacheForTests();
      expect(() =>
        recordAuditEvent({
          adminEmail: "admin@example.com",
          action: "logout",
          status: "success",
        }),
      ).not.toThrow();
    } finally {
      resetEnvCacheForTests();
      try { fs.rmSync(blockerFile, { force: true }); } catch {}
      try { fs.rmSync(blockerDir, { force: true, recursive: true }); } catch {}
      closeAuditDbForTests();
    }
  });
});

function removeDbFiles() {
  for (const suffix of ["", "-wal", "-shm"]) {
    const file = DB_PATH + suffix;
    try {
      fs.rmSync(file, { force: true });
    } catch {
      // Best-effort cleanup before a test run.
    }
  }
}
