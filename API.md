# SuperTokens Admin Portal — API Reference

Every endpoint is a Next.js App Router route under `src/app/api/admin/`. All responses use the same JSON envelope, all input is validated server-side, and all sensitive operations are audited.

## Conventions

### Response envelope

Success (HTTP 2xx):

```json
{ "ok": true, "data": { ... } }
```

Failure:

```json
{ "ok": false, "error": { "code": "<error_code>", "message": "<human-readable text>" } }
```

Error codes used across the API: `invalid_request`, `unauthorized`, `forbidden`, `not_found`, `rate_limited`, `core_unavailable`. Error messages never contain stack traces, Core URLs, API keys, or raw SDK responses.

### Authentication

All endpoints (except `POST /auth/login`) require an admin session cookie issued by a successful sign-in. Unauthenticated requests receive `401` with code `unauthorized`. The guard is enforced server-side on every request (`requireApiAdmin`); client-side checks are decorative only.

### CSRF / origin protection

All state-changing requests (`POST`, `PATCH`, `DELETE`) additionally enforce a server-side same-origin check against `APP_BASE_URL`. Cross-origin mutations receive `403`.

### Body limits

JSON request bodies are capped at 32 KiB. Empty, oversized, or malformed bodies receive `400` with code `invalid_request`.

### Rate limiting

Sign-in attempts are rate-limited per client address. Exceeding the limit returns `429` with code `rate_limited` and a `Retry-After` hint.

---

## POST /api/admin/auth/login

Sign in an administrator (email + password allowlist) and issue a session cookie.

- **Auth:** none (this is the sign-in endpoint).
- **Body:** `{ "email": string, "password": string }` — both required.
- **Validation:** email must be on the `ADMIN_EMAILS` allowlist; password checked against `ADMIN_PASSWORD` with constant-time comparison.
- **Success:** `200` → `data: { admin: { email } }`, sets the session cookie.
- **Errors:** `400 invalid_request` (missing/invalid body), `401 unauthorized` (invalid credentials — the same response whether the email is unknown or the password is wrong), `429 rate_limited`.
- **Side effects:** failed and successful attempts are audited (`login.failed` / `login.success`).

## POST /api/admin/auth/logout

Revoke the current admin session and clear the cookie.

- **Auth:** admin session required.
- **Success:** `200` → `data: { loggedOut: true }`.

## GET /api/admin/health

Report admin service status and SuperTokens Core connectivity without exposing secrets.

- **Auth:** admin session required.
- **Success:** `200` → `data: { core: "up" | "down", checkedAt: string }`. Never includes the Core URL, API key, or raw error text.

## GET /api/admin/users

List or search users.

- **Auth:** admin session required.
- **Query parameters:**
  - `q` — search string. When present, the route performs a search and ignores the pagination parameters; the response is flagged `isSearchResult: true`.
  - `limit` — page size (validated bounds; default per SDK).
  - `paginationToken` — opaque cursor from a previous response.
  - `order` — sort order (`ASC` / `DESC`).
- **Success:** `200` → `data: { users: UserDto[], nextPaginationToken: string | null, isSearchResult: boolean }`.
- **Errors:** `400 invalid_request` (any parameter fails validation), `401 unauthorized`, `502 core_unavailable`.

## GET /api/admin/users/:userId

Retrieve one user's details.

- **Auth:** admin session required.
- **Path parameters:** `userId` — validated format.
- **Success:** `200` → `data: { user: UserDto }`.
- **Errors:** `400 invalid_request` (malformed userId), `404 not_found`, `401 unauthorized`, `502 core_unavailable`.

## PATCH /api/admin/users/:userId/metadata

Update user metadata via the usermetadata recipe. The Core deep-merges the patch into existing metadata; keys absent from the patch are preserved.

- **Auth:** admin session required; same-origin mutation enforced.
- **Body:** `{ "metadata": { "<key>": <json value>, ... } }` — validated (key names and value types constrained).
- **Behavior:** the route first verifies the user exists, because the metadata store is independent of the user store and would otherwise happily create entries for unknown ids.
- **Success:** `200` → `data: { metadata: Record<string, unknown> }` (the merged metadata).
- **Errors:** `400 invalid_request` (bad body or patch validation), `403 forbidden` (origin check), `404 not_found`, `401 unauthorized`, `502 core_unavailable`.
- **Side effects:** audited as `users.update_metadata`. The audit reason records only the **number of keys** (`keys_<n>`), never key names or values.

## POST /api/admin/users/:userId/revoke-sessions

Revoke all sessions for a user.

- **Auth:** admin session required; same-origin mutation enforced.
- **Behavior:** verifies the user exists first.
- **Success:** `200` → `data: { revoked: true, userId: string }`.
- **Errors:** `400 invalid_request`, `403 forbidden`, `404 not_found`, `401 unauthorized`, `502 core_unavailable`.
- **Side effects:** audited as `users.revoke_sessions`.

## DELETE /api/admin/users/:userId

Permanently delete a user. Irreversible.

- **Auth:** admin session required; same-origin mutation enforced.
- **Confirmation (required):** the request must carry the header `X-Confirm-Delete: <exact userId>`. A missing or mismatched header returns `400 invalid_request`; this defeats accidental double-submits and drives the UI's explicit confirmation dialog.
- **Behavior:** verifies the user exists, then deletes.
- **Success:** `200` → `data: { deleted: true, userId: string }`.
- **Errors:** `400 invalid_request` (bad userId or confirmation mismatch), `403 forbidden`, `404 not_found`, `401 unauthorized`, `502 core_unavailable`.
- **Side effects:** audited as `users.delete` (success or `confirmation_mismatch` / `not_found` failure).

## GET /api/admin/audit-logs

Retrieve audit events for authorized administrators.

- **Auth:** admin session required.
- **Query parameters:**
  - `limit` — page size (validated bounds).
  - `beforeId` — cursor: return events with `id < beforeId`, newest first.
- **Success:** `200` → `data: { events: AuditEvent[], nextBeforeId: number | null }` where `AuditEvent = { id, adminEmail, action, targetUserId, status: "success" | "failure", reason, createdAt }`.
- **Errors:** `400 invalid_request`, `401 unauthorized`.
- **Privacy:** `reason` is restricted to a strict allowlist of machine-readable categories (plus `keys_<n>`); anything else — including raw error strings that might contain URLs or tokens — is stored as `other`. Audit rows never contain credentials, tokens, request bodies, or metadata values.

---

## Status code summary

| Code | Meaning |
|------|---------|
| 200 | Success |
| 400 | Invalid input, malformed body, missing delete confirmation |
| 401 | No valid admin session |
| 403 | Same-origin check failed on a state-changing request |
| 404 | Target user not found |
| 429 | Rate limit exceeded (sign-in) |
| 502 | SuperTokens Core unreachable or timing out |
