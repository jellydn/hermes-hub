# Architecture

**Analysis Date:** 2026-05-31

## Pattern Overview

**Overall:** Hybrid TanStack Start SSR frontend + Hono API backend in one deployable server entry (`src/server.ts`, `server/app.ts`, `scripts/start-production.mjs`).

**Key Characteristics:**
- Frontend and backend are split by path boundary in one fetch handler: `/api/*` goes to Hono (`server/app.ts`) and non-API requests go to TanStack Start SSR (`src/server.ts`).
- Route-driven UI uses file-based routing with generated tree (`src/routes/*.tsx`, `src/routeTree.gen.ts`, `src/router.tsx`).
- Backend is feature-sliced by domain modules (servers/install/actions/dashboard/providers/telegram/logs) mounted centrally (`server/app.ts`, `server/servers.ts`, `server/install.ts`, `server/providers.ts`, `server/telegram.ts`).

## Layers

**Delivery / Entry Layer:**
- Purpose: Accept HTTP requests and dispatch to frontend SSR vs API handlers.
- Location: `src/server.ts`, `scripts/start-production.mjs`, `Dockerfile`
- Contains: TanStack server entry wiring, Node HTTP bridge, static asset serving, startup migration execution.
- Depends on: API app (`server/app.ts`), built server bundle (`dist/server/server.js`), Drizzle migrations (`drizzle.config.ts`, `drizzle/`).
- Used by: Vite runtime (`bun run dev` via `package.json`) and container runtime (`Dockerfile`, `compose.yaml`).

**Frontend Route/UI Layer:**
- Purpose: Render pages, enforce auth redirects, load initial snapshots, and trigger API mutations.
- Location: `src/routes/`, `src/features/`, `src/components/`
- Contains: Page routes (`src/routes/dashboard.tsx`, `src/routes/servers.new.tsx`, `src/routes/telegram.tsx`), reusable feature UI (`src/features/*`), shared shell (`src/routes/dashboard.tsx` AppShell).
- Depends on: Session/server functions (`src/lib/session.ts`), shared types (`src/lib/*.ts`), REST endpoints (`/api/*` in `server/app.ts`).
- Used by: Router tree (`src/routeTree.gen.ts`, `src/router.tsx`), SSR root (`src/routes/__root.tsx`).

**API Routing Layer:**
- Purpose: Define REST surface, auth proxy paths, and HTTP-level guards/rate limits.
- Location: `server/app.ts`
- Contains: Endpoint registration for `/auth`, `/health`, `/servers/*`, `/dashboard/status`, `/logs`, `/providers/*`, `/telegram/*`; HTTPS guard and magic-link rate limiting.
- Depends on: Domain services (`server/servers.ts`, `server/install.ts`, `server/providers.ts`, `server/telegram.ts`, `server/logs.ts`, `server/dashboard.ts`, `server/server-actions.ts`, `server/auth.ts`).
- Used by: Server entry dispatcher (`src/server.ts`).

**Domain/Orchestration Layer:**
- Purpose: Execute business workflows (SSH verify/install/deploy/actions, dashboard composition, log aggregation).
- Location: `server/servers.ts`, `server/install.ts`, `server/server-actions.ts`, `server/dashboard.ts`, `server/providers.ts`, `server/telegram.ts`, `server/logs.ts`
- Contains: Request validation/parsing, audit log writes, DB transactions, SSH command orchestration, provider/telegram external API checks.
- Depends on: Data access (`server/db/index.ts`, `server/db/schema.ts`), security helpers (`server/crypto.ts`, `server/credentials.ts`, `server/server-records.ts`), SSH adapter (`server/ssh.ts`), compose builder (`server/compose.ts`).
- Used by: API routing layer (`server/app.ts`) and route server loaders (`src/routes/*.tsx` using `createServerFn`).

**Data & Security Layer:**
- Purpose: Persist state and secure sensitive credentials.
- Location: `server/db/schema.ts`, `server/db/index.ts`, `server/crypto.ts`, `server/credentials.ts`, `server/auth.ts`
- Contains: Drizzle schema/tables, DB singleton, AES-256-GCM encrypt/decrypt, ephemeral credential TTL cache, Better Auth magic-link setup.
- Depends on: Environment variables (`DATABASE_URL`, `ENCRYPTION_KEY`, `BETTER_AUTH_*`) from runtime config (`drizzle.config.ts`, `compose.yaml`, `server/auth.ts`).
- Used by: All domain modules (`server/*.ts`), frontend session server functions (`src/lib/session.ts`).

## Data Flow

**Authentication Flow (Magic Link):**
1. Login route triggers Better Auth client magic link call (`src/routes/login.tsx`, `src/lib/auth-client.ts`).
2. API rate-limits and forwards auth requests to Better Auth handler (`server/app.ts`, `server/auth.ts`).
3. Session is checked server-side for route guards and loaders (`src/lib/session.ts`, `server/auth.ts`, `src/routes/dashboard.tsx`).

**Server Connection + Install Flow:**
1. User submits connection wizard to `/api/servers/connect` (`src/features/servers/connection-wizard.tsx`, `src/routes/servers.new.tsx`).
2. Backend verifies SSH + OS, stores server + credential strategy, and writes audit events (`server/servers.ts`, `server/ssh.ts`, `server/server-records.ts`, `server/db/schema.ts`).
3. Install start triggers async workflow + SSE stream replay/live events (`server/install.ts`, `server/install/sse-stream.ts`, `src/features/servers/install-progress.tsx`).

**Provider + Telegram Deployment Flow:**
1. UI saves/tests provider and telegram config via REST (`src/features/providers/provider-settings.tsx`, `src/features/telegram/telegram-settings.tsx`).
2. Backend encrypts secrets, validates external APIs, and stores active config (`server/providers.ts`, `server/telegram.ts`, `server/crypto.ts`).
3. Deploy rewrites Hermes compose on VPS over SSH and restarts container (`server/providers.ts`, `server/telegram.ts`, `server/compose.ts`, `server/ssh.ts`).

**State Management:**
- Route access state is enforced with server-side `requireSession` redirects (`src/lib/session.ts`, `src/routes/*.tsx`).
- Initial page data is loaded via TanStack `createServerFn` in route `beforeLoad` (`src/routes/dashboard.tsx`, `src/routes/servers.index.tsx`, `src/routes/logs.tsx`, `src/routes/ai-provider.tsx`, `src/routes/telegram.tsx`).
- Interactive page state uses local React state plus API fetch/EventSource updates (`src/features/dashboard/status-overview.tsx`, `src/features/servers/install-progress.tsx`, `src/features/servers/server-detail.tsx`).

## Key Abstractions

**File-Based Route Structure:**
- Purpose: Define navigation and page boundaries from filesystem.
- Examples: `src/routes/index.tsx`, `src/routes/login.tsx`, `src/routes/dashboard.tsx`, `src/routes/servers.index.tsx`, `src/routes/servers.new.tsx`, `src/routes/servers.$id.tsx`, `src/routes/servers.$id.install.tsx`, `src/routes/ai-provider.tsx`, `src/routes/telegram.tsx`, `src/routes/logs.tsx`, `src/routes/settings.tsx`, `src/routes/about.tsx`, `src/routeTree.gen.ts`
- Pattern: TanStack file-based routing with generated route graph.

**Install Stream State:**
- Purpose: Coordinate single active install per server, persist progress, replay on reconnect.
- Examples: `server/install/sse-stream.ts`, `server/install.ts`, `src/features/servers/install-progress.tsx`
- Pattern: In-memory stream registry + DB-backed log hydration + SSE fanout.

**Server Credential Resolution:**
- Purpose: Unify stored encrypted credentials and temporary session-only credentials.
- Examples: `server/server-records.ts`, `server/credentials.ts`, `server/crypto.ts`, `server/servers.ts`
- Pattern: Policy-based credential retrieval (persisted-at-rest vs ephemeral TTL cache).

## Entry Points

**App Request Entry (SSR + API multiplexer):**
- Location: `src/server.ts`
- Triggers: All incoming HTTP requests in TanStack server runtime.
- Responsibilities: Route `/api/*` to Hono `apiApp` and everything else to TanStack Start stream handler.

**API Entry:**
- Location: `server/app.ts`
- Triggers: Requests under `/api/*` from `src/server.ts`.
- Responsibilities: Bind all REST routes, apply auth/HTTPS/rate-limit checks, delegate to domain handlers.

**Production Runtime Entry:**
- Location: `scripts/start-production.mjs`
- Triggers: Container start command (`Dockerfile` CMD).
- Responsibilities: Run Drizzle migrations, serve static assets from `dist/client`, proxy dynamic requests to built server app.

## Error Handling

**Strategy:** Fail-fast input/session checks at route boundaries and return structured JSON errors with HTTP status codes from each handler (`server/app.ts`, `server/servers.ts`, `server/install.ts`, `server/providers.ts`, `server/telegram.ts`, `server/server-actions.ts`, `server/logs.ts`, `server/dashboard.ts`).

**Patterns:**
- Domain-specific normalization for external/SSH failures into user-safe messages (`server/ssh.ts`, `server/install.ts`, `server/server-actions.ts`, `server/providers.ts`, `server/telegram.ts`).
- Operational auditing for success/failure actions to preserve traceability (`server/db/schema.ts` `audit_logs`, writes in `server/servers.ts`, `server/install.ts`, `server/server-actions.ts`, `server/providers.ts`, `server/telegram.ts`).

## Cross-Cutting Concerns

**Logging:** Operational history is stored as audit rows and surfaced in logs UI (`server/db/schema.ts`, `server/logs.ts`, `src/features/logs/logs-viewer.tsx`).

**Validation:** Request payloads are validated in both UI forms and API parsers (`src/features/servers/connection-wizard.tsx`, `src/routes/login.tsx`, `server/servers.ts`, `server/providers.ts`, `server/telegram.ts`, `server/server-actions.ts`).

**Authentication:** Better Auth magic-link sessions gate nearly all non-public API and route loaders (`server/auth.ts`, `server/app.ts`, `src/lib/session.ts`, `src/routes/dashboard.tsx`, `src/routes/servers.new.tsx`, `src/routes/ai-provider.tsx`, `src/routes/telegram.tsx`, `src/routes/logs.tsx`).

---

*Architecture analysis: 2026-05-31*

