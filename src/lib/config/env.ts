import "server-only";

/**
 * Server-side environment configuration.
 *
 * Validation runs at module load (and explicitly from `src/instrumentation.ts`
 * so a production server fails at startup). Error messages name the offending
 * variable but never echo its value, and there are deliberately no fallback
 * values for required settings — especially the Core URL: the portal must
 * never silently fall back to a public or demo SuperTokens Core.
 */

export type AppConfig = {
  supertokensConnectionUri: string;
  /** undefined when the Core runs without API keys. */
  supertokensApiKey: string | undefined;
  /** Lowercased, deduplicated administrator allowlist. */
  adminEmails: string[];
  adminPassword: string;
  sessionSecret: string;
  appBaseUrl: string;
  auditDbPath: string;
};

const EMAIL_ALLOWLIST_ENTRY = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 12;
const MIN_SESSION_SECRET_LENGTH = 32;
const DEFAULT_AUDIT_DB_PATH = "data/audit.db";

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

function parseHttpUrl(name: string, raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ConfigError(`Invalid configuration: ${name} must be a valid absolute http(s) URL.`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ConfigError(`Invalid configuration: ${name} must use http or https.`);
  }
  return raw.replace(/\/+$/, "");
}

/**
 * Validates the given environment source and returns the app config.
 * Pure function over its input so tests can exercise it without touching
 * `process.env`.
 */
export function validateEnv(source: Record<string, string | undefined> = process.env): AppConfig {
  const errors: string[] = [];

  const connectionUriRaw = source.SUPERTOKENS_CONNECTION_URI?.trim();
  let supertokensConnectionUri = "";
  if (!connectionUriRaw) {
    errors.push("SUPERTOKENS_CONNECTION_URI is required (URL of your SuperTokens Core).");
  } else {
    try {
      supertokensConnectionUri = parseHttpUrl("SUPERTOKENS_CONNECTION_URI", connectionUriRaw);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  const apiKeyRaw = source.SUPERTOKENS_API_KEY?.trim();
  if (apiKeyRaw !== undefined && apiKeyRaw.length > 0 && apiKeyRaw.length < 8) {
    errors.push("SUPERTOKENS_API_KEY, when set, must be at least 8 characters.");
  }
  const supertokensApiKey = apiKeyRaw && apiKeyRaw.length > 0 ? apiKeyRaw : undefined;

  const emailsRaw = source.ADMIN_EMAILS?.trim() ?? "";
  const adminEmails = [...new Set(emailsRaw.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean))];
  if (adminEmails.length === 0) {
    errors.push("ADMIN_EMAILS is required (comma-separated administrator email allowlist).");
  } else {
    for (const email of adminEmails) {
      if (!EMAIL_ALLOWLIST_ENTRY.test(email)) {
        // Report position, not content beyond the variable name, to keep logs clean.
        errors.push("ADMIN_EMAILS contains an entry that is not a valid email address.");
        break;
      }
    }
  }

  const adminPassword = source.ADMIN_PASSWORD ?? "";
  if (adminPassword.length < MIN_PASSWORD_LENGTH) {
    errors.push(`ADMIN_PASSWORD is required and must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }

  const sessionSecret = source.SESSION_SECRET ?? "";
  if (sessionSecret.length < MIN_SESSION_SECRET_LENGTH) {
    errors.push(`SESSION_SECRET is required and must be at least ${MIN_SESSION_SECRET_LENGTH} characters.`);
  }

  const appBaseUrlRaw = source.APP_BASE_URL?.trim();
  let appBaseUrl = "";
  if (!appBaseUrlRaw) {
    errors.push("APP_BASE_URL is required (canonical public URL of this admin application).");
  } else {
    try {
      appBaseUrl = parseHttpUrl("APP_BASE_URL", appBaseUrlRaw);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  const auditDbPath = source.AUDIT_DB_PATH?.trim() || DEFAULT_AUDIT_DB_PATH;

  if (errors.length > 0) {
    throw new ConfigError(
      `Server configuration is invalid:\n- ${errors.join("\n- ")}\nRefusing to start with missing or invalid configuration.`,
    );
  }

  return {
    supertokensConnectionUri,
    supertokensApiKey,
    adminEmails,
    adminPassword,
    sessionSecret,
    appBaseUrl,
    auditDbPath,
  };
}

let cached: AppConfig | null = null;

/** Memoized validation of `process.env`. Throws ConfigError when invalid. */
export function getEnv(): AppConfig {
  if (cached === null) {
    cached = validateEnv(process.env);
  }
  return cached;
}

/** Test helper: clears the memoized config. */
export function resetEnvCacheForTests(): void {
  cached = null;
}
