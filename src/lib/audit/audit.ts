import "server-only";

import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

import { getEnv } from "@/lib/config/env";

/**
 * SQLite-backed audit trail for sensitive administrative actions, stored in
 * the admin portal's own database — never in SuperTokens tables.
 *
 * Privacy model: rows record who did what to which user id and a sanitized
 * outcome category. They never contain credentials, tokens, API keys,
 * metadata values, request bodies, or raw SDK errors. A strict category
 * allowlist prevents accidental leakage of a raw error string.
 *
 * The `data/` directory is only created and touched at runtime. The build
 * system is told to ignore that path, so its contents are never bundled or
 * shipped inside the Next.js output.
 */

export type AuditStatus = "success" | "failure";

export type AuditEventInput = {
  adminEmail: string;
  action: string;
  targetUserId?: string;
  status: AuditStatus;
  /** Short machine-readable category, e.g. "not_found", "core_unreachable". */
  reason?: string;
};

export type AuditEvent = {
  id: number;
  adminEmail: string;
  action: string;
  targetUserId: string | null;
  status: AuditStatus;
  reason: string | null;
  createdAt: string;
};

const ACTION_MAX_LENGTH = 100;

const ALLOWLIST_REASON_CATEGORIES = new Set<string>([
  "rate_limited",
  "unknown_admin",
  "invalid_password",
  "confirmation_mismatch",
  "not_found",
  "timeout",
  "unauthorized",
  "unreachable",
  "invalid_input",
  "invalid_request",
  "conflict",
  "sdk_unsupported",
]);

const KEYS_SUMMARY_PATTERN = /^keys_\d{1,4}$/;

function sanitizeCategory(raw: string | undefined): string | null {
  if (raw === undefined) {
    return null;
  }
  const normalized = raw.toLowerCase();
  if (
    ALLOWLIST_REASON_CATEGORIES.has(normalized) ||
    KEYS_SUMMARY_PATTERN.test(normalized)
  ) {
    return normalized;
  }
  return "other";
}

function sanitizeAction(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9_.-]/g, "").slice(0, ACTION_MAX_LENGTH);
}

type AuditDb = Database.Database;

const globalStore = globalThis as typeof globalThis & {
  __auditDatabase?: AuditDb;
};

function openDatabase(): AuditDb {
  const env = getEnv();
  // `auditDbPath` is relative to the project root (default "data/audit.db"),
  // so it must not be prefixed with another "data" segment.
  const dbPath = path.resolve(process.cwd(), env.auditDbPath);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const Constructor = (Database as unknown) as {
    new (path: string, options?: Database.ConstructorOptions): AuditDb;
  };
  const db = new Constructor(dbPath, {} as unknown as Database.ConstructorOptions);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_email TEXT NOT NULL,
      action TEXT NOT NULL,
      target_user_id TEXT,
      status TEXT NOT NULL CHECK (status IN ('success', 'failure')),
      reason TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_audit_logs_id ON audit_logs (id);
  `);
  return db;
}

export function getAuditDb(): AuditDb {
  const existing = globalStore.__auditDatabase;
  if (existing) {
    return existing;
  }
  return (globalStore.__auditDatabase = openDatabase());
}

/** Records one audit event. Never throws into the request path. */
export function recordAuditEvent(input: AuditEventInput): void {
  try {
    // getAuditDb() must be inside the try: opening the database (mkdir,
    // sqlite open) can throw and must never escape into the request path.
    const db = getAuditDb();
    db.prepare(
      `INSERT INTO audit_logs (admin_email, action, target_user_id, status, reason, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      input.adminEmail.toLowerCase().slice(0, 254),
      sanitizeAction(input.action),
      input.targetUserId ?? null,
      input.status,
      sanitizeCategory(input.reason),
      new Date().toISOString(),
    );
  } catch (err) {
    console.error(
      "[audit] failed to record event:",
      err instanceof Error ? err.message : "unknown error",
    );
  }
}

export type ListAuditEventsParams = {
  limit: number;
  beforeId?: number;
};

type AuditRow = {
  id: number;
  admin_email: string;
  action: string;
  target_user_id: string | null;
  status: AuditStatus;
  reason: string | null;
  created_at: string;
};

export function listAuditEvents(params: ListAuditEventsParams): {
  events: AuditEvent[];
  nextBeforeId: number | null;
} {
  const db = getAuditDb();
  const rows = db.prepare(
    `SELECT id, admin_email, action, target_user_id, status, reason, created_at
     FROM audit_logs
     WHERE (? IS NULL OR id < ?)
     ORDER BY id DESC
     LIMIT ?`,
  ).all(params.beforeId ?? null, params.beforeId ?? null, params.limit + 1) as AuditRow[];

  const hasMore = rows.length > params.limit;
  const page = hasMore ? rows.slice(0, params.limit) : rows;

  return {
    events: page.map((row) => ({
      id: row.id,
      adminEmail: row.admin_email,
      action: row.action,
      targetUserId: row.target_user_id,
      status: row.status,
      reason: row.reason,
      createdAt: row.created_at,
    })),
    nextBeforeId: hasMore ? page[page.length - 1].id : null,
  };
}

/** Test helper: closes and forgets the shared database handle. */
export function closeAuditDbForTests(): void {
  globalStore.__auditDatabase?.close?.();
  delete globalStore.__auditDatabase;
}
