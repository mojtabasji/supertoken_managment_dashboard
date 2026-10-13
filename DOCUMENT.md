# SuperTokens Admin Portal — Project Documentation

## 1. Purpose and scope

A self-hosted web portal for administering users of an application backed by [SuperTokens](https://supertokens.com) (Core + `supertokens-node` SDK). Administrators can:

- Sign in with an email allowlist + shared password (no SuperTokens auth for admins themselves).
- View service health and Core connectivity.
- List, search, and paginate users.
- View user details, update user metadata, revoke sessions, and delete users.
- Browse a sanitized audit trail of sensitive administrative actions.

Out of scope: managing SuperTokens Core itself, non-admin (end-user) authentication flows, and any generic proxy to the Core API.

## 2. Technology stack

- **Framework:** Next.js (App Router, React Server Components), TypeScript.
- **Auth SDK:** `supertokens-node` (users, sessions, passwordless/third-party recipes as configured).
- **Audit storage:** SQLite via `better-sqlite3` (synchronous, WAL mode).
- **Styling:** Tailwind CSS.
- **Tests:** Vitest (`npm run test`).
- **Lint / types:** ESLint (`npm run lint`), `tsc --noEmit` (`npm run typecheck`).

## 3. Architecture

```
src/
  app/
    (admin)/            # Admin UI pages (Overview, Users, User detail, Audit log)
    login/              # Sign-in page
    api/admin/          # Route handlers — the only server entry points
  components/           # Shared UI (feedback, layout, users)
  lib/
    audit/              # SQLite audit trail (audit.ts)
    auth/               # Session, credentials, rate limiting, API guard
    client/             # Browser-side API client (typed fetch wrappers)
    config/             # Environment loading + validation (env.ts)
    http/               # JSON envelope helpers, body parsing, rate-limit keying
    supertokens/        # SDK wrappers (Core access lives only here)
    validation/         # Pure validation for params, query, bodies
  tests/                # Vitest suites (API, guard, validation, audit, …)
  types/                # Shared DTO types
```

Key principles:

- **Single Core access boundary.** All SuperTokens Core calls go through `src/lib/supertokens/*`. Nothing else constructs Core URLs or reads `SUPERTOKENS_API_KEY`. There is intentionally no generic proxy endpoint.
- **SDK initialization spans module graphs.** `src/instrumentation.ts` runs `initSuperTokens()` at server start, and every SDK-using function in `src/lib/supertokens/users.ts` calls it again before use. The init guard in `src/lib/supertokens/client.ts` is deliberately module-local: the instrumentation hook and route handlers run in separate module graphs, each with its own copy of the SDK, and each copy must be initialized on its own. A shared `globalThis` flag would let one copy mark itself initialized while the other's SDK stays uninitialized. Related: `supertokens-node` must stay **out of `serverExternalPackages`** (only `better-sqlite3` is listed there) — externalizing it splits the SDK into two copies whose `Querier` singletons diverge and abort startup.
- **Server-side authorization.** Every admin route calls `requireApiAdmin()` first; the browser cannot reach admin data without a valid session cookie, and state-changing routes additionally enforce a same-origin check (`enforceSameOriginMutation`) against `APP_BASE_URL`.
- **Validation at the boundary.** Path params, query params, and bodies are validated by pure functions in `src/lib/validation/params.ts` before any SDK call.
- **Consistent envelopes.** All API responses use `{ ok: true, data }` / `{ ok: false, error: { code, message } }` (`src/lib/http/api.ts`). Bodies are capped at 32 KiB.

## 4. Audit log

Implemented in `src/lib/audit/audit.ts`; stored in the portal's own SQLite database (`AUDIT_DB_PATH`, default `data/audit.db`) — never in SuperTokens tables.

- **What is recorded:** admin email, normalized action name, target user id, status (`success`/`failure`), a machine-readable reason category, and an ISO timestamp.
- **What is never recorded:** credentials, tokens, API keys, OTPs, request bodies, or metadata values. For metadata updates only the key count (`keys_<n>`) is stored.
- **Redaction guarantee:** the `reason` value is filtered through a strict allowlist; anything unknown collapses to `"other"`. A test proves that a raw error string containing a secret and URL never reaches the database.
- **Write failures never break requests:** `recordAuditEvent` catches all errors (including database-open failures) and logs to the server console instead.
- **Singleton handle:** `better-sqlite3` is not thread-safe; the database handle is a `globalThis` singleton, closed in tests via `closeAuditDbForTests()`.
- The `data/` directory is runtime-only and excluded from builds/deployments.

## 5. Authentication and authorization model

1. **Allowlist gate:** only emails listed in `ADMIN_EMAILS` may authenticate, regardless of password knowledge.
2. **Shared password:** `ADMIN_PASSWORD` (≥ 12 chars) verified with constant-time comparison (`src/lib/auth/credentials.ts`).
3. **Rate limiting:** sign-in attempts per client IP (`src/lib/auth/rate-limit.ts`); the client address is never trusted for authorization, only for rate-limit keying.
4. **Session cookie:** HMAC-signed cookie (`SESSION_SECRET`), validated server-side (`src/lib/auth/session.ts`). Logout clears it.
5. **Guard:** `requireApiAdmin()` on every route; returns `401` uniformly for missing/expired/invalid sessions.

## 6. Error handling and reliability

- Core outages/timeouts surface as `502 core_unavailable` with a sanitized category (`classifyCoreError`), never raw SDK errors.
- User-not-found is checked *before* metadata writes and session revocation (Core's metadata store is independent of the user store).
- Destructive delete requires the `X-Confirm-Delete` header echoing the exact userId.
- Every audited operation records success/failure outcomes, so partial failures between SuperTokens and the portal's own database are visible in the trail.

## 7. Environment configuration

See `.env.example` for the authoritative list:

| Variable | Required | Purpose |
|----------|----------|---------|
| `SUPERTOKENS_CONNECTION_URI` | yes | Core URL; app fails fast without it |
| `SUPERTOKENS_API_KEY` | yes (may be empty only if Core has no keys) | Core API key — server-side only |
| `ADMIN_EMAILS` | yes | Comma-separated admin allowlist |
| `ADMIN_PASSWORD` | yes | Shared admin password (≥ 12 chars) |
| `SESSION_SECRET` | yes | Cookie HMAC secret (≥ 32 chars entropy) |
| `APP_BASE_URL` | yes | Canonical URL for origin checks and cookie flags |
| `AUDIT_DB_PATH` | no | Audit SQLite path (default `data/audit.db`) |

Env is loaded and validated once in `src/lib/config/env.ts` (memoized; `resetEnvCacheForTests()` in tests). Missing required values fail startup loudly — no silent defaults for secrets.

**Proxy behavior:** at server start (`src/instrumentation.ts`) the hostname(s) parsed from `SUPERTOKENS_CONNECTION_URI` are appended to `NO_PROXY`/`no_proxy` (existing entries are preserved). Core traffic is a direct backend connection and must not go through a shell-configured `HTTPS_PROXY`: the SDK's axios (0.21.x) cannot tunnel https through an http proxy, so proxied Core requests fail even when the Core is reachable directly. Note that this means the proxy cannot be used *as* the route to the Core — reach the Core directly or terminate the proxy in front of it.

## 8. Local development

```bash
cp .env.example .env.local   # fill in real values
npm install
npm run dev                  # http://localhost:3000
```

Commands:

| Command | Purpose |
|---------|---------|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript (`tsc --noEmit`) |
| `npm run test` | Vitest suite |

## 9. Testing

Vitest suites in `src/tests/`:

- **API behavior:** login (success, rate limiting, invalid credentials), user list/search/pagination, user actions (delete confirmation, metadata validation, revoke sessions, Core-outage classification).
- **Security:** guard tests prove unauthenticated access is rejected; session and credential tests cover parsing and constant-time comparison.
- **Audit:** pagination, allowlist redaction (secret/URL never stored), action normalization, and the never-throw guarantee on write failures.
- **Validation & env:** pure-function tests for every validator and env parsing.

SuperTokens Core is stubbed in `src/tests/stubs/`; tests never touch production user data.

## 10. Production security checklist

- Keep Core on a private network; if reachable more widely, configure a strong Core API key, TLS, and firewall rules (a URL base path is not access control).
- Serve the portal over HTTPS; set `APP_BASE_URL` to the exact public origin.
- Use a unique, high-entropy `SESSION_SECRET` and `ADMIN_PASSWORD` from a secret manager; rotate on any suspected exposure.
- Keep `ADMIN_EMAILS` minimal (least privilege).
- Do not expose the `data/` directory or commit the audit database.
- Run `npm audit` and review advisories before releases.
- Ensure the deployment does not ship `.env.local` or build-time secrets; all Core credentials stay server-side.

## 11. Known limitations

- Admin identities are a flat email allowlist with a shared password (no per-admin MFA or password rotation flows).
- Audit storage is a local SQLite file; multi-instance deployments need a shared store or sticky routing.
- Sign-in rate limiting is in-memory per process; restart or multi-instance topologies reset/fragment the counters.
