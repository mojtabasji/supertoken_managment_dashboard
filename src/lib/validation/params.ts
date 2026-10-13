import "server-only";

import type { RecipeId } from "@/types/api";

/**
 * Input validation for admin API parameters. All external input is treated as
 * untrusted; helpers return discriminated results instead of throwing.
 */

/** Path-safe user ids only (prevents traversal-style input). */
const USER_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;
/** Core pagination tokens are URL-safe base64 of JSON. */
const PAGINATION_TOKEN_PATTERN = /^[A-Za-z0-9+/=_.-]{1,1024}$/;
const SEARCH_QUERY_MAX_LENGTH = 256;
const METADATA_PATCH_MAX_BYTES = 16 * 1024;

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; message: string };

/**
 * JSON-safe value types, structurally compatible with SuperTokens' JSONObject.
 * Matches the SDK's definition:
 *   type JSONPrimitive = string | number | boolean | null;
 *   type JSONObject = { [ind: string]: JSONValue };
 *   type JSONValue = JSONPrimitive | JSONObject | Array<JSONPrimitive>;
 *   // notably: JSONArray is flat (array of JSONPrimitive only).
 */
export type JsonPrimitive = string | number | boolean | null;
export type JsonObject = { [ind: string]: JsonValue };
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;
export type JsonArray = Array<JsonPrimitive>;

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return true;
  }
  if (typeof value === "number") {
    // JSON-unsafe non-finite values:
    return Number.isFinite(value);
  }
  if (Array.isArray(value)) {
    // JSONArray must be: Array<JSONPrimitive>; no nested objects or inner
    // arrays allowed, matching the first layer of the SDK's JSONValue shape.
    return value.length > 0 && value.every((item) => item === null || typeof item === "string" || typeof item === "number" || typeof item === "boolean");
  }
  if (typeof value === "object") {
    // JSONObject, recursively checked (but matching the SDK layout: each
    // property of a JSON object is itself a JSONValue, which may itself be an
    // object with primitives or nested objects; for safety, allow objects
    // whose properties are themselves JSON-safe values).
    const rec = value as Record<string, unknown>;
    return Object.keys(rec).length > 0 && Object.values(rec).every(isJsonValue);
  }
  return false;
}

export function validateUserId(raw: string): ValidationResult<string> {
  const value = raw.trim();
  if (!USER_ID_PATTERN.test(value)) {
    return { ok: false, message: "userId must be 1-128 characters of [A-Za-z0-9._-]." };
  }
  return { ok: true, value };
}

export function validateLimit(raw: string | null): ValidationResult<number> {
  if (raw === null || raw === "") {
    return { ok: true, value: DEFAULT_PAGE_SIZE };
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return { ok: false, message: "limit must be a positive integer." };
  }
  return { ok: true, value: Math.min(parsed, MAX_PAGE_SIZE) };
}

export function validatePaginationToken(raw: string | null): ValidationResult<string | undefined> {
  if (raw === null || raw === "") {
    return { ok: true, value: undefined };
  }
  if (!PAGINATION_TOKEN_PATTERN.test(raw)) {
    return { ok: false, message: "paginationToken is not a valid pagination token." };
  }
  return { ok: true, value: raw };
}

export function validateOrder(raw: string | null): ValidationResult<"ASC" | "DESC"> {
  if (raw === null || raw === "" || raw === "DESC") {
    return { ok: true, value: "DESC" };
  }
  if (raw === "ASC") {
    return { ok: true, value: "ASC" };
  }
  return { ok: false, message: "order must be ASC or DESC." };
}

export function validateSearchQuery(raw: string | null): ValidationResult<string | undefined> {
  if (raw === null) {
    return { ok: true, value: undefined };
  }
  const value = raw.trim();
  if (value.length === 0) {
    return { ok: true, value: undefined };
  }
  if (value.length > SEARCH_QUERY_MAX_LENGTH) {
    return { ok: false, message: `search query must be at most ${SEARCH_QUERY_MAX_LENGTH} characters.` };
  }
  // No control characters; keep it a single token so it can only ever be used
  // for exact-match lookups.
  
  if (/[\u0000-\u001f\u007f/\\]/.test(value)) {
    return { ok: false, message: "search query contains disallowed characters." };
  }
  return { ok: true, value };
}

export function validateMetadataPatch(raw: unknown): ValidationResult<JsonObject> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, message: "metadata must be a JSON object." };
  }
  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length === 0) {
    return { ok: false, message: "metadata must contain at least one key." };
  }
  if (!isJsonValue(raw)) {
    return { ok: false, message: "metadata must contain only JSON-safe values (no undefined, functions, symbols, or non-finite numbers)." };
  }
  let serializedSize: number;
  try {
    serializedSize = JSON.stringify(raw).length;
  } catch {
    return { ok: false, message: "metadata must be JSON-serializable." };
  }
  if (serializedSize > METADATA_PATCH_MAX_BYTES) {
    return { ok: false, message: `metadata patch exceeds ${METADATA_PATCH_MAX_BYTES} bytes.` };
  }
  return { ok: true, value: raw as unknown as JsonObject };
}

export function validateLoginBody(raw: unknown): ValidationResult<{ email: string; password: string }> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, message: "Body must be a JSON object." };
  }
  const body = raw as Record<string, unknown>;
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (email.length === 0 || email.length > 254 || password.length === 0 || password.length > 512) {
    return { ok: false, message: "email and password are required." };
  }
  return { ok: true, value: { email, password } };
}

export function validateAuditQuery(
  limitRaw: string | null,
  beforeIdRaw: string | null,
): ValidationResult<{ limit: number; beforeId: number | undefined }> {
  const limitResult = validateLimit(limitRaw);
  if (!limitResult.ok) {
    return limitResult;
  }
  if (beforeIdRaw === null || beforeIdRaw === "") {
    return { ok: true, value: { limit: Math.min(limitResult.value, 50), beforeId: undefined } };
  }
  const beforeId = Number(beforeIdRaw);
  if (!Number.isInteger(beforeId) || beforeId < 1) {
    return { ok: false, message: "beforeId must be a positive integer." };
  }
  return { ok: true, value: { limit: Math.min(limitResult.value, 50), beforeId } };
}

export const KNOWN_RECIPE_IDS: readonly RecipeId[] = ["emailpassword", "thirdparty", "passwordless"];
