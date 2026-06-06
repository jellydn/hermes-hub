# Architecture

**Analysis Date:** 2026-06-06

## Pattern Overview

**Overall:** Split-stack full-stack app — TanStack Start (SSR React) for pages plus a Hono REST API for mutations and streaming, unified behind a single `fetch` entry in `src/server.ts`.

**Key Characteristics:**
- Single process serves both UI and API; `/api/*` routes to Hono (`server/app.ts`), everything else to TanStack Start (`src/server.ts`)
- Backend domain logic lives in `server/` (SSH, installs, deploys, DB); frontend routes stay thin in `src/routes/` with UI in `src/features/`
- PostgreSQL via Drizzle ORM (`server/db/`) with lazy DB/auth initialization so dev works without `DATABASE_URL`
- Remote VPS operations go through SSH (`server/ssh/`) to deploy and manage Hermes containers on user servers

## Layers

**Entry / Request Routing:**
- Purpose: Dispatch incoming HTTP requests to API or SSR handler
- Location: `src/server.ts`, `scripts/start-production.mjs`
- Contains: TanStack Start `createServerEntry`, path-based fork to `apiApp.fetch`
- Depends on: `server/app.ts`, TanStack Start plugin (via `vite.config.ts`)
- Used by: Vite dev server, production Node HTTP server

**Frontend Routes (TanStack Router):**
- Purpose: File-based routing, auth guards, SSR data loaders
- Location: `src/routes/`, `src/routeTree.gen.ts` (generated), `src/router.tsx`
- Contains: `createFileRoute` definitions, `beforeLoad` hooks, `createServerFn` loaders
- Depends on: `src/features/`, `src/lib/session.ts`, `server/*` snapshot functions
- Used by: TanStack Start SSR pipeline, client-side navigation

**Frontend Features & UI:**
- Purpose: Page components, hooks, forms, client-side API calls
- Location: `src/features/`, `src/components/`, `src/lib/`
- Contains: Dashboard shell, server wizards, install SSE client, provider/telegram/settings UIs
- Depends on: `@/components/ui/`, `@/lib/*` helpers, `/api/*` fetch endpoints
- Used by: Route files in `src/routes/`

**API Layer (Hono):**
- Purpose: REST endpoints for mutations, streaming, and client-fetched snapshots
- Location: `server/app.ts`
- Contains: Route registration, `requireHttps` middleware, magic-link rate limiting, auth proxy
- Depends on: Domain handlers in `server/*.ts` and subdirectories
- Used by: `src/server.ts` (`apiApp.fetch`), client `fetch()` calls from features

**Domain / Backend Services:**
- Purpose: Business logic — SSH, installs, deploys, providers, telegram, web-ui proxy, audit
- Location: `server/` (top-level modules and subdirs: `install/`, `hermes/`, `ssh/`, `web-ui/`, `dashboard/`, `servers/`, `settings/`, `telegram/`)
- Contains: Hono handler functions, workflows, SSH orchestration, snapshot builders
- Depends on: `server/db/`, `server/auth.ts`, `server/credentials.ts`, `server/crypto.ts`
- Used by: `server/app.ts`, `createServerFn` loaders in `src/routes/` and `src/lib/`

**Data / Persistence:**
- Purpose: Schema, connection pooling, migrations
- Location: `server/db/schema.ts`, `server/db/index.ts`, `server/db/health.ts`, `drizzle/`, `drizzle.config.ts`
- Contains: Drizzle table definitions (users, servers, installs, audit_logs, etc.), `getDb()` singleton
- Depends on: `postgres` driver, `DATABASE_URL` env var
- Used by: All `server/` modules that persist or query state

**Shared Contracts:**
- Purpose: Types shared between client and server without importing server code into client bundles
- Location: `shared/contracts/`
- Contains: Health-check and web-ui contract types
- Depends on: Nothing server-specific
- Used by: `server/` handlers and `src/lib/` type consumers

## Data Flow

**Authentication (Magic Link):**
1. User submits email on `src/features/auth/login-page.tsx` via `src/lib/auth-client.ts` (`better-auth/react`)
2. Client calls `/api/auth/send-magic-link` or `/api/auth/*` — proxied in `server/app.ts` to Better Auth handler in `server/auth.ts`
3. `getAuth()` lazily initializes Better Auth with Drizzle adapter (`server/db/schema.ts`), `tanstackStartCookies()`, and `magicLink` plugin
4. Session cookies are read on subsequent requests via `getAuthSession()` in route `createServerFn` loaders or Hono handlers
5. Unauthenticated dashboard routes call `requireSession()` in `src/lib/session.ts`, which redirects to `/login`

**Authenticated Page Load (SSR snapshot):**
1. Route `beforeLoad` in files like `src/routes/dashboard.tsx`, `src/routes/logs.tsx`, `src/routes/ai-provider.tsx` runs `requireSession()` and a `createServerFn` loader in parallel
2. Loader calls `getAuthSession(getRequestHeaders())` then a `server/` snapshot function (e.g. `getDashboardStatusSnapshot` in `server/dashboard.ts`)
3. Snapshot data is returned as route context and consumed by feature page components (e.g. `src/features/dashboard/dashboard-page.tsx` via `AppShell` in `src/features/dashboard/app-shell.tsx`)

**Server Detail (client fetch exception):**
1. `src/routes/servers.$id.tsx` only loads session in `beforeLoad`; no `createServerFn` snapshot
2. `src/features/servers/server-detail-page.tsx` uses `useMountEffect` from `src/lib/use-mount-effect.ts` to `fetch(/api/servers/:id)` on mount
3. `getServerDetail` in `server/server-actions.ts` returns `getServerDetailSnapshot` built from DB + install/action history

**Server Connect & Credential Storage:**
1. `POST /api/servers/connect` (`server/servers.ts` → `connectServer`) validates payload, verifies SSH via `verifyServerConnection` (`server/ssh/connection.ts`)
2. Encrypted credential stored in `servers.encrypted_credential` via `encryptSecret` (`server/crypto.ts`) when `storeCredential` is true
3. Session-scoped credential cached in-memory in `server/credentials.ts` (30-minute TTL) for subsequent SSH ops without re-prompting
4. Audit log inserted sequentially (not transactional) via `insertAuditLog` (`server/lib/insert-audit-log.ts`)

**Install Workflow & SSE:**
1. `POST /api/servers/:id/install` (`server/install.ts` → `startServerInstall`) claims in-memory slot via `tryClaimInstallStream` (`server/install/sse-stream.ts`), upserts install row (`server/install/records.ts`)
2. Background `runInstallWorkflow` (`server/install/workflow.ts`) SSHes to VPS, runs compose deploy steps, emits progress via `emitInstallEvent`
3. `emitInstallEvent` writes `install_events` + updates `installs` in a **single transaction**, then notifies in-memory SSE listeners
4. Client opens `EventSource` on `GET /api/servers/:id/install/events` (`streamServerInstallEvents` in `server/install.ts`); replays hydrated DB events on reconnect via `hydrateInstallEvents`
5. Persisted `install_events` rows are the source of truth; in-memory `installStreams` map (`server/install/sse-stream.ts`) mirrors live delivery

**Server Actions (restart / update / rollback):**
1. `POST /api/servers/:id/actions` (`server/server-actions.ts` → `runServerAction`) resolves SSH creds, runs Hermes runtime commands (`server/hermes/runtime.ts`)
2. On success, audit log + `installs.version` update wrapped in `db.transaction()` so rollout history stays consistent
3. Rollback target resolution: request `targetVersion` → latest `installs.version` from history → `"latest"` (`getRollbackTargetFromHistory` in `server/server-detail-snapshot.ts`)
4. Server action history on list/detail pages comes from `audit_logs` filtered by indexed `audit_logs.server_id` (`server/servers/list.ts`, `getLatestServerActionRecords` in `server/servers/records.ts`)

**Hermes Deploy (provider / persona / MCP / telegram):**
1. Config saved via `POST /api/providers`, `/api/settings/persona`, `/api/settings/mcp-servers`, `/api/telegram/connect` — mostly transactional writes + audit
2. Deploy endpoints (`/api/providers/deploy`, `/api/settings/persona/deploy`, `/api/settings/mcp-servers/deploy`, `/api/telegram/deploy`) SSH to target server and push config via `server/hermes/deploy.ts` and related modules
3. `deployTelegramToServer` (`server/telegram.ts`): SSH deploy succeeds first, then config update + audit log in one transaction

**Web UI Proxy:**
1. `POST /api/servers/:id/web-ui/deploy` deploys Hermes web UI container via SSH (`server/web-ui/deploy.ts`)
2. `GET/ALL /api/servers/:id/web-ui/proxy/*` proxies HTTP through SSH tunnel (`server/web-ui/proxy-http.ts`, `server/web-ui/ssh-forward.ts`)
3. Deploy state persisted in `server_web_ui` table; password encrypted in `server/web-ui/password.ts`

**State Management:**
- Server state: PostgreSQL via Drizzle (`server/db/`)
- Session credentials: in-memory `Map` in `server/credentials.ts` (per-process, TTL-based)
- Install SSE: in-memory `installStreams` map in `server/install/sse-stream.ts` (per-process; DB is replay source)
- Dashboard metrics: short-lived caches in `server/dashboard.ts` and `server/dashboard/metrics.ts` (cleared via `clearDashboardCache` after mutations)
- Client state: React `useState` in feature components; install progress uses `EventSource` + local snapshot merge (`src/features/servers/install-snapshot.ts`)

## Key Abstractions

**Unified Fetch Entry:**
- Purpose: Single server entry multiplexing API and SSR
- Examples: `src/server.ts`
- Pattern: Path-prefix routing (`/api/` → Hono, else TanStack Start `defaultStreamHandler`)

**Lazy Auth & DB:**
- Purpose: Avoid crashing pages when env vars are unset in dev
- Examples: `server/auth.ts` (`getAuth()`, `hasDatabaseUrl()`), `server/db/index.ts` (`getDb()`)
- Pattern: Singleton lazy initialization on first use; auth routes return 503 when DB unavailable

**Request Guards:**
- Purpose: Reusable auth + ownership + SSH credential resolution for Hono handlers
- Examples: `server/request-guards.ts` (`requireAuthSession`, `requireOwnedServer`, `requireOwnedServerSsh`)
- Pattern: Return `Response` on failure; callers check `isResponse()` from `server/lib/is-response.ts`

**SSH Connection Wrapper:**
- Purpose: Establish, verify, and run commands on remote VPS hosts
- Examples: `server/ssh/connection.ts` (`withSshConnection`, `verifyServerConnection`), `server/ssh/errors.ts` (`SshConnectError`)
- Pattern: Callback-based connection lifecycle; OS validation in `server/ssh/os.ts`

**Audit Log Helper:**
- Purpose: Consistent `audit_logs` inserts with optional `serverId` extraction from details
- Examples: `server/lib/insert-audit-log.ts`, action name constants in `server/audit-log-actions.ts`
- Pattern: Accepts transaction or DB writer; used both inside and outside transactions

**Install Stream State:**
- Purpose: Coordinate single in-flight install per server and fan-out SSE events
- Examples: `server/install/sse-stream.ts` (`tryClaimInstallStream`, `emitInstallEvent`, `ensureInstallStream`)
- Pattern: In-memory pub/sub with DB-backed event log; atomic claim before async work

**Server Snapshot Builders:**
- Purpose: Aggregate DB records into typed DTOs for API and SSR loaders
- Examples: `server/server-detail-snapshot.ts`, `server/servers/list.ts`, `server/dashboard.ts`, `server/logs.ts`
- Pattern: Query owned records by `userId`, join latest install/action/provider/telegram state

**createServerFn Loaders:**
- Purpose: Type-safe server-side data fetching for TanStack Start routes
- Examples: `src/routes/dashboard.tsx`, `src/routes/settings.tsx`, `src/lib/load-hermes-deployment-targets.ts`
- Pattern: `createServerFn({ method: "GET" }).handler(...)` called from `beforeLoad`, imports `server/` functions directly

**AppShell Layout:**
- Purpose: Shared authenticated dashboard chrome (nav, header)
- Examples: `src/features/dashboard/app-shell.tsx`
- Pattern: Wrapped by authenticated feature pages (dashboard, servers, settings, logs, telegram, ai-provider)

## Entry Points

**Development Server:**
- Location: `vite.config.ts` → `bun run dev` (port 3000)
- Triggers: `vite dev --port 3000` from `package.json`
- Responsibilities: TanStack Start plugin, React, Tailwind; excludes `node-ssh`/`ssh2` from `optimizeDeps`

**Production Server:**
- Location: `scripts/start-production.mjs`
- Triggers: Docker/deploy after `vite build`; imports `dist/server/server.js` (compiled from `src/server.ts`)
- Responsibilities: Run Drizzle migrations if `DATABASE_URL` set, serve static assets from `dist/client/`, delegate dynamic requests to built server entry

**SSR / API Server Entry:**
- Location: `src/server.ts`
- Triggers: All non-static HTTP requests in dev and prod
- Responsibilities: Route `/api/*` to `apiApp` from `server/app.ts`; all other paths to TanStack Start handler

**Hono API Router:**
- Location: `server/app.ts`
- Triggers: `/api/*` requests
- Responsibilities: Register ~40 endpoints (servers, install, actions, dashboard, logs, providers, settings, telegram, web-ui, auth, health)

**Client Router:**
- Location: `src/router.tsx`, `src/routeTree.gen.ts`
- Triggers: Browser navigation, SSR route matching
- Responsibilities: File-based route tree, scroll restoration, intent-based preloading

## Error Handling

**Strategy:** JSON error responses from Hono handlers; typed SSH errors; redirect for unauthenticated pages; graceful degradation for health checks.

**Patterns:**
- Hono handlers return `context.json({ error: "..." }, status)` for 400/401/404/409/426/429/503 (`server/app.ts`, `server/servers.ts`, `server/install.ts`, etc.)
- `requireOwnedServer*` guards in `server/request-guards.ts` return `Response` objects checked via `isResponse()` before proceeding
- SSH failures normalized through `SshConnectError` and `normalizeSshError` (`server/ssh/errors.ts`); connect flow catches and returns user-facing messages
- `GET /api/health` returns `degraded` status with DB error message instead of throwing (`server/app.ts`)
- Production mutating routes use `requireHttps()` middleware — rejects non-HTTPS with 426 (`server/app.ts`)
- Client components set local error state on failed fetches (e.g. `src/features/servers/server-detail-page.tsx`, `src/features/servers/install-progress.tsx`)

## Cross-Cutting Concerns

**Logging:** Operational history stored in `audit_logs` table (`server/db/schema.ts`) via `insertAuditLog`; UI log viewer reads snapshots from `server/logs.ts`. No structured application logger — `console.error` in production static server (`scripts/start-production.mjs`).

**Validation:** Ad-hoc request parsing in Hono handlers (e.g. `parseConnectRequest` in `server/servers.ts`); Zod schemas in settings/MCP modules (`server/settings/mcp.ts`); Docker tag validation in `server/hermes/runtime.ts` (`isValidDockerTag`). Frontend uses `react-hook-form` + `@hookform/resolvers` in wizard/forms.

**Authentication:** Better Auth with magic-link plugin (`server/auth.ts`); lazy init; `BETTER_AUTH_URL` + `BETTER_AUTH_SECRET` required in production. Client uses absolute SSR base URL in `src/lib/auth-client.ts`. Magic-link sending rate-limited (3 per 5 min per email) in `server/app.ts`. Session required for all `/api/*` mutations except `/api/health` and auth routes.

**Encryption:** Secrets encrypted at rest via `encryptSecret`/`decryptSecret` (`server/crypto.ts`) for SSH credentials, API keys, MCP env headers, web-ui passwords.

**Transactions:** Used when coupled writes must stay consistent — install events + install row (`server/install/sse-stream.ts`), server actions + version (`server/server-actions.ts`), telegram deploy state (`server/telegram.ts`), MCP CRUD + audit (`server/settings/mcp.ts`), provider save (`server/providers.ts`), web-ui deploy record (`server/web-ui/deploy.ts`). Sequential primary + audit is acceptable when audit absence does not cause divergence (e.g. server connect, install start).

---

*Architecture analysis: 2026-06-06*
