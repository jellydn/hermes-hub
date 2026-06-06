# Architecture

**Analysis Date:** 2026-06-06

## Pattern Overview

**Overall:** Full-stack React application with TanStack Start (React Server Components) + Hono API server, following a split frontend/backend architecture with shared TypeScript types.

**Key Characteristics:**
- TanStack Start for SSR/SSG with file-based routing
- Hono for lightweight API server handling `/api/*` routes
- Better Auth for authentication (magic link email flow)
- Drizzle ORM with PostgreSQL for type-safe database access
- SSH-based remote server orchestration (node-ssh/ssh2)
- In-memory SSE streams for real-time install progress with DB persistence
- Transactional audit logging for critical operations
- Component-driven UI with Radix UI primitives and custom design tokens

## Layers

**Frontend (TanStack Start + React):**
- Purpose: Server-rendered UI, client-side interactions, routing, auth state
- Location: `src/`
- Contains: Routes (`src/routes/`), feature components (`src/features/`), shared UI (`src/components/ui/`), lib utilities (`src/lib/`)
- Depends on: API layer via fetch, shared types from `src/lib/*.ts`
- Used by: Browser clients, SSR entrypoint

**Backend API (Hono):**
- Purpose: RESTful API endpoints, authentication, server orchestration, install workflows, SSH operations
- Location: `server/`
- Contains: Route handlers (`server/app.ts`), domain modules (`server/servers/`, `server/install/`, `server/ssh/`, `server/telegram/`, etc.), DB access (`server/db/`), shared libs (`server/lib/`)
- Depends on: Drizzle DB, node-ssh, Better Auth, rate-limiter-flexible
- Used by: Frontend via `/api/*`, webhook callbacks (Telegram)

**Database (Drizzle + PostgreSQL):**
- Purpose: Persistent storage for users, servers, installs, audit logs, providers, Telegram config
- Location: `server/db/schema.ts`, migrations in `drizzle/`
- Contains: Tables for users, sessions, servers, installs, install_events, ai_providers, telegram_configs, server_web_ui, audit_logs
- Depends on: PostgreSQL, Drizzle ORM
- Used by: Backend API, auth system

**SSH Orchestration Layer:**
- Purpose: Secure remote command execution, host key verification, OS detection
- Location: `server/ssh/connection.ts`, `server/ssh/errors.ts`, `server/ssh/host-key-fingerprint.ts`, `server/ssh/os.ts`
- Contains: Connection pooling, host key pinning, fingerprint matching, OS parsing
- Depends on: node-ssh, ssh2
- Used by: Server connect, install workflow, server actions, web UI proxy

**Install Workflow Engine:**
- Purpose: Multi-step Hermes agent installation with live progress via SSE
- Location: `server/install/workflow.ts`, `server/install/sse-stream.ts`, `server/install/records.ts`
- Contains: Step definitions, in-memory event streams, DB persistence, idle timeout handling
- Depends on: SSH layer, DB, SSE streaming
- Used by: `/api/servers/:id/install` endpoint, frontend install progress page

## Data Flow

**Authentication Flow (Magic Link):**
1. User submits email on `/login` → POST `/api/auth/send-magic-link`
2. Better Auth generates magic link, sends email via `sendMagicLinkEmail`
3. User clicks link → GET `/api/auth/sign-in/magic-link?token=...`
4. Better Auth validates token, sets session cookie via `tanstackStartCookies`
5. Frontend `requireSession` loader validates session on protected routes

**Server List Dashboard:**
1. Browser navigates to `/dashboard` → `beforeLoad` calls `loadDashboardStatus` server function
2. Server function calls `getAuthSession` → `getDashboardStatusSnapshot` (server/dashboard/summaries.ts)
3. Dashboard snapshot queries: servers, latest installs, latest actions, provider/Telegram status
4. Returns aggregated `DashboardStatus` → rendered in `DashboardStatusOverview`

**Server Detail & Actions:**
1. Browser navigates to `/servers/:id` → `useMountEffect` fetches `/api/servers/:id`
2. API `getServerDetail` → `getServerDetailSnapshot` (server/server-detail-snapshot.ts)
3. Snapshot loads: server record, latest install, action history (audit_logs), rollback target, web UI config
4. User triggers action (restart/update/rollback) → POST `/api/servers/:id/actions`
5. `runServerAction` resolves SSH config, executes command via `withSshConnection`
6. On success: transaction writes audit log + updates install version (for update/rollback)
7. Frontend polls or uses SSE for install progress via `/api/servers/:id/install/events`

**Install Progress (SSE + DB):**
1. POST `/api/servers/:id/install` → `startServerInstall` claims stream, creates DB install row
2. Background workflow runs SSH commands step-by-step
3. Each step calls `emitInstallEvent` → inserts `install_events` row + updates `installs` row in transaction
4. In-memory `installStreams` Map notifies listeners (SSE connections)
5. GET `/api/servers/:id/install/events` streams events via SSE
6. On reconnect: `ensureInstallStream` hydrates from `install_events` table

**Telegram Bot Deploy:**
1. User configures bot token → POST `/api/telegram/connect`
2. User approves pairing → POST `/api/telegram/pairings/approve`
3. POST `/api/telegram/deploy` → `deployTelegramToServer` runs SSH deploy
4. On success: transaction updates `telegram_configs` with deployed server info + audit log

## Key Abstractions

**Server Detail Snapshot:**
- Purpose: Aggregated view for server detail page (server + install + actions + rollback + web UI)
- Examples: `src/lib/server-detail.ts`, `server/server-detail-snapshot.ts`
- Pattern: Server function returns typed snapshot; frontend consumes via route loader or `useMountEffect`

**Install Stream State:**
- Purpose: In-memory SSE state machine for live install progress
- Examples: `server/install/sse-stream.ts` (`InstallStreamState`, `installStreams` Map)
- Pattern: Per-server Map keyed by `serverId`; runId prevents stale listeners; transactional DB sync

**SSH Connection Wrapper:**
- Purpose: Lifecycle-managed SSH connection with host key verification
- Examples: `server/ssh/connection.ts` (`withSshConnection`, `establishSshConnection`)
- Pattern: Higher-order function `withSshConnection(input, run)` ensures dispose on error/success

**Audit Log Actions:**
- Purpose: Structured action names for querying server history
- Examples: `server/audit-log-actions.ts` (`FINISHED_SERVER_ACTION_NAMES`)
- Pattern: Constants for `server.action.{restart|update|rollback}.{succeeded|failed}`

**Dashboard Status Snapshot:**
- Purpose: Single response for dashboard overview (server count, health, integrations)
- Examples: `server/dashboard/summaries.ts` (`getDashboardStatusSnapshot`)
- Pattern: Parallel queries aggregated into typed response

## Entry Points

**SSR Entrypoint:**
- Location: `src/server.ts`
- Triggers: HTTP request to any non-/api/* path
- Responsibilities: Routes `/api/*` to Hono app, everything else to TanStack Start handler

**API Server (Hono):**
- Location: `server/app.ts`
- Triggers: HTTP request to `/api/*`
- Responsibilities: Auth routes, server CRUD, install workflow, server actions, web UI proxy, providers, Telegram, logs, dashboard, health check

**Database Initialization:**
- Location: `server/db/index.ts` (`getDb()`)
- Triggers: First DB access in any server module
- Responsibilities: Lazy singleton Drizzle instance with connection pool

**Authentication:**
- Location: `server/auth.ts` (`getAuth()`)
- Triggers: First auth request (lazy initialization)
- Responsibilities: Better Auth instance with Drizzle adapter, magic link plugin, TanStack Start cookies

**Route Tree:**
- Location: `src/routeTree.gen.ts` (generated)
- Triggers: Build time (`tanstack-router` plugin)
- Responsibilities: Type-safe route definitions for all file-based routes

## Error Handling

**Strategy:** Layered error handling with typed error responses, audit logging for failures, and graceful degradation.

**Patterns:**
- SSH errors normalized via `normalizeSshError` → `SshConnectError` with codes (`host_key_mismatch`, `auth_failed`, `connection_timeout`)
- API endpoints return `{ error: string }` with appropriate HTTP status (400, 401, 404, 426, 503)
- `requireHttps` middleware rejects non-HTTPS in production (426 Upgrade Required)
- Database connection failures return degraded health check response
- Install workflow errors emit `failed` event + persist to DB; stream auto-cleans on idle timeout
- Frontend `useMountEffect` handles fetch errors with loading/error states

## Cross-Cutting Concerns

**Logging:**
- Structured audit logs in `audit_logs` table (action, details JSON, server_id, ip, user_id)
- Install events persisted to `install_events` for replay
- Server actions logged at start/success/failure
- No application-level request logging (relies on reverse proxy)

**Validation:**
- Zod-like manual validation in API handlers (e.g., Docker tag regex, required fields)
- Frontend form validation via `validateServerBasicsDraft` helpers
- Database constraints (NOT NULL, FK, unique indexes) as final guard

**Authentication:**
- Better Auth with magic link (email only, no passwords)
- Session cookies via `tanstackStartCookies` plugin
- Lazy auth initialization to avoid crash when `DATABASE_URL` unset
- `requireSession` loader protects dashboard routes; API checks session per-request
- `requireHttps` middleware on all mutating endpoints in production

**Rate Limiting:**
- Magic link: 3 requests per 5 minutes per email (in-memory `RateLimiterMemory`)

**HTTPS Enforcement:**
- Production-only middleware checks `x-forwarded-proto` header or URL protocol
- Assumes TLS-terminating reverse proxy (Caddy/nginx) that overwrites header

---

*Architecture analysis: 2026-06-06*
