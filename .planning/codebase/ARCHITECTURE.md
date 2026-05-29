# Architecture

**Analysis Date:** 2026-05-26

## Pattern Overview

**Overall:** Hybrid SSR + API Gateway — TanStack Start serves the file-routed React app with streaming SSR, while a Hono API gateway handles all `/api/*` backend endpoints (auth, SSH, installs, integrations). The frontend calls backend APIs via `fetch` or `EventSource`, with `createServerFn` used selectively for route-level data preloading.

**Key Characteristics:**
- **File-based routing** via `@tanstack/react-router` with auto-generated `routeTree.gen.ts`
- **API gateway pattern** — a Hono app at `server/app.ts` mounted at `/api/` and dispatched from the server entry point `src/server.ts`
- **Feature-sliced UI** — each authenticated page mounts a feature component from `src/features/` that owns its own action state and form logic
- **Shared types contract** — `src/lib/` holds TypeScript types shared between server and client (e.g., `DashboardStatusSnapshot`, `ServerDetailSnapshot`)
- **In-memory stream state** — install progress is tracked in a `Map<string, InstallStreamState>` with SSE push, replayable on reconnect from DB logs
- **Ephemeral + stored credentials** — SSH credentials are either AES-256-GCM encrypted in Postgres or held in-memory per-session via `Map<string, EphemeralCredentialRecord>`
- **Lazy auth initialization** — Better Auth instance is created inside a getter (not at module load) so pages can render when `DATABASE_URL` is not set
- **Route-wide auth guard** — authenticated routes use `beforeLoad` hooks that call `requireSession()` and redirect to `/login` if needed

## Layers

### Presentation Layer (UI / Routes)
**Purpose:** Renders pages, handles user interactions, manages client-side state
**Location:** `src/routes/`, `src/features/`, `src/components/`

The routing layer uses TanStack Router's file conventions (`servers.$id.tsx`, `servers.$id.install.tsx`). Each authenticated route runs a `beforeLoad` hook for session guard + server function preloading, then passes context down to a feature component. Feature components (like `ServerDetail`, `ConnectionWizard`) manage their own form/action state with `useState` or `useReducer`-style patterns. The `AppShell` layout in `src/routes/dashboard.tsx` wraps all dashboard pages with navigation, user info, and logout.

### API / Server Layer
**Purpose:** Handles all backend business logic — SSH, DB, auth, install workflows
**Location:** `server/`

Hono router at `server/app.ts` exposes 15+ REST endpoints under `/api/`. Each endpoint handler is a standalone function imported (e.g., `connectServer`, `getServerDetail`). Auth is handled separately — Better Auth routes are proxied through request rewrites to `/api/auth/*`. The install flow uses Hono's SSE streaming (`streamSSE`) for real-time progress events.

### Database / Data Layer
**Purpose:** ORM schema, migrations, connection management
**Location:** `server/db/`

Drizzle ORM with Postgres driver (`postgres`). Schema is defined in `server/db/schema.ts` with 8 tables: `users`, `sessions`, `accounts`, `verifications` (Better Auth), and app-specific: `servers`, `installs`, `ai_providers`, `telegram_configs`, `audit_logs`. Connection is lazily initialized via `getDb()` getter.

### Infrastructure / SSH Layer
**Purpose:** SSH connection, command execution, OS verification
**Location:** `server/ssh.ts`

Node-SSH wrapper with `withSshConnection<T>()` — auto-connects, runs a callback, auto-disposes. Includes `verifyServerConnection()` that reads `/etc/os-release` and checks Ubuntu 22.04+/Debian 12+ support. Custom error classes `SshConnectError`, `UnsupportedOsError`.

### Cryptography Layer
**Purpose:** Encrypt/decrypt stored secrets (SSH credentials, API keys)
**Location:** `server/crypto.ts`

AES-256-GCM using `node:crypto`. Key derived from `ENCRYPTION_KEY` via SHA-256. Payload format: `iv.authTag.ciphertext` — each part base64url-encoded.

### Shared Types Layer
**Purpose:** Type definitions shared between frontend and backend
**Location:** `src/lib/`

Client-side type definitions that server handlers also import (`DashboardStatusSnapshot`, `ServerDetailSnapshot`, `LogsSnapshot`, `AiProviderId`, etc.). Also houses the auth client singleton (`authClient`), session helpers (`getCurrentSession`, `requireSession`), and utility `cn()`.

## Data Flow

### Dashboard Load Flow
1. Route's `beforeLoad` calls `requireSession()` (redirects to `/login` if no session)
2. `createServerFn` `loadDashboardStatus()` runs server-side, calls `getAuthSession()`, then `getDashboardStatusSnapshot()`
3. Server queries DB for latest `server`, `install`, `provider`, `telegram` records
4. Server optionally runs SSH to fetch VPS metrics (CPU/memory/disk) via `withSshConnection()`
5. Snapshot returned as route context, passed as `initialStatus` prop to `DashboardStatusOverview`
6. Client mounts and starts 30-second polling via `setInterval` calling `GET /api/dashboard/status`

### Server Connection Flow
1. User fills `ConnectionWizard` (3-step: basics → auth → review)
2. On submit, `POST /api/servers/connect` is called with SSH details
3. Server validates payload, calls `verifyServerConnection()` over Node-SSH
4. If OS is unsupported, returns `UnsupportedOsError` (Ubuntu <22, Debian <12)
5. On success, server record inserted to DB; credential either encrypted and stored or held ephemerally in `Map`
6. Audit log entry written for success/failure
7. Client shows connected server card with "Install Hermes" button

### Server Install Flow
1. `POST /api/servers/:id/install` — validates session, fetches server record, resolves credential
2. Creates/updates `installs` row, initializes SSE stream state in `installStreams` Map
3. Returns 202 immediately; runs `runInstallWorkflow()` asynchronously
4. workflow iterates 6 install steps (Docker → Compose → dir → compose file → pull → up)
5. Each step emits `InstallEvent` to SSE listeners and persists to DB
6. Client opens `EventSource` to `GET /api/servers/:id/install/events` for real-time logs
7. On reconnect, server replays prior events from DB log text

### Server Action Flow (Restart/Update/Rollback)
1. User clicks action button, sees inline `ConfirmationCard` dialog
2. On confirm, `POST /api/servers/:id/actions` with `{ action, targetVersion? }`
3. Server resolves credential, builds SSH command from `actionCommands` map
4. Executes over SSH via `withSshConnection()`, writes audit log entries
5. Returns result to client; client prepends to local action history

## Key Abstractions

**AppShell:** Shared authenticated layout component exported from `src/routes/dashboard.tsx`. Wraps all dashboard pages with sidebar navigation, user header, responsive grid. Used by every authenticated route via `<AppShell>...</AppShell>`.

**ConnectionWizard:** Reusable multi-step form component in `src/features/servers/connection-wizard.tsx`. Manages its own step state, validation, and field rendering. Returns a `ConnectionDraft` object on submit.

**withSshConnection:** Generic SSH connection wrapper in `server/ssh.ts`. Connects, executes a callback, disposes. All SSH operations (verify, install, actions, metrics) flow through this.

**InstallStreamState:** In-memory state per server ID holding events array, listeners set, and run ID. Lives in `server/install.ts`. Enables SSE replay on reconnect and run-stale detection via `runId`.

**Ephemeral Credentials:** In-memory `Map<string, EphemeralCredentialRecord>` in `server/credentials.ts`. Keyed by `serverId:sessionId`. Falls back to encrypted DB credential when `storeCredential` is true.

## Entry Points

**Server Entry:** `src/server.ts` — creates TanStack Start handler with custom `fetch()` that routes `/api/*` to Hono `apiApp` and everything else to TanStack SSR.

**API Router:** `server/app.ts` — Hono instance with `.basePath("/api")` registering all REST endpoints and auth proxying.

**Client Router:** `src/router.tsx` — creates TanStack Router instance with auto-generated `routeTree`.

**Route Tree:** `src/routeTree.gen.ts` — auto-generated by `@tanstack/router-plugin`; do not edit.

## Error Handling

**Strategy:** Layered error handling with custom error classes:
- `SshConnectError` — normalized SSH failures ("invalid credentials", "host unreachable")
- `UnsupportedOsError` — OS not supported for Hermes install
- `ProviderConnectionError` — AI provider API connection failures (invalid key vs connection failed)
- `TelegramConnectionError` — Telegram bot token verification failures
- API handlers use try/catch with JSON error responses like `{ error: string }`
- Frontend feature components use local `error` state with inline error banners
- Hono errors for validation (400), auth (401), not found (404), conflicts (409)
- Audit logs record both success and failure for all server operations

## Cross-Cutting Concerns

**Authentication:** Better Auth with magic-link-only flow. Lazy initialization (getter in `server/auth.ts`). Session checked via `getRequestHeaders()` → `getAuthSession()`. Frontend uses `authClient` singleton from `src/lib/auth-client.ts` with `magicLinkClient()` plugin. Route guard via `requireSession()` in `beforeLoad` hooks. Unauthenticated redirects to `/login`.

**Encryption:** AES-256-GCM via `server/crypto.ts`. Used for stored SSH credentials (`servers.encryptedCredential`) and AI provider API keys (`ai_providers.encryptedApiKey`). Key derived from `ENCRYPTION_KEY` env var.

**Audit Trail:** All server operations (connect, install, actions, provider saves, telegram connects) write to `audit_logs` table with action name, details JSONB, and IP address. Action history on server detail page queries finished action audit entries.

**Credential Management:** Dual strategy — persisted (encrypted in DB) for stored credentials, or ephemeral (in-memory Map keyed by `serverId:sessionId`) for session-only credentials. Resolved via `resolveServerCredential()` pattern used by install, actions, and dashboard health checks.
