# Codebase Structure

**Analysis Date:** 2026-06-06

## Directory Layout

```
hermes-hub/
├── src/                    # TanStack Start frontend (routes, features, components, lib)
├── server/                 # Hono API handlers and backend domain logic
├── shared/                 # Cross-boundary TypeScript contracts
├── drizzle/                # SQL migration files (generated/applied by drizzle-kit)
├── scripts/                # Production start, DB migrate, brand assets, ralph tooling
├── docs/                   # API reference and test coverage notes
├── .github/workflows/      # CI (biome, typecheck, test, build) and deploy
├── vite.config.ts          # Vite + TanStack Start + Vitest config
├── drizzle.config.ts       # Drizzle Kit schema/migration config
├── tsconfig.json           # TS paths: @/* and #/* → src/*
├── package.json            # Bun scripts and dependencies
├── compose.yaml            # Local/docker compose for Postgres
├── Dockerfile              # Production container build
├── justfile                # Thin wrappers around bun scripts
└── AGENTS.md               # Repo-specific agent/dev conventions
```

## Directory Purposes

**`src/`:**
- Purpose: Client and SSR frontend — routing, pages, UI components, client helpers
- Contains: `routes/` (file-based TanStack Router), `features/` (page logic), `components/` (shared UI), `lib/` (auth, session, loaders), `server.ts` (unified entry)
- Key files: `src/server.ts`, `src/router.tsx`, `src/routeTree.gen.ts`, `src/routes/*.tsx`, `src/features/**`, `src/lib/session.ts`, `src/lib/auth-client.ts`

**`server/`:**
- Purpose: All backend logic consumed by Hono API and `createServerFn` loaders
- Contains: Top-level domain modules, `db/`, `install/`, `ssh/`, `hermes/`, `web-ui/`, `dashboard/`, `servers/`, `settings/`, `telegram/`, `lib/` helpers
- Key files: `server/app.ts`, `server/auth.ts`, `server/db/schema.ts`, `server/install.ts`, `server/servers.ts`, `server/server-actions.ts`

**`shared/`:**
- Purpose: Types/contracts safe to import from both `src/` and `server/`
- Contains: `contracts/server-health-check.ts`, `contracts/server-web-ui.ts`
- Key files: `shared/contracts/*.ts`

**`drizzle/`:**
- Purpose: Versioned PostgreSQL migrations and Drizzle metadata snapshots
- Contains: `0000_*.sql` … `0014_*.sql`, `meta/_journal.json`, `meta/*_snapshot.json`
- Key files: `drizzle/meta/_journal.json`, latest `drizzle/0014_*.sql`

**`scripts/`:**
- Purpose: Operational scripts outside the main app bundle
- Contains: `start-production.mjs`, `db-migrate.mjs`, `generate-brand-assets.ts`, `ralph/` agent tooling
- Key files: `scripts/start-production.mjs`, `scripts/db-migrate.mjs`

**`docs/`:**
- Purpose: Human-written reference documentation
- Contains: `api-reference.md`, `test-coverage-review.md`

**`.github/workflows/`:**
- Purpose: CI/CD automation
- Contains: `ci.yml` (biome → typecheck → test → build), `deploy.yml`, `react-doctor.yml`

## Key File Locations

**Entry Points:**
- `src/server.ts`: Unified fetch — `/api/*` → Hono, else TanStack Start SSR
- `server/app.ts`: Hono `apiApp` with all REST route registrations
- `src/router.tsx`: TanStack Router factory using generated route tree
- `scripts/start-production.mjs`: Production HTTP server (migrations + static + SSR)
- `vite.config.ts`: Dev/build tooling; Vitest test glob for `src/` and `server/`

**Configuration:**
- `package.json`: Scripts (`dev`, `build`, `test`, `typecheck`, `db:migrate`, `db:generate`)
- `tsconfig.json`: Strict TS, path aliases `@/*` and `#/*` → `./src/*`
- `drizzle.config.ts`: Schema at `server/db/schema.ts`, migrations out to `drizzle/`
- `biome.json`: Lint/format (excludes `src/routeTree.gen.ts`)
- `compose.yaml`: Local Postgres for development
- `.env.example`: Expected environment variables
- `justfile`: `just dev`, `just test`, `just db-migrate` wrappers

**Core Logic:**
- `server/db/schema.ts`: All Drizzle table definitions (users, servers, installs, providers, telegram, mcp, audit_logs, etc.)
- `server/db/index.ts`: `getDb()` singleton (requires `DATABASE_URL`)
- `server/auth.ts`: Better Auth lazy singleton, `getAuthSession()`
- `server/ssh/connection.ts`: SSH connect/verify/execute abstraction
- `server/install/workflow.ts`: VPS install orchestration
- `server/install/sse-stream.ts`: In-memory install SSE + `emitInstallEvent` transactions
- `server/hermes/runtime.ts`: Remote Hermes container restart/update/rollback
- `server/hermes/deploy.ts`: Config deployment over SSH
- `server/credentials.ts`: Session-scoped in-memory SSH credential cache
- `server/crypto.ts`: Encrypt/decrypt secrets at rest
- `server/request-guards.ts`: Auth + server ownership + SSH resolution guards
- `server/lib/insert-audit-log.ts`: Shared audit log writer

**Frontend Routes (thin — delegate to features):**
- `src/routes/__root.tsx`: Root layout shell (`RootDocument`)
- `src/routes/index.tsx`: Landing page; redirects authed users to `/dashboard`
- `src/routes/login.tsx`: Magic-link login
- `src/routes/dashboard.tsx`: Dashboard with `createServerFn` loader
- `src/routes/servers.index.tsx`, `src/routes/servers.new.tsx`, `src/routes/servers.$id.tsx`, `src/routes/servers.$id.install.tsx`: Server management
- `src/routes/ai-provider.tsx`, `src/routes/telegram.tsx`, `src/routes/settings.tsx`, `src/routes/logs.tsx`: Config and observability pages
- `src/routes/about.tsx`: About page

**Frontend Features (page implementations):**
- `src/features/dashboard/`: `app-shell.tsx`, `dashboard-page.tsx`, `status-overview.tsx`
- `src/features/servers/`: Connection wizard, detail, install progress, web-ui card, hooks
- `src/features/providers/`: AI provider configuration page
- `src/features/telegram/`: Telegram bot connect/deploy/pairing UI
- `src/features/settings/`: Persona and MCP server management
- `src/features/logs/`: Audit log viewer
- `src/features/auth/`: Login page
- `src/features/landing/`: Marketing landing page

**Testing:**
- `src/**/*.{test,spec}.{ts,tsx}`: Frontend unit/component tests (Vitest + Testing Library)
- `server/**/*.{test,spec}.ts`: Backend unit/integration tests (Vitest, `environment: "node"`)
- `vite.config.ts`: Test include globs for both trees

## Naming Conventions

**Files:**
- Routes: TanStack file-based naming — `dashboard.tsx`, `servers.$id.tsx`, `servers.$id.install.tsx` in `src/routes/`
- Features: kebab-case component files — `server-detail-page.tsx`, `connection-wizard.tsx` in `src/features/<domain>/`
- Server handlers: kebab-case or domain name — `server-actions.ts`, `server-detail-snapshot.ts` in `server/`
- Server submodules: directory per domain — `server/install/workflow.ts`, `server/web-ui/proxy-http.ts`
- Tests: co-located `*.test.ts` / `*.test.tsx` next to source (e.g. `server/ssh/connection.test.ts`)
- Shared UI: `src/components/ui/button.tsx`, `button-variants.ts` (CVA variants separated)

**Directories:**
- `src/features/<domain>/`: One folder per product area (servers, telegram, settings, providers, dashboard, logs, auth, landing, about)
- `server/<domain>/`: Backend subsystems with multiple files (install, ssh, hermes, web-ui, dashboard, servers, settings, telegram)
- `server/lib/`: Small shared backend utilities (not domain-specific)
- `shared/contracts/`: Cross-layer type definitions

**Imports:**
- Frontend uses `@/` or `#/` aliases for `src/` (both map to `./src/*` in `tsconfig.json`; `package.json` `imports` uses `#/*`)
- Routes and `src/lib/` import `server/` via relative paths like `../../server/auth` (no `@server` alias)
- Route files stay thin; heavy UI lives in `src/features/`

**Database:**
- Tables: snake_case plural (`servers`, `install_events`, `audit_logs`, `mcp_servers`)
- App-owned PKs: `text(...).primaryKey().default(sql\`gen_random_uuid()::text\`)` per `AGENTS.md`
- Better Auth tables use singular export aliases (`user`, `session`, `account`, `verification`) at bottom of `server/db/schema.ts`

## Where to Add New Code

**New Feature (authenticated page):**
- Primary code: `src/routes/<route>.tsx` (route + `createServerFn` loader), `src/features/<domain>/<page>.tsx` (UI)
- API (if needed): handler in `server/<domain>.ts` or new module, register in `server/app.ts`
- Tests: `src/features/<domain>/*.test.tsx`, `server/<domain>.test.ts`

**New API Endpoint:**
- Implementation: new exported handler function in appropriate `server/` module
- Registration: `server/app.ts` (add `httpsMiddleware` for credential-bearing mutating routes in production)
- Guards: use `requireAuthSession` / `requireOwnedServerSsh` from `server/request-guards.ts` where applicable

**New Component/Module:**
- Implementation: `src/features/<domain>/` for page-specific; `src/components/` for shared layout/chrome; `src/components/ui/` for primitives
- Use `cn()` from `src/lib/utils.ts` and existing UI primitives

**Utilities:**
- Shared frontend helpers: `src/lib/`
- Shared backend helpers: `server/lib/`
- Cross-boundary types only: `shared/contracts/`

**Database Changes:**
- Schema: `server/db/schema.ts`
- Generate migration: `bun run db:generate`
- Apply locally: `bun run db:migrate` (requires `DATABASE_URL`)
- Production: auto-migrate at startup in `scripts/start-production.mjs`

**SSH / Remote Operations:**
- Connection primitives: `server/ssh/`
- Hermes-specific remote commands: `server/hermes/`
- Compose generation: `server/compose.ts`, `server/server-compose.ts`

## Special Directories

**`src/routeTree.gen.ts`:**
- Purpose: Auto-generated TanStack Router route tree
- Generated: Yes (TanStack Router plugin during dev/build)
- Committed: Yes (do not hand-edit; excluded from Biome checks per `AGENTS.md`)

**`drizzle/meta/`:**
- Purpose: Drizzle Kit migration journal and schema snapshots
- Generated: Yes (`bun run db:generate`)
- Committed: Yes

**`dist/`:**
- Purpose: Vite build output (`dist/client/` static, `dist/server/` SSR bundle)
- Generated: Yes (`bun run build`)
- Committed: No (build artifact)

**`node_modules/`:**
- Purpose: Dependencies (managed by Bun, lockfile `bun.lock`)
- Generated: Yes
- Committed: No

**`scripts/ralph/`:**
- Purpose: Agent/automation tooling (PRD, prompts, progress tracking)
- Generated: Partially (progress files)
- Committed: Mixed — not part of runtime app

**`.tsbuildinfo`:**
- Purpose: TypeScript incremental build cache (`tsconfig.json`)
- Generated: Yes
- Committed: No (typically gitignored)

---

*Structure analysis: 2026-06-06*
