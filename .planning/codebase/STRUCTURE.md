# Codebase Structure

**Analysis Date:** 2026-06-06

## Directory Layout

```
daegu/
├── .github/workflows/      # CI/CD pipelines (ci.yml, deploy.yml)
├── .planning/codebase/     # Architecture/structure docs (this location)
├── docs/                   # Project documentation (api-reference, test-coverage)
├── drizzle/                # Database migrations (SQL files + meta snapshots)
├── public/                 # Static assets (logos, favicon, manifest, robots.txt)
├── scripts/                # Utility scripts (start-production.mjs)
├── server/                 # Backend API (Hono) + business logic
├── src/                    # Frontend (TanStack Start + React)
├── tasks/                  # Task definitions (PRD)
├── .dockerignore           # Docker ignore rules
├── .env.example            # Environment variable template
├── .gitignore              # Git ignore rules
├── .pre-commit-config.yaml # Pre-commit hooks (biome, etc.)
├── AGENTS.md               # Agent instructions for this repo
├── app.json                # Fly.io app config
├   biome.json              # Biome lint/format config
├── components.json         # shadcn/ui component registry
├── compose.yaml            # Docker Compose for local dev
├── CONTEXT.md              # Project context summary
├── CLAUDE.md               # Claude Code instructions (points to AGENTS.md)
├── DESIGN.md               # Design system documentation
├── Dockerfile              # Production Docker image
├── justfile                # Task runner commands
├── LICENSE                 # MIT License
├── package.json            # Dependencies and scripts
├── README.md               # Project overview
├── tsconfig.json           # TypeScript config
├── vite.config.ts          # Vite config (excludes node-ssh/ssh2 from optimizeDeps)
└── bun.lock                # Bun lockfile
```

## Directory Purposes

**server/ — Backend API & Orchestration:**
- Purpose: Hono API server, SSH orchestration, install workflows, Telegram bot, providers, database access, auth
- Contains: Route handlers (`app.ts`), domain modules (`servers/`, `install/`, `ssh/`, `telegram/`, `web-ui/`), DB schema/queries (`db/`), shared libs (`lib/`), constants, audit log actions
- Key files: `app.ts`, `auth.ts`, `db/schema.ts`, `db/index.ts`, `install/workflow.ts`, `install/sse-stream.ts`, `ssh/connection.ts`, `server-actions.ts`, `servers/list.ts`, `dashboard/summaries.ts`

**src/ — Frontend Application:**
- Purpose: TanStack Start routes, React components, feature modules, shared utilities
- Contains: File-based routes (`routes/`), feature components (`features/`), shared UI primitives (`components/ui/`), lib helpers (`lib/`), router setup (`router.tsx`), entry point (`server.ts`), global styles (`styles.css`)
- Key files: `server.ts`, `router.tsx`, `routes/__root.tsx`, `routes/dashboard.tsx`, `routes/servers.$id.tsx`, `lib/auth-client.ts`, `lib/session.ts`, `lib/utils.ts`

**src/routes/ — TanStack Start Pages:**
- Purpose: File-based routing with route loaders and components
- Contains: Route files (`dashboard.tsx`, `servers.index.tsx`, `servers.$id.tsx`, `servers.$id.install.tsx`, `servers.new.tsx`, `ai-provider.tsx`, `telegram.tsx`, `logs.tsx`, `settings.tsx`, `login.tsx`, `about.tsx`, `index.tsx`)
- Pattern: `beforeLoad` for auth/data loading, component for UI

**src/features/ — Feature Modules (Colocated UI + Logic):**
- Purpose: Self-contained feature components with hooks, helpers, tests
- Contains:
  - `servers/` — Server list, detail, basics form, install progress, actions, connection wizard, delete dialog
  - `dashboard/` — Status overview cards
  - `providers/` — AI provider settings, custom provider form
  - `telegram/` — Connect, pairing, deploy, test, settings sections
  - `logs/` — Logs viewer with SSE
- Key files: `servers/server-detail.tsx`, `servers/use-server-basics.ts`, `servers/use-server-actions.ts`, `servers/install-progress.tsx`, `telegram/telegram-settings.tsx`, `dashboard/status-overview.tsx`

**src/components/ui/ — Shared UI Primitives:**
- Purpose: Reusable design system components (button, banner)
- Contains: `button.tsx`, `banner.tsx`
- Used by: Feature components, routes

**src/lib/ — Shared Frontend Utilities:**
- Purpose: Auth client, session helpers, type definitions, formatters, hooks
- Contains: `auth-client.ts`, `session.ts`, `servers.ts`, `server-detail.ts`, `utils.ts`, `status-pill.ts`, `dashboard-status.ts`, `logs.ts`, `ai-providers.ts`, `hermes-community.ts`, `use-mount-effect.ts`

**server/db/ — Database Layer:**
- Purpose: Drizzle schema, connection, health checks
- Contains: `schema.ts` (all tables), `index.ts` (lazy singleton `getDb()`), `health.ts`

**server/ssh/ — SSH Abstraction Layer:**
- Purpose: Connection management, host key verification, OS detection, error normalization
- Contains: `connection.ts`, `errors.ts`, `host-key-fingerprint.ts`, `os.ts`, `quoting.ts`

**server/install/ — Install Workflow Engine:**
- Purpose: Multi-step install orchestration, SSE streaming, DB persistence
- Contains: `workflow.ts` (step definitions), `sse-stream.ts` (in-memory streams + emit), `records.ts` (DB queries), `legacy-log.ts` (migration fallback)

**server/telegram/ — Telegram Bot Integration:**
- Purpose: Bot pairing, deployment to server, config management
- Contains: `config.ts`, `pairings.ts`, `records.ts`, plus `telegram.ts` (API handlers)

**server/web-ui/ — Hermes Web UI Proxy:**
- Purpose: Deploy/manage Hermes web UI on servers, HTTP/WebSocket proxy
- Contains: `handlers.ts`, `proxy-http.ts`, `ssh-forward.ts`, `ssh-pool.ts`, `reachability.ts`, `records.ts`, `password.ts`, `context.ts`

**drizzle/ — Database Migrations:**
- Purpose: Versioned SQL migrations generated by drizzle-kit
- Contains: Numbered SQL files (`0000_*.sql`...), meta snapshots (`meta/*.json`)
- Generated: Yes (by `drizzle-kit generate`)
- Committed: Yes

**src/routeTree.gen.ts — Generated Route Tree:**
- Purpose: Type-safe route definitions for TanStack Router
- Generated: Yes (by `@tanstack/router-plugin` at build)
- Committed: Yes (excluded from biome checks)

## Key File Locations

**Entry Points:**
- `src/server.ts` — SSR entrypoint, routes `/api/*` to Hono, rest to TanStack Start
- `server/app.ts` — Hono API app with all `/api/*` route definitions
- `src/router.tsx` — TanStack Router factory with generated route tree
- `src/routes/__root.tsx` — Root layout (HTML, Header, Footer, theme script)

**Configuration:**
- `vite.config.ts` — Vite config (excludes `node-ssh`, `ssh2`, `cpu-features` from optimizeDeps)
- `tsconfig.json` — TypeScript config (strict, path aliases `@/*` → `src/*`)
- `drizzle.config.ts` — Drizzle config (throws if `DATABASE_URL` missing)
- `biome.json` — Lint/format (excludes `src/routeTree.gen.ts`)
- `components.json` — shadcn/ui registry (uses `@/components/ui`)
- `app.json` — Fly.io deployment config
- `compose.yaml` — Local Postgres + app services

**Core Logic:**
- `server/auth.ts` — Better Auth lazy initialization
- `server/db/schema.ts` — All Drizzle table definitions
- `server/servers/list.ts` — Server list snapshot aggregation
- `server/server-detail-snapshot.ts` — Server detail aggregation
- `server/install/sse-stream.ts` — Install SSE state machine
- `server/install/workflow.ts` — Install step execution
- `server/server-actions.ts` — Restart/update/rollback with transactional audit
- `server/ssh/connection.ts` — SSH connection lifecycle + host key pinning
- `server/dashboard/summaries.ts` — Dashboard status aggregation

**Testing:**
- `server/*.test.ts` — Unit/integration tests co-located with modules
- `src/**/*.test.tsx` — Frontend component tests (Vitest + Testing Library)
- `vite.config.ts` — Vitest config (in `test` section)

## Naming Conventions

**Files:**
- Routes: `kebab-case.tsx` (`servers.$id.tsx`, `servers.$id.install.tsx`)
- Server modules: `kebab-case.ts` (`server-actions.ts`, `server-detail-snapshot.ts`)
- React components: `PascalCase.tsx` (`ServerDetail.tsx`, `InstallLogCard.tsx`)
- Hooks: `use-kebab-case.ts` (`use-server-basics.ts`, `use-mount-effect.ts`)
- Types: `PascalCase` suffix `Snapshot`, `Record`, `Draft`, `Errors`
- Tests: `*.test.ts` / `*.test.tsx` co-located
- Database: `snake_case` tables/columns (`install_events`, `host_key_fingerprint`)

**Directories:**
- Feature folders: `kebab-case` (`servers/`, `telegram/`, `providers/`)
- Server domain folders: `kebab-case` (`ssh/`, `install/`, `web-ui/`)
- UI primitives: `components/ui/`

**TypeScript:**
- Path alias: `@/*` → `src/*` (defined in `tsconfig.json` and `vite.config.ts`)
- Server imports: relative (`../server/...`) or `../../server/...` from routes
- Generated: `src/routeTree.gen.ts` (do not edit manually)

## Where to Add New Code

**New Feature (Full-Stack):**
- Primary backend: `server/<feature>/` (handlers, records, workflow)
- Primary frontend: `src/features/<feature>/` (components, hooks)
- API routes: Add to `server/app.ts` with `httpsMiddleware` for mutations
- Types: Shared in `src/lib/<feature>.ts` or `src/lib/server-detail.ts`
- Database: Add table to `server/db/schema.ts`, run `bun run db:generate`
- Tests: Co-located `*.test.ts` / `*.test.tsx`

**New Server Action / Endpoint:**
- Handler: `server/<domain>.ts` or `server/<domain>/handlers.ts`
- Route: Register in `server/app.ts` with `httpsMiddleware`
- Auth: Call `getAuthSession(context.req.raw.headers)` in handler
- Audit: Use `insertAuditLog` for mutating operations
- Transaction: Wrap multi-write operations in `db.transaction()`

**New Frontend Page:**
- Route file: `src/routes/<path>.tsx` with `createFileRoute`
- Loader: `beforeLoad` with `requireSession` + server function for data
- Shell: Wrap in `AppShell` from `routes/dashboard.tsx` for authenticated pages
- Components: Build in `src/features/<feature>/`

**Utilities / Shared Helpers:**
- Frontend: `src/lib/<name>.ts`
- Backend: `server/lib/<name>.ts`
- Cross-cutting: `src/lib/utils.ts` (cn, formatters)

## Special Directories

**node_modules/:**
- Purpose: Dependencies (Bun-managed)
- Generated: Yes (by `bun install`)
- Committed: No

**dist/:**
- Purpose: Production build output (Vite + TanStack Start)
- Generated: Yes (by `bun run build`)
- Committed: No (but present in repo currently)

**drizzle/meta/:**
- Purpose: Migration snapshots for drizzle-kit
- Generated: Yes (by `drizzle-kit generate`)
- Committed: Yes

**src/routeTree.gen.ts:**
- Purpose: Type-safe route tree for TanStack Router
- Generated: Yes (by `@tanstack/router-plugin` at build)
- Committed: Yes
- Note: Excluded from biome checks via `biome.json`

**.github/workflows/:**
- Purpose: CI (biome → typecheck → test → build) and deploy (Fly.io)
- Generated: No
- Committed: Yes

---

*Structure analysis: 2026-06-06*
