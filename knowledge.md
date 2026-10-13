# SuperTokens Admin Portal — Project Specification

## 1. Project Goal

Build a standalone, secure web application for administering an existing self-hosted SuperTokens deployment. The application must provide an administrative interface for browsing and managing users and authentication-related data without requiring direct edits to SuperTokens database tables.

This is an independent admin portal. It must connect to the existing SuperTokens Core and must not replace, fork, or reimplement SuperTokens authentication.

## 2. First Steps: Inspect Before Implementing

Before writing code, inspect the repository and identify its existing framework, package manager, code conventions, UI components, and testing setup. Reuse existing patterns where appropriate.

Identify the actual versions and configuration of the target SuperTokens deployment. The current known environment may include:

- Next.js App Router in existing applications
- `supertokens-node` around version `9.2.3`
- `supertokens-auth-react` around version `0.50.0`
- A self-hosted SuperTokens Core reachable at a configured URL such as `https://auth.bytecraft.ir`

These are context, not assumptions. Verify target versions and compatibility before selecting SDK methods or imports. Do not blindly upgrade dependencies or copy APIs from documentation for a newer SDK version.

Read the official SuperTokens documentation relevant to the installed version:

- Dashboard setup: https://supertokens.com/docs/post-authentication/dashboard/initial-setup
- User management: https://supertokens.com/docs/post-authentication/dashboard/users-listing-and-details
- Common user-management operations: https://supertokens.com/docs/post-authentication/user-management/common-actions
- Core security and API keys: https://supertokens.com/docs/platform-configuration/supertokens-core/api-keys
- Self-hosting and Core security: https://supertokens.com/docs/deployment/self-host-supertokens

If this repository is empty, propose and document a maintainable project structure before implementing it.

## 3. Architecture Requirements

### 3.1 General architecture

- Use a web frontend and a server-side backend/API layer.
- All privileged SuperTokens SDK calls must run on the server.
- The browser must never connect directly to SuperTokens Core or the SuperTokens database.
- The SuperTokens Core URL and API key must be server-only environment variables.
- Never expose secrets through `NEXT_PUBLIC_*` variables, client-side bundles, API responses, logs, or error messages.
- Use official SuperTokens Node.js SDK APIs supported by the installed version.
- Do not implement a second authentication system for ordinary end users. This is a restricted administrative application.
- Keep the admin portal logically separate from applications that use SuperTokens for end-user authentication.

### 3.2 Recommended implementation approach

Prefer a custom admin portal if the goal is a standalone application with its own interface. Use the official SuperTokens SDK and supported user-management APIs for data and operations.

Do not access or modify SuperTokens database tables directly. Database access may be used for read-only diagnostics only if explicitly justified and documented; it must not be the normal application integration path.

Do not assume that the official SuperTokens Dashboard recipe can be hosted independently without additional backend configuration. Verify integration requirements and version compatibility first. If the official dashboard fully satisfies the requirements, document that option before building redundant functionality.

### 3.3 Configuration

Use environment variables, validated on server startup:

- `SUPERTOKENS_CONNECTION_URI` — URL of the existing SuperTokens Core
- `SUPERTOKENS_API_KEY` — API key configured on Core, if required by the deployment
- `ADMIN_ALLOWED_EMAILS` or an equivalent server-side allowlist for authorized administrators
- `APP_BASE_URL` — canonical public URL of this admin application
- Any application-specific session, database, or audit-log configuration required by the chosen architecture

Provide `.env.example` containing placeholders only. Never commit real credentials.

Fail safely at startup if required configuration is missing or invalid. Do not silently fall back to a public or demo SuperTokens Core.

## 4. Authentication and Authorization

The admin portal must be inaccessible to unauthenticated or unauthorized users.

- Require a secure administrator sign-in mechanism. Prefer a well-supported authentication solution and document the chosen approach.
- If using SuperTokens to authenticate administrators, configure the admin application carefully so that only explicitly authorized admin identities can access it.
- Enforce authorization on the server for every protected page action and API endpoint. Hiding UI controls is not authorization.
- Maintain an explicit server-side administrator allowlist or equivalent role-based policy.
- Deny access by default if the administrator identity cannot be verified.
- Protect state-changing requests against CSRF where applicable.
- Use secure, HttpOnly cookies for browser sessions when supported by the chosen authentication design.
- Apply rate limits to sign-in and sensitive administrative operations.
- Add logout and session expiration handling.
- Do not rely on a secret URL, a client-side check, or an IP address alone as the admin authorization mechanism.

## 5. Core Features

### 5.1 Overview page

Show a concise operational overview, where supported by SDK APIs:

- Total user count
- Recently created users
- User counts by available authentication method, if obtainable reliably
- Connection/configuration status for SuperTokens Core
- A clear error state if Core is unavailable

Do not display fabricated, stale, or estimated values as live facts. Avoid excessive polling.

### 5.2 User list

Provide a searchable, paginated user table.

Display available information such as:

- SuperTokens user ID
- Email address(es), if present
- Phone number(s), if present
- Sign-up/creation time
- Authentication method(s), if available
- Email/phone verification status, if available
- Tenant IDs, where relevant

Requirements:

- Support server-side pagination using the SDK's pagination mechanism.
- Support searching by user ID, email, and phone number where the installed SDK supports it.
- Include loading, empty, error, and retry states.
- Make the list usable on desktop and smaller screens.
- Do not retrieve every user into memory to implement pagination or search.
- Treat email, phone, and user metadata as personal data; only show them to authorized administrators.

### 5.3 User detail page

Display the selected user's supported profile and authentication details:

- User ID and creation time
- Linked login methods/accounts, if available
- Email addresses and verification state
- Phone numbers and verification state
- Tenant associations, where relevant
- User metadata, if configured and supported
- Session information, only where supported through documented APIs

Clearly distinguish fields owned by SuperTokens from fields stored in the application's own database. Do not imply that application-specific fields are stored in SuperTokens unless verified.

### 5.4 Supported user operations

Implement only operations supported by the installed SuperTokens SDK or documented APIs.

Potential operations include:

- Retrieve user details
- Update supported user metadata or profile information
- Revoke a user's sessions, if supported by the installed SDK/API
- Delete a user
- View relevant account/login-method details

For each operation:

- Validate all inputs on the server.
- Verify the current administrator's permission.
- Display a confirmation for destructive or security-sensitive actions.
- Return a clear success or failure result.
- Handle “user not found,” conflicts, unsupported operations, Core connectivity failures, and authorization errors.
- Record an audit event without logging credentials, tokens, API keys, OTPs, or unnecessary personal data.

Do not offer password editing, phone-number editing, email editing, role assignment, or other operations unless the exact operation is supported and its security implications are understood. Prefer official APIs over custom SQL.

### 5.5 Delete-user safety

Deleting a user can permanently remove account data and sessions. The interface must:

- Require explicit confirmation.
- Show the affected user's ID and available identifying information.
- Prevent accidental repeated submissions.
- Report the result accurately.
- Explain that deleting a database-backed session does not necessarily invalidate an already-issued stateless access token immediately in every configuration. Follow official guidance for the deployed SDK and session-verification policy.

Never delete a user automatically as a side effect of opening a page or running a search.

### 5.6 Application-side user records

If the existing product stores additional user data in another database (for example, a Prisma-managed application database), do not assume that deleting a SuperTokens user should automatically delete the corresponding application record.

Document the relationship and implement a deliberate, configurable policy:

- Keep the application record,
- delete it as part of a verified workflow, or
- mark it as deleted/disabled.

Use a transaction or compensating-action strategy where possible. Explain partial-failure behavior. Do not invent database models or schema changes before inspecting the repository.

### 5.7 Audit log

Maintain an audit trail for sensitive administrative actions, preferably in the admin application's own database.

Record:

- Administrator identity
- Action name
- Target user ID, when applicable
- Timestamp
- Success/failure status
- A sanitized reason or error category

Do not record API keys, session tokens, OTPs, passwords, full request headers, or unnecessary personal information. Restrict audit-log access and document retention considerations.

## 6. User Interface and Experience

Build a professional, simple admin interface with:

- Navigation for Overview, Users, and Audit Log
- Search, pagination, and useful filters
- User detail view
- Clear labels for irreversible operations
- Accessible forms, keyboard navigation, and readable contrast
- Responsive layout
- Consistent loading, empty, success, and error states
- Explicit confirmation dialogs for destructive actions
- No fake analytics or placeholder buttons presented as working functionality

Reuse existing UI components and styling conventions. Before creating a new component, search the codebase for an existing equivalent.

## 7. API Design

Create server-side endpoints/actions for the required functionality. The exact routing convention must follow the selected framework and existing project structure.

Expected logical operations include:

- `GET /api/admin/health` — check admin service and Core connectivity without exposing secrets
- `GET /api/admin/users` — list/search/paginate users
- `GET /api/admin/users/:userId` — retrieve a user's details
- `PATCH /api/admin/users/:userId/metadata` — update supported metadata, if enabled
- `POST /api/admin/users/:userId/revoke-sessions` — revoke sessions, if supported
- `DELETE /api/admin/users/:userId` — delete a user after server-side authorization
- `GET /api/admin/audit-logs` — retrieve audit events for authorized administrators

These are logical API requirements, not a mandate to use these exact paths. Follow the chosen framework's conventions.

For every endpoint:

- Document method, path, purpose, authentication/authorization requirements, parameters, validation, response schema, and possible errors in `API.md`.
- Use consistent JSON response formats.
- Validate path parameters, query parameters, and request bodies.
- Return appropriate HTTP status codes.
- Do not return stack traces, internal configuration, or secrets.
- Enforce authorization on the server.
- Add tests for both allowed and denied access.

Do not expose a generic proxy that allows the browser to send arbitrary requests to SuperTokens Core.

## 8. Security Requirements

- Keep SuperTokens Core on a private network wherever possible.
- If Core is reachable beyond trusted backend services, configure a strong Core API key, TLS, and restrictive firewall/reverse-proxy rules. A URL base path is not an access-control mechanism.
- Do not put the Core API key in frontend code.
- Use HTTPS in production.
- Apply least privilege to administrators.
- Add CSRF protection as applicable, secure cookie settings, input validation, rate limiting, and safe error handling.
- Prevent IDOR by checking authorization for every target user ID and every sensitive operation.
- Avoid open redirects and unsafe dynamic URL construction.
- Sanitize and minimize audit logs.
- Do not expose raw SuperTokens Core responses if they contain internal information.
- Use dependency versions compatible with the current project and review security advisories.
- Provide a production security checklist before deployment.

## 9. Reliability and Error Handling

Handle at least:

- SuperTokens Core unavailable or timing out
- Invalid/missing API key
- Unsupported SDK/API operation
- Invalid input
- User not found
- Duplicate or conflicting data
- Unauthorized/forbidden administrator
- Pagination edge cases
- Partial failure between SuperTokens and the application's own database

Use reasonable timeouts. Do not automatically retry destructive operations unless idempotency and the operation's behavior are understood.

## 10. Testing Requirements

Add automated tests appropriate to the project:

- Unit tests for validation, authorization, and service-layer behavior
- API tests for success and failure paths
- Tests proving unauthenticated users cannot access admin APIs
- Tests proving non-admin users cannot perform admin operations
- Tests for pagination and search
- Tests for destructive-action confirmation logic where applicable
- Tests for Core unavailability and invalid configuration
- Tests for audit-log redaction
- Linting, type checking, and build verification

Use mocks or a dedicated test Core/environment where appropriate. Never run destructive tests against production user data.

## 11. Documentation Requirements

Create and maintain:

### `DOCUMENT.md`

Document:

- Project purpose and scope
- Architecture and request flow
- Technology choices
- Environment variables
- Local development and production deployment
- Authentication and authorization model
- User-management capabilities and limitations
- Relationship to SuperTokens Core and any application database
- Security considerations
- Testing and troubleshooting

### `API.md`

Document every implemented API endpoint with:

- Method and path
- Description
- Authentication and authorization requirements
- Query/path/body parameters
- Request and response examples
- Status codes and error responses
- Pagination behavior
- Relevant security considerations

### `.env.example`

List all required environment variables with safe placeholder values only.

Update documentation whenever an endpoint, configuration variable, or user-management behavior changes.

## 12. Suggested Structure

Adapt this structure to the chosen framework rather than forcing it onto an existing codebase:

```text
src/
  app/
    (admin)/
      overview/
      users/
      audit-logs/
    api/
      admin/
  components/
    layout/
    users/
    forms/
    feedback/
  lib/
    auth/
    authorization/
    config/
    supertokens/
    validation/
    audit/
  services/
    users/
    sessions/
  types/
  tests/
API.md
DOCUMENT.md
.env.example
```

Keep SDK access in a dedicated server-side integration/service layer. UI components must not import privileged SuperTokens SDK modules.

## 13. Implementation Plan

Work in small, verifiable phases:

1. Inspect the repository, dependencies, and target SuperTokens versions.
2. Write a brief architecture proposal and identify any version-specific API uncertainties.
3. Set up configuration validation, admin authentication, authorization, and the server-only SuperTokens client/service layer.
4. Implement Core health checks and read-only user listing.
5. Implement user details, pagination, and supported search.
6. Add only verified metadata/session/user operations.
7. Add audit logging and careful handling of cross-database consistency.
8. Add tests, linting, type checks, and build verification.
9. Complete `API.md`, `DOCUMENT.md`, and `.env.example`.
10. Provide a deployment checklist and explicitly list any feature that could not be implemented with the installed SDK/version.

After each phase, run the relevant checks and report what changed, what was tested, and any remaining limitations.

## 14. Acceptance Criteria

The project is complete when:

- An authorized administrator can securely sign in and sign out.
- Unauthenticated and non-admin users cannot access protected pages or APIs.
- The administrator can list, search, paginate, and inspect SuperTokens users.
- Every implemented mutation uses a supported SuperTokens API and is protected by server-side authorization.
- Destructive actions require confirmation and are audited.
- Secrets are only available server-side and are absent from client bundles and logs.
- Core connectivity errors are handled without exposing internal secrets.
- No normal user-management workflow directly edits SuperTokens database tables.
- Automated tests, linting, type checks, and production build pass.
- `API.md`, `DOCUMENT.md`, and `.env.example` are complete and accurate.
- The final handoff identifies the installed SDK/Core versions tested and any known limitations.

## 15. Important Constraints

- Do not guess SDK APIs. Verify each import, method, and parameter against the installed package and matching official documentation.
- Do not upgrade SuperTokens or the application framework without documenting the reason and obtaining approval.
- Do not introduce an unrelated database, authentication system, or deployment platform unless the project demonstrably requires it.
- Do not claim an operation works until it has been implemented and tested.
- Prioritize security, maintainability, and compatibility with the existing self-hosted SuperTokens deployment.
