# Architecture

**Analysis Date:** 2026-06-02

## Pattern Overview

**Overall:** Single-instance, full-stack TanStack Start app with a Hono REST API mounted at `/api/*`, a Drizzle/Postgres data layer, and SSH-driven side effects against a remote Hermes VPS. The server entrypoint `src/server.ts` is a thin demultiplexer: `/api/*` requests are handed to `server/app.ts`; everything else flows through TanStack Start's stream handler.

**Key Characteristics:**
- **Two-runtime split:** TanStack Start (file-based routes, server functions, SSR) for pages; Hono (`server/app.ts`) for the REST/SSE API. Both share the same Node process and the same `server/` business logic.
- **Lazy failures over module-load failures:** Auth (`server/auth.ts`), DB (`server/db/index.ts`), and email transport (`server/lib/send-magic-link-email.ts`) initialize on first call so missing env vars surface as request-time errors instead of crashing boot.
- **Single-instance, in-process state:** install SSE streams (`server/install/sse-stream.ts`), session credentials (`server/credentials.ts`), magic-link rate limiter (`server/app.ts`), and dashboard caches (`server/dashboard.ts`) are all module-level and explicitly non-shared across nodes (see `CONTEXT.md` → "Single-Instance Boundary").
- **Persistence-first install events:** `install_events` rows are the source of truth; the in-memory SSE stream is a hydrated mirror. `installs.log` is a legacy read-fallback column — never written (`AGENTS.md` Data Flow Conventions).
- **HTTPS-gated mutations:** every credential-bearing API route is wrapped in `httpsMiddleware` (`server/app.ts:202-225`).

## Layers

**Routing / SSR (TanStack Start):**
- Purpose: file-based page routes, SSR, server functions for authenticated page snapshots.
- Location: `src/routes/`, `src/router.tsx`, `src/routeTree.gen.ts` (generated, do not edit).
- Contains: 13 route files (`__root.tsx`, `dashboard.tsx`, `servers.$id.tsx`, `servers.$id.install.tsx`, `ai-provider.tsx`, `telegram.tsx`, `logs.tsx`, `settings.tsx`, `login.tsx`, `servers.index.tsx`, `servers.new.tsx`, `index.tsx`, `about.tsx`) plus the shared `AppShell` exported from `src/routes/dashboard.tsx`.
- Depends on: `src/features/*` (UI), `src/lib/*` (clients), `server/*` (via `createServerFn`).
- Used by: end users via the browser. `src/server.ts` invokes `defaultStreamHandler` for any non-`/api/*` request.

**API (Hono):**
- Purpose: REST + SSE endpoints under `/api/*`. Magic-link rate limiting, HTTPS enforcement, and auth catch-all live here.
- Location: `server/app.ts`.
- Contains: 22 routes (auth catch-all, health, 7 server routes, 1 install POST, 2 install GETs (SSE + log), 1 server action, 1 host-key accept, dashboard status, logs read/clear, 3 provider routes, 6 telegram routes).
- Depends on: every domain module in `server/` (`auth`, `dashboard`, `install`, `logs`, `providers`, `deploy`, `server-actions`, `servers`, `telegram`, `db/health`).
- Used by: `src/server.ts:16-18` (prefix dispatch) and the React features in `src/features/*` (fetch).

**Services / Domain (server/):**
- Purpose: business logic — SSH orchestration, credential encryption, install workflow, dashboard aggregation, audit trail.
- Location: `server/` and its subdirectories `server/db/`, `server/ssh/`, `server/install/`, `server/dashboard/`, `server/providers/`, `server/telegram/`, `server/servers/`, `server/lib/`.
- Contains: orchestrators (`server/install.ts`, `server/server-actions.ts`, `server/deploy.ts`), config + record helpers (`server/providers/`, `server/telegram/`, `server/servers/`, `server/install/records.ts`), pure helpers (`server/lib/get-client-ip.ts`, `server/lib/insert-audit-log.ts`, `server/lib/get-last-4.ts`), and SSH primitives (`server/ssh/connection.ts`, `server/ssh/errors.ts`, `server/ssh/os.ts`, `server/ssh/quoting.ts`, `server/ssh/host-key-fingerprint.ts`).
- Depends on: `server/db/`, `server/ssh/`, `server/crypto.ts`, `server/credentials.ts`.
- Used by: `server/app.ts` (HTTP) and `src/routes/*` server functions (SSR snapshots).

**Persistence (Drizzle / Postgres):**
- Purpose: schema, lazy pooled connection, health probe.
- Location: `server/db/schema.ts`, `server/db/index.ts`, `server/db/health.ts`.
- Contains: app tables (`servers`, `installs`, `install_events`, `audit_logs`, `provider_configs`, `telegram_configs`, `health_checks`) plus Better Auth tables (`user`, `session`, `account`, `verification`) in `server/db/schema.ts`.
- Depends on: `DATABASE_URL` env. Pool size capped at 5 (`DB_POOL_MAX`, see `CONTEXT.md` → "DB Pool").
- Used by: every domain module in `server/`. Migrations live in `drizzle/` and run via `drizzle-kit migrate` on deploy (`app.json`, `.github/workflows/deploy.yml`) — there is no `bun run db:migrate`.

**UI (React + features/):**
- Purpose: feature-grouped UI components; shadcn-style primitives.
- Location: `src/features/{dashboard,logs,providers,servers,telegram}/`, `src/components/`, `src/components/ui/`.
- Contains: feature panels (e.g. `src/features/servers/server-detail.tsx`, `src/features/servers/install-progress.tsx`, `src/features/dashboard/status-overview.tsx`, `src/features/telegram/telegram-settings.tsx`), shared chrome (`src/components/Header.tsx`, `src/components/Footer.tsx`, `src/components/ThemeToggle.tsx`), and the single primitive `src/components/ui/button.tsx`.
- Depends on: `src/lib/` (auth client, server-fn callers, types, helpers), Better Auth client, TanStack Router.
- Used by: routes under `src/routes/`.

## Data Flow

**Authenticated page render (typical: `/dashboard`, `/logs`, `/ai-provider`, `/telegram`):**
1. Browser requests the route.
2. `src/server.ts:20` delegates to TanStack Start's stream handler.
3. The route's `beforeLoad` / `loader` calls a `createServerFn` handler (e.g. `loadDashboardStatus` in `src/routes/dashboard.tsx:23-36`).
4. The server function reads the session via `getAuthSession(getRequestHeaders())` (`server/auth.ts`), pulls a snapshot from a domain module (`server/dashboard.ts` → `getDashboardStatusSnapshot`), and returns plain data for SSR.
5. React renders with the snapshot; the client hydrates and starts any polling via `useMountEffect` (`src/lib/use-mount-effect.ts`).

**Server detail page (exception):**
- `src/routes/servers.$id.tsx` does **not** use a route loader. It fetches `/api/servers/:id` from the component with `useMountEffect` (`AGENTS.md` → Data Flow Conventions). Follow this pattern on that page only.

**Mutating API call (e.g. install start):**
1. Browser issues `POST /api/servers/:id/install`.
2. `src/server.ts:16` routes to `apiApp` (`server/app.ts`).
3. `httpsMiddleware` (`server/app.ts:105`) rejects plaintext in production (426).
4. `startServerInstall` (`server/install.ts`) authenticates via `getAuthSession`, loads + authorizes the server record (`server/server-records.ts`), and kicks off `runInstallWorkflow` (`server/install/workflow.ts`).
5. Each workflow step emits via `emitInstallEvent` in `server/install/sse-stream.ts`, which writes an `install_events` row and updates `installs` inside a single `db.transaction()`.
6. SSE subscribers attached via `GET /api/servers/:id/install/events` (`streamServerInstallEvents`) replay persisted events then tail the live in-memory stream until idle timeout (90s; `CONTEXT.md` → "SSE Timeout") or client disconnect.

**Server action (restart / update / rollback):**
1. `POST /api/servers/:id/actions` → `runServerAction` (`server/server-actions.ts`).
2. SSH command runs against the VPS (`server/ssh/connection.ts`).
3. On success, audit log insert **and** `installs` version update happen inside `db.transaction()` so action history and tracked version cannot diverge (`AGENTS.md` → DB Transaction Boundaries).
4. Rollback target resolution: `request targetVersion → latest installs.version → "latest"` (`AGENTS.md` → Data Flow Conventions).

**State Management:**
- **Server-side, persistent:** Postgres via Drizzle (`server/db/schema.ts`). App-owned PKs use `text(...).primaryKey().default(sql\`gen_random_uuid()::text\`)`.
- **Server-side, in-memory (single instance):**
  - Install SSE streams + idle timers — `installStreams` map in `server/install/sse-stream.ts`.
  - Session credentials with 30-minute TTL — `server/credentials.ts`.
  - Magic-link rate limiter — `RateLimiterMemory` in `server/app.ts:33`.
  - Dashboard caches — 60s static, 15s live VPS metrics, in `server/dashboard.ts` and `server/dashboard/metrics.ts` (`CONTEXT.md` → "Dashboard Caching").
- **Client-side:** TanStack Router loaders for SSR snapshots; component-local `useState` + the `useMountEffect` escape hatch (`src/lib/use-mount-effect.ts`) for stable subscriptions (polling, SSE). The codebase deliberately avoids `useEffect`.
- **Auth session:** Better Auth cookies (`server/auth.ts`, `src/lib/auth-client.ts`). SSR base URL is `BETTER_AUTH_URL` (fallback `http://localhost:3000/api/auth`).

## Key Abstractions

**Install Event (persisted + streamed):**
- Purpose: every install step transition. Persisted as an `install_events` row; mirrored in an in-memory SSE stream for live tailing.
- Examples: `server/install/sse-stream.ts` (stream state, hydration, heartbeat, idle timeout), `server/install.ts` (orchestration), `server/install/workflow.ts` (step definitions).
- Pattern: transactional write of `install_events` + `installs` update so SSE replay and the persisted install row never disagree.

**Server Action History (audit-derived):**
- Purpose: action history read from `audit_logs` rows named `server.action.*.succeeded|failed`, filtered by the indexed `audit_logs.server_id` column (not by JSON `details.serverId`) and capped at `LIMIT 5` (`AGENTS.md` → Data Flow Conventions).
- Examples: `server/servers/list.ts` (keys records on returned `serverId`), `server/lib/insert-audit-log.ts` (insertion helper).
- Pattern: audit log as the canonical history store; UI reconstructs timelines from it.

**Session vs Stored Credentials:**
- Purpose: SSH passwords/keys held either in-process (30-min TTL, never persisted) or AES-256-GCM encrypted at rest.
- Examples: `server/credentials.ts` (session cache), `server/crypto.ts` (encrypt/decrypt), `server/servers.ts` (persistence path).
- Pattern: encryption boundary at the service layer; routes never see raw secrets.

**SSH Boundary:**
- Purpose: every remote command goes through `server/ssh/connection.ts` (`withSshConnection`), with error normalization (`server/ssh/errors.ts`), OS detection + warning (`server/ssh/os.ts`), shell quoting (`server/ssh/quoting.ts`), and host-key fingerprint capture (`server/ssh/host-key-fingerprint.ts`).
- Pattern: callers pass intent; the SSH module owns the connection lifecycle and error taxonomy.

**Dashboard Snapshot:**
- Purpose: aggregate server, install, provider, telegram, and live metrics into one cached response.
- Examples: `server/dashboard.ts`, `server/dashboard/records.ts`, `server/dashboard/summaries.ts`, `server/dashboard/metrics.ts`.
- Pattern: two-tier in-memory cache (60s static / 15s live) keyed per-user.

**Server Function (`createServerFn`):**
- Purpose: typed RPC for authenticated SSR loaders.
- Examples: `loadDashboardStatus` in `src/routes/dashboard.tsx:23`, similar loaders in `src/routes/logs.tsx`, `src/routes/ai-provider.tsx`, `src/routes/telegram.tsx`.
- Pattern: read session, delegate to a `server/` domain function, return plain JSON.

## Entry Points

**Server entrypoint:**
- Location: `src/server.ts`.
- Triggers: every HTTP request to the Node process.
- Responsibilities: route `/api/*` to `apiApp.fetch` (Hono) and everything else to TanStack Start's `defaultStreamHandler`.

**API entrypoint:**
- Location: `server/app.ts`.
- Triggers: `src/server.ts:16-18`.
- Responsibilities: declare the Hono app, register `httpsMiddleware`, handle Better Auth catch-all with rate-limited magic-link sending, expose `/api/health`, and bind every domain handler.

**Auth bootstrap:**
- Location: `server/auth.ts`.
- Triggers: first call to `getAuth()` / `getAuthSession()`.
- Responsibilities: lazily build the Better Auth instance with the Drizzle adapter and magic-link plugin. Throws in production if `BETTER_AUTH_URL` / `BETTER_AUTH_SECRET` are missing; tolerates absence in development.

**DB bootstrap:**
- Location: `server/db/index.ts` (lazy `getDb()`), schema in `server/db/schema.ts`, probe in `server/db/health.ts`.
- Triggers: first DB-touching call.
- Responsibilities: build a pooled `node-postgres` Drizzle client (`DB_POOL_MAX`, default 5).

**Page entrypoint:**
- Location: `src/routes/__root.tsx` (root layout) + `src/router.tsx`.
- Triggers: TanStack Start request handling.
- Responsibilities: theme bootstrap, header/footer, devtools, route tree.

**Install workflow entrypoint:**
- Location: `server/install.ts` (`startServerInstall`, `streamServerInstallEvents`, `getLatestServerInstallLog`).
- Triggers: API routes registered at `server/app.ts:206-208`.
- Responsibilities: orchestrate `runInstallWorkflow`, claim/release the SSE stream, hydrate replay from `install_events`.

## Error Handling

**Strategy:** fail at the boundary, normalize at the SSH/auth edges, surface JSON to clients. No global error middleware — each handler returns explicit status codes.

**Patterns:**
- **Auth unavailable → 503:** `handleAuthUnavailable` in `server/app.ts:48-52` short-circuits auth routes when `DATABASE_URL` is unset.
- **Unauthenticated → 401:** every protected handler checks `getAuthSession` and returns `{ error: "Unauthorized" }, 401` (e.g. `server/install.ts:25-29`).
- **HTTP in production → 426:** `requireHttps` in `server/app.ts:70-103` returns "Upgrade Required" with a clear message.
- **Rate limit exceeded → 429:** `applyMagicLinkRateLimit` in `server/app.ts:113-141`.
- **SSH errors:** `normalizeSshError` in `server/ssh/errors.ts` translates `node-ssh` exceptions into stable shapes for both UI and tests.
- **Transactional rollback:** writes that must commit together use `db.transaction()` — see `deployTelegramToServer` (`server/telegram.ts`), `runServerAction` (`server/server-actions.ts`), `emitInstallEvent` (`server/install/sse-stream.ts`). Single-write audit logs intentionally stay non-transactional (`AGENTS.md` → DB Transaction Boundaries).
- **Dashboard polling backoff:** the client doubles the interval (30s → 60s → 120s) and stops after 3 consecutive failures (`CONTEXT.md` → "Polling Backoff").

## Cross-Cutting Concerns

**Logging:** server-side `console.log` / `console.error`; install events are the structured log (`install_events`); audit logs live in `audit_logs`. Magic-link URLs are logged to stdout when `RESEND_API_KEY` is unset (`server/lib/send-magic-link-email.ts`, `README.md` § Login Flow).

**Validation:** input validation is per-route. `server/ssh/os.ts` returns `supportLevel: "supported" | "untested"` rather than rejecting unknown distros (`CONTEXT.md` → "OS Validation"). Provider/telegram configs validate inside `server/providers/config.ts` and `server/telegram/config.ts`. There is no project-wide Zod schema layer.

**Authentication:** Better Auth (magic-link only) wired lazily in `server/auth.ts`. Auth routes are catch-all `/api/auth/*` (`server/app.ts:158-175`). SSR uses an absolute `BETTER_AUTH_URL`; client uses `window.location.origin` (`src/lib/auth-client.ts`). Route gating: `requireSession` in `src/lib/session.ts` redirects to `/login` from `beforeLoad`. Mutating credential-bearing endpoints additionally require `httpsMiddleware`.

**Audit trail:** `insertAuditLog` in `server/lib/insert-audit-log.ts` is the single insertion point; `getClientIp` in `server/lib/get-client-ip.ts` reads the rightmost `x-forwarded-for` entry (configurable via `TRUSTED_PROXY_COUNT`).

**Encryption:** AES-256-GCM via `server/crypto.ts`, key from `ENCRYPTION_KEY` (32-byte hex). Used for stored SSH credentials and provider API keys.

---

*Architecture analysis: 2026-06-02*
