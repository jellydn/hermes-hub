# Architecture

**Analysis Date:** 2026-05-28

## Pattern Overview
**Overall:** Dual-runtime monolith with split frontend/backend concern layers
**Key Characteristics:**
- Server entrypoint (`src/server.ts`) routes `/api/*` to Hono and everything else to TanStack Start SSR
- Backend logic lives in `server/` as pure Hono handlers and service modules; no framework coupling to TanStack
- Frontend lives in `src/` as file-based TanStack Start routes with UI pushed into feature modules
- Database access is centralized through a lazy-initialized Drizzle singleton (`server/db/index.ts`)
- Credentials are encrypted at rest with AES-256-GCM or held ephemerally in-process for session-only workflows

## Layers

**Server Entrypoint:**
- Purpose: HTTP router that splits requests between the Hono API app and the TanStack Start SSR handler
- Location: `src/server.ts`
- Contains: Single fetch function that delegates `/api/*` to Hono and all other paths to TanStack Start
- Depends on: `server/app.ts` (Hono app), TanStack Start server entry
- Used by: Node.js / Bun HTTP server (production and dev)

**API Layer (Hono):**
- Purpose: Handles all REST/JSON API endpoints for authentication, servers, installs, providers, Telegram, dashboard, and logs
- Location: `server/app.ts`
- Contains: Route definitions, middleware (HTTPS enforcement, rate limiting), handler delegation
- Depends on: All `server/*.ts` service modules, `server/db/` for data access
- Used by: `src/server.ts` (proxied via `/api/*`), frontend components (via fetch)

**Backend Services:**
- Purpose: Business logic for each domain area -- authentication, SSH, server management, install orchestration, AI providers, Telegram, dashboard aggregation, logging
- Location: `server/auth.ts`, `server/servers.ts`, `server/install.ts`, `server/ssh.ts`, `server/providers.ts`, `server/telegram.ts`, `server/dashboard.ts`, `server/logs.ts`, `server/server-actions.ts`, `server/credentials.ts`, `server/crypto.ts`
- Contains: Hono handler functions, database queries, SSH command execution, SSE streaming, credential management, encryption/decryption
- Depends on: `server/db/` (Drizzle), `server/ssh.ts` (SSH client), `server/crypto.ts` (encryption), `server/credentials.ts` (ephemeral credentials), `server/lib/` (utilities)
- Used by: `server/app.ts` (API routes), `src/routes/*.tsx` (via `createServerFn` server-side loaders)

**Server Utilities:**
- Purpose: Shared helper functions for client IP extraction, email sending, and database health checks
- Location: `server/lib/get-client-ip.ts`, `server/lib/send-magic-link-email.ts`, `server/db/health.ts`
- Contains: IP extraction from proxy headers, Resend API email dispatch, DB connectivity check
- Depends on: Hono context, Resend HTTP API, Drizzle
- Used by: Backend services (servers, installs, providers, telegram, logs)

**Database Layer:**
- Purpose: PostgreSQL schema definition, connection management, and health checks
- Location: `server/db/schema.ts`, `server/db/index.ts`, `server/db/health.ts`
- Contains: Drizzle ORM table definitions (users, sessions, accounts, verifications, servers, installs, aiProviders, telegramConfigs, auditLogs), lazy database singleton, health check query
- Depends on: `postgres` client, `drizzle-orm`
- Used by: All backend services that read/write data

**Database Migrations:**
- Purpose: Track and apply schema changes to PostgreSQL
- Location: `drizzle/` directory, `drizzle.config.ts`
- Contains: Generated SQL migration files, snapshot metadata, Drizzle Kit configuration
- Depends on: `DATABASE_URL` environment variable
- Used by: `bun run db:generate` script, deploy-time `drizzle-kit migrate`

**Frontend Routes (TanStack Start):**
- Purpose: File-based SSR routes that define page structure and data loading
- Location: `src/routes/`
- Contains: Route definitions with `beforeLoad` hooks for auth checks, `createServerFn` loaders for server-side data fetching, thin page components that delegate to features
- Depends on: `src/features/`, `src/lib/`, `src/components/`, `server/*.ts` (imported directly for server-side loaders)
- Used by: TanStack Router (client navigation), TanStack Start (SSR rendering)

**Frontend Features:**
- Purpose: Domain-specific UI components that contain the actual page content and state management
- Location: `src/features/dashboard/`, `src/features/servers/`, `src/features/providers/`, `src/features/telegram/`, `src/features/logs/`
- Contains: React components with local state, API fetch logic, SSE subscriptions, polling patterns
- Depends on: `src/lib/`, `src/components/ui/`
- Used by: `src/routes/*.tsx` (route page components)

**Frontend Components:**
- Purpose: Shared UI primitives and layout components used across the application
- Location: `src/components/ui/button.tsx`, `src/components/Header.tsx`, `src/components/Footer.tsx`, `src/components/ThemeToggle.tsx`
- Contains: Button component (CVA variants), site header with navigation and auth-aware links, footer, theme toggle with localStorage persistence
- Depends on: `src/lib/utils.ts` (cn helper), `src/lib/auth-client.ts` (session state)
- Used by: All route and feature components

**Frontend Library:**
- Purpose: Shared types, utilities, client-side helpers, and React hooks
- Location: `src/lib/`
- Contains: Auth client setup, session management via `createServerFn`, AI provider definitions, type definitions for dashboard/install/server/logs snapshots, `cn()` utility, `useMountEffect` hook
- Depends on: `better-auth/react`, `@tanstack/react-start`, `clsx`, `tailwind-merge`
- Used by: All frontend components and features

## Data Flow

**Authentication Flow:**
1. User enters email on `/login` page
2. Frontend calls `authClient.signIn.magicLink()` which hits `/api/auth/send-magic-link`
3. Hono rate-limits the request (3 per 5 minutes per email)
4. `server/lib/send-magic-link-email.ts` sends email via Resend API (or console.log in dev)
5. User clicks magic link, Better Auth processes the callback and creates a session
6. Session cookie is set via `tanstackStartCookies()` plugin
7. Subsequent requests include session cookie; `getAuthSession(headers)` validates it

**Server Connection Flow:**
1. User fills in connection wizard on `/servers` page
2. Frontend POSTs to `/api/servers/connect` with SSH credentials
3. `server/servers.ts` validates the request, calls `server/ssh.ts` to verify the connection
4. SSH verification runs `cat /etc/os-release` and `uname -m` on the remote server
5. Server record is inserted into `servers` table (credential encrypted if `storeCredential` is true)
6. Audit log entry is written for the connection event
7. If credential is ephemeral, it is stored in-process via `server/credentials.ts` with a 30-minute TTL

**Install Flow:**
1. User clicks "Install Hermes" on `/servers` page
2. Frontend POSTs to `/api/servers/:id/install`
3. `server/install.ts` claims an in-process install slot (prevents concurrent installs per server)
4. Install record is upserted in `installs` table
5. `runInstallWorkflow` executes SSH commands in sequence (Docker, Compose, workspace, compose file, image pull, container start)
6. Each step emits SSE events via `server/install/sse-stream.ts` and persists log lines to the `installs` table
7. Frontend subscribes to `/api/servers/:id/install/events` via EventSource for live progress
8. Install completion writes an audit log entry (`server.install.succeeded` or `server.install.failed`)

**Dashboard Aggregation Flow:**
1. Dashboard page loads, `createServerFn` loader calls `getDashboardStatusSnapshot()`
2. `server/dashboard.ts` queries servers, installs, providers, and Telegram configs in parallel
3. Static data is cached for 60 seconds; VPS metrics are cached for 15 seconds
4. VPS health metrics (CPU, memory, disk, uptime) are read live over SSH
5. Response is assembled into a `DashboardStatusSnapshot` type
6. Frontend polls `/api/dashboard/status` every 30 seconds with exponential backoff on failure

**Server Action Flow (restart/update/rollback):**
1. User clicks an action button on `/servers/:id` page, confirms in dialog
2. Frontend POSTs to `/api/servers/:id/actions` with the action type
3. `server/server-actions.ts` resolves the SSH credential (stored or ephemeral)
4. For rollback, the target version is resolved: request -> latest install -> "latest"
5. SSH command is executed on the remote server (restart: `docker compose restart`, update: `docker compose pull && up -d`, rollback: `docker pull` + `sed` + `docker compose up -d`)
6. Audit log entries are written for started, succeeded, and failed states
7. For update/rollback, the install record's version field is updated

**State Management:**
- Server-side data is fetched via `createServerFn` loaders in route `beforeLoad` hooks and passed as route context
- Client-side state is managed with React `useState` in feature components
- Real-time updates use EventSource (SSE) for install progress and polling (30s interval) for dashboard status
- Ephemeral credentials are stored in-process (`Map` with TTL) for session-only workflows
- Dashboard metrics use a two-tier cache (60s static, 15s metrics) to avoid hammering VPS over SSH

## Key Abstractions

**AppShell:**
- Purpose: Shared authenticated dashboard layout with sidebar navigation, user info, and logout
- Examples: `src/routes/dashboard.tsx` (exports `AppShell`)
- Pattern: Wrapper component used by all authenticated route pages (`/dashboard`, `/servers`, `/ai-provider`, `/telegram`, `/logs`, `/settings`, `/servers/:id`, `/servers/:id/install`)

**Install SSE Stream:**
- Purpose: In-process pub/sub for real-time install progress events with replay capability
- Examples: `server/install/sse-stream.ts`, `server/install.ts`
- Pattern: `installStreams` Map keyed by serverId, each holding events[], listeners Set, and status. `emitInstallEvent()` writes to DB and broadcasts to listeners. `ensureInstallStream()` hydrates from DB for replay on reconnection.

**Credential Management:**
- Purpose: Dual-mode credential handling -- encrypted at rest or ephemeral in-memory with TTL
- Examples: `server/credentials.ts`, `server/crypto.ts`, `server/auth.ts`
- Pattern: If `storeCredential` is true, credential is AES-256-GCM encrypted and stored in DB. Otherwise, it is held in a `Map` with 30-minute TTL and cleaned up by an interval timer.

**Shared Type Definitions:**
- Purpose: Frontend type definitions that are imported by both server-side loaders and client-side components
- Examples: `src/lib/dashboard-status.ts`, `src/lib/server-detail.ts`, `src/lib/logs.ts`, `src/lib/ai-providers.ts`
- Pattern: Pure type files in `src/lib/` that define snapshot/summary shapes. Server modules import these to construct responses; frontend components import them to type props and state.

**Session Management:**
- Purpose: Server-side session validation and client-side auth state
- Examples: `src/lib/session.ts`, `src/lib/auth-client.ts`, `server/auth.ts`
- Pattern: `createServerFn` wrappers call `getAuthSession(headers)` server-side. `requireSession()` redirects unauthenticated users to `/login`. Client uses `authClient.useSession()` for reactive auth state in the header.

## Entry Points

**Server Entrypoint:**
- Location: `src/server.ts`
- Triggers: HTTP requests from Bun/Node runtime
- Responsibilities: Routes `/api/*` to Hono app, everything else to TanStack Start SSR handler

**Hono API App:**
- Location: `server/app.ts`
- Triggers: `/api/*` requests from `src/server.ts`
- Responsibilities: Defines all API routes, applies middleware (rate limiting, HTTPS enforcement), delegates to service modules

**TanStack Start Entry:**
- Location: `src/router.tsx` + generated `src/routeTree.gen.ts`
- Triggers: Non-`/api` HTTP requests from `src/server.ts`
- Responsibilities: Server-side rendering of React routes, `beforeLoad` hooks for auth and data loading

**Vite Dev Server:**
- Location: `vite.config.ts`
- Triggers: `bun run dev` command
- Responsibilities: Development server on port 3000 with HMR, SSR, and Tailwind CSS processing

**Production Runtime:**
- Location: `scripts/start-production.mjs` (referenced in Dockerfile)
- Triggers: `node scripts/start-production.mjs` in Docker container
- Responsibilities: Starts the production server with the built output from `dist/`

## Error Handling

**Strategy:** Explicit error normalization at service boundaries with structured JSON responses
**Patterns:**
- Custom error classes for domain-specific failures: `SshConnectError`, `UnsupportedOsError`, `ProviderConnectionError`, `TelegramConnectionError`
- `normalizeSshError()` maps raw SSH errors to user-friendly messages ("invalid credentials", "host unreachable")
- Every API handler wraps logic in try/catch and returns `{ error: string }` with appropriate HTTP status
- Install workflow catches errors, writes audit log entries, and emits "failed" SSE events
- Frontend components display error banners with retry buttons; dashboard polling backs off exponentially and pauses after 3 consecutive failures
- `requireHttps()` guard in production rejects HTTP requests to credential-bearing endpoints (426 response)
- Rate limiting via `rate-limiter-flexible` prevents magic link abuse (3 requests per 5 minutes per email)

## Cross-Cutting Concerns

**Logging:**
- Install progress is persisted as newline-delimited log text in the `installs.log` column
- Audit events are recorded in the `audit_logs` table with action names, JSONB details, and client IP
- `console.log` is used for magic link URLs in development; Resend API is used in production
- No structured logging framework; errors are normalized and returned as JSON responses

**Validation:**
- Request payloads are parsed and validated explicitly in each handler function (e.g., `parseConnectRequest`, `parseProviderRequest`)
- SSH credentials are validated by actually connecting to the remote server
- Docker image tags are validated with a regex pattern before interpolation into shell commands
- Host validation supports IPv4, IPv6, and DNS hostnames
- Port validation ensures integer values in the 1-65535 range

**Authentication:**
- Better Auth with magic link plugin for passwordless sign-in
- Session tokens stored in cookies via `tanstackStartCookies()` plugin
- `getAuthSession(headers)` extracts and validates sessions from request headers
- `requireSession()` redirects unauthenticated users to `/login` with a return URL
- Auth initialization is lazy (not at module scope) to avoid crashing when `DATABASE_URL` is unset

**Encryption:**
- AES-256-GCM encryption for stored credentials (SSH keys, API keys, Telegram bot tokens)
- Key derivation via SHA-256 hash of the `ENCRYPTION_KEY` environment variable
- Encrypted payloads use base64url encoding with format: `iv.authTag.ciphertext`
- `encryptSecret()` / `decryptSecret()` in `server/crypto.ts`

**HTTPS Enforcement:**
- `requireHttps()` in `server/app.ts` checks `x-forwarded-proto` header or URL protocol
- Applied to all mutating API endpoints (connect, install, actions, providers, telegram)
- Only enforced in production; development allows HTTP

---
*Architecture analysis: 2026-05-28*
