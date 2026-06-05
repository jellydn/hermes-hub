# Codebase Structure

**Analysis Date:** 2026-06-02

## Directory Layout

```
hermes-hub/
├── AGENTS.md                # Repo-specific agent guidance (commands, gotchas, conventions)
├── CLAUDE.md                # Single-line pointer to AGENTS.md
├── CONTEXT.md               # Glossary of project-specific terms
├── DESIGN.md                # Design tokens + component spec
├── README.md                # User-facing overview, scripts, env vars
├── LICENSE                  # MIT
├── package.json             # Bun scripts (dev / build / test / typecheck / db:generate)
├── bun.lock                 # Bun lockfile (canonical)
├── biome.json               # Lint/format config (excludes src/routeTree.gen.ts)
├── tsconfig.json            # TypeScript config
├── vite.config.ts           # Vite + Vitest; excludes node-ssh / ssh2 / cpu-features
├── drizzle.config.ts        # Drizzle config (throws at import if DATABASE_URL missing)
├── justfile                 # Thin wrappers over bun scripts
├── compose.yaml             # Local stack: Postgres + Mailpit + app
├── Dockerfile               # Production image (bakes NODE_ENV=production)
├── app.json                 # Deploy descriptor (runs drizzle-kit migrate)
├── components.json          # shadcn config
├── opencode.json            # OpenCode tool config
├── autoresearch.ideas.md    # Working notes
├── autoresearch.jsonl       # Working notes
│
├── server/                  # Hono API + business logic + Drizzle layer
│   ├── app.ts               # Hono entrypoint; mounts /api/*, HTTPS guard, rate limiter
│   ├── auth.ts              # Better Auth (lazy)
│   ├── crypto.ts            # AES-256-GCM helpers
│   ├── credentials.ts       # In-process SSH credential cache (30-min TTL)
│   ├── constants.ts         # Shared constants
│   ├── compose.ts           # Hermes Docker Compose generation
│   ├── deploy.ts            # Provider deploy to Hermes container
│   ├── dashboard.ts         # Dashboard snapshot + cache orchestration
│   ├── install.ts           # Install API handlers + workflow glue
│   ├── logs.ts              # Aggregated install + action log read/clear
│   ├── providers.ts         # AI provider save/test handlers
│   ├── server-actions.ts    # Restart / update / rollback handlers
│   ├── server-detail-snapshot.ts  # SSR snapshot for server detail page
│   ├── server-records.ts    # Authorization + SSH config resolution
│   ├── servers.ts           # VPS connection (insert, host-key, update, delete)
│   ├── ssh.ts               # SSH facade re-exports
│   ├── telegram.ts          # Telegram connect/disconnect/deploy/test/pairings
│   ├── dashboard/           # Dashboard internals (metrics, records, summaries)
│   ├── db/                  # Drizzle schema, lazy client, health check
│   ├── install/             # Install internals (records, sse-stream, workflow)
│   ├── lib/                 # Shared server helpers (audit log, client IP, email)
│   ├── providers/           # Provider config/connection/records
│   ├── servers/             # Server list + records helpers
│   ├── ssh/                 # SSH primitives (connection, errors, os, quoting, fingerprint)
│   ├── telegram/            # Telegram config / pairings / records helpers
│   └── __snapshots__/       # Vitest snapshots
│
├── src/                     # TanStack Start frontend
│   ├── server.ts            # Server entrypoint (/api/* → Hono, else → TanStack Start)
│   ├── router.tsx           # Router factory
│   ├── routeTree.gen.ts     # Generated route tree (do not edit)
│   ├── styles.css           # Tailwind v4 stylesheet
│   ├── routes/              # File-based routes (13 files)
│   ├── features/            # Feature-grouped UI (dashboard, logs, providers, servers, telegram)
│   ├── components/          # Shared chrome + ui primitives
│   └── lib/                 # Client helpers (auth, session, server-fn callers, utils)
│
├── drizzle/                 # Generated migrations (deploy runs drizzle-kit migrate)
├── docs/                    # Long-form documentation (e.g. docs/api-reference.md)
├── public/                  # Static assets
├── scripts/                 # Maintenance scripts
└── tasks/                   # Planning artifacts
```

## Directory Purposes

**`server/`:**
- Purpose: Hono API + all business logic, owned by the Node process.
- Contains: route handlers, SSH orchestration, install workflow, dashboard aggregation, Drizzle persistence, audit logging, encryption.
- Key files: `server/app.ts`, `server/auth.ts`, `server/install.ts`, `server/dashboard.ts`, `server/server-actions.ts`, `server/db/schema.ts`.

**`server/db/`:**
- Purpose: persistence layer.
- Contains: `server/db/schema.ts` (all tables — app + Better Auth), `server/db/index.ts` (lazy pooled client), `server/db/health.ts` (connection probe).

**`server/ssh/`:**
- Purpose: SSH primitives.
- Contains: `server/ssh/connection.ts` (`withSshConnection` lifecycle), `server/ssh/errors.ts` (`normalizeSshError`), `server/ssh/os.ts` (OS detection + support level), `server/ssh/quoting.ts` (shell quoting), `server/ssh/host-key-fingerprint.ts` (TOFU fingerprints).

**`server/install/`:**
- Purpose: install workflow internals.
- Contains: `server/install/sse-stream.ts` (in-memory stream + heartbeat + idle timeout + transactional `emitInstallEvent`), `server/install/workflow.ts` (`installSteps`, `runInstallWorkflow`), `server/install/records.ts` (server lookup + install row upsert).

**`server/dashboard/`:**
- Purpose: dashboard snapshot internals.
- Contains: `server/dashboard/records.ts` (latest server/install/provider/telegram queries), `server/dashboard/summaries.ts` (DB row → UI summary mappers), `server/dashboard/metrics.ts` (15s-cached SSH metrics).

**`server/providers/`, `server/telegram/`, `server/servers/`:**
- Purpose: per-domain helpers split out of the original monolithic modules.
- Contains: `config.ts` (validation + persistence), `connection.ts` (external API calls), `records.ts` (Drizzle reads/writes), `pairings.ts` (Telegram), `list.ts` (servers, indexed audit query).

**`server/lib/`:**
- Purpose: cross-cutting server helpers.
- Contains: `server/lib/insert-audit-log.ts`, `server/lib/get-client-ip.ts` (rightmost x-forwarded-for, `TRUSTED_PROXY_COUNT`-aware), `server/lib/get-last-4.ts`, `server/lib/send-magic-link-email.ts`.

**`src/routes/`:**
- Purpose: TanStack Start file-based routes. Files are intentionally thin; UI lives in `src/features/`.
- Contains: `__root.tsx` (root layout), `dashboard.tsx` (also exports `AppShell` reused by authenticated pages), `servers.$id.tsx` (uses `useMountEffect` instead of a loader), `servers.$id.install.tsx`, `servers.index.tsx`, `servers.new.tsx`, `ai-provider.tsx`, `telegram.tsx`, `logs.tsx`, `settings.tsx`, `login.tsx`, `index.tsx`, `about.tsx`.

**`src/features/`:**
- Purpose: feature-grouped UI panels and their unit tests.
- Contains: `src/features/dashboard/status-overview.tsx`, `src/features/logs/logs-viewer.tsx`, `src/features/providers/provider-settings.tsx`, `src/features/servers/{connection-wizard,install-progress,install-log-card,server-action-controls,server-basics-form,server-detail,server-detail-aside,server-detail-helpers,server-list}.tsx`, `src/features/telegram/{telegram-connect-section,telegram-deploy-section,telegram-pairing-section,telegram-settings,telegram-sidebar,telegram-test-section,telegram-input-class}.tsx`.

**`src/components/`:**
- Purpose: shared chrome and shadcn-style primitives.
- Contains: `src/components/Header.tsx`, `src/components/Footer.tsx`, `src/components/ThemeToggle.tsx`, `src/components/ui/button.tsx`.

**`src/lib/`:**
- Purpose: client-side helpers and shared types.
- Contains: `src/lib/auth-client.ts` (absolute SSR base URL via `BETTER_AUTH_URL`), `src/lib/session.ts` (`requireSession`), `src/lib/use-mount-effect.ts` (the only sanctioned `useEffect` escape hatch), `src/lib/dashboard-status.ts`, `src/lib/servers.ts`, `src/lib/server-detail.ts`, `src/lib/logs.ts`, `src/lib/status-pill.ts`, `src/lib/ai-providers.ts`, `src/lib/utils.ts` (`cn`).

**`drizzle/`:**
- Purpose: generated SQL migrations. Generated by `bun run db:generate`. Applied on deploy via `drizzle-kit migrate` (`app.json`, `.github/workflows/deploy.yml`). No local `bun run db:migrate` script despite the README mentioning it (`AGENTS.md` → Verified Gotchas).

## Key File Locations

**Entry Points:**
- `src/server.ts`: HTTP demux — `/api/*` → Hono, else → TanStack Start.
- `server/app.ts`: Hono app + all `/api` route bindings.
- `src/routes/__root.tsx`: page root layout, theme bootstrap, devtools.
- `src/router.tsx`: router factory consumed by TanStack Start.

**Configuration:**
- `package.json`: Bun scripts (`dev`, `build`, `test`, `typecheck`, `db:generate`).
- `biome.json`: lint/format (excludes `src/routeTree.gen.ts`).
- `vite.config.ts`: Vite + Vitest; excludes `node-ssh`, `ssh2`, `cpu-features` from `optimizeDeps`.
- `drizzle.config.ts`: Drizzle Kit config (imports throw if `DATABASE_URL` is unset).
- `tsconfig.json`: TS settings + path aliases (`@/` → `src/`).
- `components.json`: shadcn config.
- `compose.yaml`: local dev stack (Postgres + Mailpit + app).
- `Dockerfile`: production image (bakes `NODE_ENV=production`; HTTPS guard reads `globalThis.process.env.NODE_ENV` to avoid Vite inlining).
- `justfile`: `just dev|test|typecheck|check|lint|format|ci`.

**Core Logic:**
- `server/auth.ts`: Better Auth instance (lazy).
- `server/db/schema.ts`: Drizzle schema for app + Better Auth tables.
- `server/install.ts` + `server/install/`: install pipeline + SSE.
- `server/server-actions.ts`: restart / update / rollback with transactional version bump.
- `server/dashboard.ts` + `server/dashboard/`: aggregated status + two-tier caching.
- `server/ssh/connection.ts`: `withSshConnection` — the SSH boundary.
- `server/crypto.ts`: AES-256-GCM helpers.
- `server/lib/insert-audit-log.ts`: single audit-log insertion point.

**Testing:**
- Co-located: `*.test.ts` / `*.test.tsx` next to the file under test (e.g. `server/install/sse-stream.test.ts`, `src/features/servers/server-detail.test.tsx`, `src/lib/session.test.ts`).
- Snapshots: `server/__snapshots__/`.
- Runner: Vitest configured in `vite.config.ts`. Run with `bun run test` (do not use `bun test`; the repo uses Vitest, not Bun's built-in runner).

## Naming Conventions

**Files:**
- Server modules: kebab-case `.ts` (e.g. `server-actions.ts`, `insert-audit-log.ts`).
- Server tests: `<name>.test.ts` next to source.
- React components: kebab-case `.tsx` (e.g. `status-overview.tsx`, `server-detail.tsx`). Chrome components in `src/components/` use PascalCase `.tsx` (`Header.tsx`, `Footer.tsx`, `ThemeToggle.tsx`).
- shadcn primitives: lowercase `.tsx` under `src/components/ui/`.
- Route files: TanStack Start convention — dots split path segments and `$` marks params (`servers.$id.install.tsx` → `/servers/:id/install`).
- Generated files: `src/routeTree.gen.ts` (excluded from Biome).

**Directories:**
- Domain split inside `server/`: a `<domain>.ts` orchestrator beside a `<domain>/` folder for internals (e.g. `install.ts` + `install/`, `dashboard.ts` + `dashboard/`, `providers.ts` + `providers/`, `telegram.ts` + `telegram/`).
- `src/features/<domain>/` for UI panels; `src/lib/` for shared client helpers; `src/components/ui/` for primitives.

## Where to Add New Code

**New API endpoint:**
- Handler: `server/<domain>.ts` (or `server/<domain>/<file>.ts` for internals).
- Wire it: register in `server/app.ts`; add `httpsMiddleware` if it accepts credentials.
- Tests: `server/<domain>.test.ts` (or `server/<domain>/<file>.test.ts`).

**New page:**
- Route: `src/routes/<path>.tsx` (TanStack file-based naming).
- UI: `src/features/<domain>/<component>.tsx`.
- Server-side data: a `createServerFn` loader in the route file that calls a `server/<domain>.ts` function. Exception: `servers.$id.tsx` uses `useMountEffect` against `/api/servers/:id` — only follow that pattern when extending that page.
- Auth gating: call `requireSession` from `beforeLoad` (see `src/lib/session.ts`).
- Tests: `src/features/<domain>/<component>.test.tsx`.

**New shared UI primitive:**
- Implementation: `src/components/ui/<name>.tsx`.
- Wire-up: prefer `cn()` from `src/lib/utils.ts` and the design tokens documented in `DESIGN.md`.

**New shared helper:**
- Client-side: `src/lib/<name>.ts`.
- Server-side: `server/lib/<name>.ts`.

**New DB table:**
- Schema: extend `server/db/schema.ts`. Use `text(...).primaryKey().default(sql\`gen_random_uuid()::text\`)` for app-owned PKs.
- Migration: `bun run db:generate` produces a file under `drizzle/`. Deploy applies via `drizzle-kit migrate` — there is no `bun run db:migrate`.

**New install workflow step:**
- Step definition: `server/install/workflow.ts` (`installSteps`).
- Emit progress through `emitInstallEvent` in `server/install/sse-stream.ts` so the persisted row and live stream stay in sync.

**New mutating write that requires consistency:**
- Wrap the related writes in `db.transaction()` and document the boundary in `AGENTS.md` → "DB Transaction Boundaries". Existing examples: `deployTelegramToServer`, `runServerAction`, `emitInstallEvent`.

## Special Directories

**`drizzle/`:**
- Purpose: generated SQL migrations.
- Generated: Yes (`bun run db:generate`).
- Committed: Yes.

**`src/routeTree.gen.ts`:**
- Purpose: TanStack Router's generated route tree.
- Generated: Yes (do not edit by hand — `AGENTS.md` → Verified Gotchas).
- Committed: Yes (excluded from Biome via `biome.json`).

**`server/__snapshots__/`:**
- Purpose: Vitest snapshots.
- Generated: Yes (by `bun run test`).
- Committed: Yes.

**`tasks/`:**
- Purpose: planning artifacts.
- Generated: No.
- Committed: project decision (treat as working notes).

**`docs/`:**
- Purpose: long-form documentation (e.g. `docs/api-reference.md` referenced from `README.md`).
- Generated: No.
- Committed: Yes.

**`public/`:**
- Purpose: static assets served verbatim.
- Generated: No.
- Committed: Yes.

**`scripts/`:**
- Purpose: maintenance / one-off scripts (prefer `bun` to run them, per global guidelines).
- Generated: No.
- Committed: Yes.

---

*Structure analysis: 2026-06-02*
