/**
 * Runs before each test file. Provides a complete, valid (but dummy) server
 * configuration so config validation passes; no value here is a real secret
 * and none points at a real SuperTokens Core.
 */
process.env.SUPERTOKENS_CONNECTION_URI = "http://127.0.0.1:3567";
process.env.SUPERTOKENS_API_KEY = "";
process.env.ADMIN_EMAILS = "admin@example.com";
process.env.ADMIN_PASSWORD = "test-password-1234";
process.env.SESSION_SECRET = "test-session-secret-at-least-32-chars";
process.env.APP_BASE_URL = "http://localhost:3000";
process.env.AUDIT_DB_PATH = "data/test-audit.db";
