# Codebase Structure

**Analysis Date:** 2026-05-28

## Directory Layout
```
hermes-hub/
├── src/                          # Frontend (TanStack Start routes, React components, client lib)
│   ├── routes/                   # File-based TanStack Start route definitions
│   ├── features/                 # Domain-specific UI components (pushed out of routes)
│   ├── components/               # Shared UI primitives and layout components
│   ├── lib/                      # Client-side utilities, types, hooks, auth client
│   ├── router.tsx                # TanStack Router factory
│   ├── routeTree.gen.ts          # Auto-generated route tree (DO NOT EDIT)
│   ├── server.ts                 # Server entrypoint (Hono/Start request router)
│   └── styles.css                # Global CSS with Tailwind directives
├── server/                       # Backend (Hono API, DB, SSH, business logic)
│   ├── app.ts                    # Hono API app with all route definitions
│   ├── auth.ts                   # Better Auth initialization and session helpers
│   ├── servers.ts                # Server connection and credential management
│   ├── install.ts                # Install orchestration workflow
│   ├── install/                  # Install-related sub-modules
│   ├── ssh.ts                    # SSH client wrapper and OS verification
│   ├── server-actions.ts         # Restart/update/rollback operations
│   ├── dashboard.ts              # Dashboard aggregation with caching
│   ├── providers.ts              # AI provider configuration and validation
│   ├── telegram.ts               # Telegram bot connection and verification
│   ├── logs.ts                   # Log aggregation from installs and audit_logs
│   ├── credentials.ts            # In-memory ephemeral credential store
│   ├── crypto.ts                 # AES-256-GCM encryption/decryption
│   ├── db/                       # Database schema, connection, and health
│   ├── lib/                      # Server utility functions
│   └── *.test.ts                 # Co-located test files
├── drizzle/                      # Generated database migrations
├── public/                       # Static assets (favicon, manifest, logos)
├── scripts/                      # Build and deployment scripts
├── docs/                         # Documentation files
├── tasks/                        # Task tracking (PRD, etc.)
├── .github/                      # GitHub Actions workflows (CI, deploy)
├── .planning/                    # Planning and analysis documents
├── dist/                         # Build output (generated, not committed)
├── .env.example                  # Environment variable template
├── app.json                      # Deployment config (empty scripts)
├── biome.json                    # Biome linter/formatter config
├── compose.yaml                  # Docker Compose for production
├── Dockerfile                    # Multi-stage production build
├── drizzle.config.ts             # Drizzle Kit configuration
├── justfile                      # Task runner shortcuts
├── package.json                  # Dependencies and scripts
├── tsconfig.json                 # TypeScript configuration
├── vite.config.ts                # Vite + TanStack Start + Tailwind v4 config
├── AGENTS.md                     # Agent-specific development guidelines
├── CLAUDE.md                     # Claude Code agent instructions
├── README.md                     # Project overview and setup
└── LICENSE                       # MIT License
```

## Directory Purposes

**src/routes/:**
- Purpose: File-based TanStack Start route definitions; each file maps to a URL path
- Contains: Route configuration objects (`createFileRoute`/`createRootRoute`), `beforeLoad` hooks for auth and data loading, `createServerFn` server-side loaders, thin page components
- Key files: `__root.tsx` (root layout with HTML shell), `dashboard.tsx` (AppShell + dashboard page + exports AppShell for reuse), `index.tsx` (landing page), `login.tsx` (magic link login), `servers.tsx` (connection wizard), `servers.$id.tsx` (server detail), `servers.$id.install.tsx` (install progress), `ai-provider.tsx` (provider settings), `telegram.tsx` (Telegram settings), `logs.tsx` (log viewer), `settings.tsx` (stub), `about.tsx` (static about page)

**src/features/:**
- Purpose: Domain-specific UI components containing actual page content and state management
- Contains: React components with local state, API fetch logic, SSE subscriptions, polling patterns
- Key files: `dashboard/status-overview.tsx` (dashboard cards with polling), `servers/connection-wizard.tsx` (3-step SSH wizard), `servers/server-detail.tsx` (server info + action buttons), `servers/install-progress.tsx` (SSE-based live install view), `providers/provider-settings.tsx` (AI provider config form), `telegram/telegram-settings.tsx` (Telegram bot connect/disconnect), `logs/logs-viewer.tsx` (install and action log display)

**src/components/:**
- Purpose: Shared UI primitives and layout components used across all pages
- Contains: Reusable React components with consistent styling
- Key files: `ui/button.tsx` (CVA-based button with variants: default, secondary, ghost, link; sizes: default, sm, lg, icon), `Header.tsx` (sticky nav with auth-aware links and theme toggle), `Footer.tsx` (copyright footer), `ThemeToggle.tsx` (light/dark/auto toggle with localStorage persistence)

**src/lib/:**
- Purpose: Client-side utilities, shared types, React hooks, and auth client setup
- Contains: Pure type definitions, utility functions, client configuration
- Key files: `auth-client.ts` (Better Auth React client with magic link plugin), `session.ts` (server-side session helpers via `createServerFn`), `ai-providers.ts` (provider definitions and validation), `dashboard-status.ts` (dashboard snapshot types), `server-detail.ts` (server detail and action types), `logs.ts` (install and action log types), `use-mount-effect.ts` (mount-only effect hook), `utils.ts` (`cn()` helper combining clsx + tailwind-merge)

**server/:**
- Purpose: All backend business logic, API handlers, database access, and external integrations
- Contains: Hono handler functions, service modules, database queries, SSH execution, SSE streaming
- Key files: `app.ts` (Hono API with all routes), `auth.ts` (Better Auth lazy init), `servers.ts` (SSH verification and server CRUD), `install.ts` (install workflow orchestration), `server-actions.ts` (restart/update/rollback), `ssh.ts` (SSH client and OS detection), `dashboard.ts` (aggregation with caching), `providers.ts` (AI provider save/test), `telegram.ts` (Telegram bot connect/disconnect), `logs.ts` (log aggregation), `credentials.ts` (ephemeral credential store), `crypto.ts` (AES-256-GCM encryption)

**server/db/:**
- Purpose: PostgreSQL database schema, connection management, and health checks
- Contains: Drizzle ORM table definitions, lazy database singleton, health check query
- Key files: `schema.ts` (9 tables: users, sessions, accounts, verifications, servers, installs, aiProviders, telegramConfigs, auditLogs), `index.ts` (lazy `getDb()` singleton with postgres.js client), `health.ts` (`SELECT 1` connectivity check)

**server/install/:**
- Purpose: In-memory SSE stream management for real-time install progress
- Contains: Install event types, stream state management, event emission with DB persistence
- Key files: `sse-stream.ts` (installStreams Map, tryClaimInstallStream, emitInstallEvent, hydrateInstallEvents, ensureInstallStream)

**server/lib/:**
- Purpose: Shared server utility functions
- Contains: Client IP extraction, magic link email sending
- Key files: `get-client-ip.ts` (X-Forwarded-For parsing with trusted proxy count), `send-magic-link-email.ts` (Resend API with console fallback in dev)

**drizzle/:**
- Purpose: Generated database migration files and metadata
- Contains: SQL migration files, journal, snapshots
- Key files: `0000_swift_luckman.sql` (initial migration), `meta/_journal.json` (migration journal), `meta/0000_snapshot.json` (schema snapshot)

**public/:**
- Purpose: Static assets served at the root URL path
- Contains: Favicon, PWA manifest, logo images
- Key files: `favicon.ico`, `manifest.json`, `logo192.png`, `logo512.png`, `robots.txt`

**scripts/:**
- Purpose: Build, deployment, and development helper scripts
- Contains: Production startup script, Ralph agent scripts
- Key files: `start-production.mjs` (production server bootstrap), `ralph/` (agent development scripts)

**docs/:**
- Purpose: Project documentation and API reference
- Contains: Markdown documentation files
- Key files: `api-reference.md`, `test-coverage-review.md`

**.github/workflows/:**
- Purpose: CI/CD automation for testing and deployment
- Contains: GitHub Actions workflow definitions
- Key files: `ci.yml` (biome + typecheck + test + build on PRs), `deploy.yml` (Docker build + GHCR push + SSH deploy on main)

**.planning/codebase/:**
- Purpose: Codebase analysis and planning documents
- Contains: Architecture, structure, and stack analysis
- Key files: `ARCHITECTURE.md`, `STRUCTURE.md`, `STACK.md`

## Key File Locations

**Entry Points:**
- `src/server.ts`: Server entrypoint that routes /api/* to Hono and everything else to TanStack Start
- `src/router.tsx`: TanStack Router factory (creates router from generated route tree)
- `src/routes/__root.tsx`: Root route component (HTML shell, Header, Footer, Scripts)

**Configuration:**
- `vite.config.ts`: Vite build config with TanStack Start, Tailwind, React plugins; excludes node-ssh from optimizeDeps
- `tsconfig.json`: TypeScript strict mode, ES2022 target, bundler resolution, path aliases (#/* and @/*)
- `drizzle.config.ts`: Drizzle Kit config pointing to schema.ts and ./drizzle output
- `biome.json`: Biome linter/formatter excluding dist/ and routeTree.gen.ts
- `compose.yaml`: Production Docker Compose with app + postgres services
- `Dockerfile`: Multi-stage build (bun deps -> bun build -> node runtime)
- `.env.example`: Required env vars (DATABASE_URL, ENCRYPTION_KEY, BETTER_AUTH_SECRET, BETTER_AUTH_URL)

**Core Logic:**
- `server/app.ts`: Hono API app with all 13 route definitions and middleware
- `server/install.ts`: Install workflow (6 steps via SSH, SSE streaming, audit logging)
- `server/server-actions.ts`: Server action execution (restart/update/rollback via SSH)
- `server/dashboard.ts`: Dashboard aggregation with static (60s) and metrics (15s) caching
- `server/ssh.ts`: SSH connection wrapper with OS verification and error normalization
- `server/db/schema.ts`: Drizzle schema with 9 PostgreSQL tables

**Testing:**
- `server/app.test.ts`: API route tests
- `server/servers.test.ts`: Server connection tests
- `server/install.test.ts`: Install workflow tests
- `server/install/sse-stream.test.ts`: SSE stream tests
- `server/server-actions.test.ts`: Server action tests
- `server/providers.test.ts`: Provider config tests
- `server/telegram.test.ts`: Telegram connection tests
- `server/logs.test.ts`: Log aggregation tests
- `server/ssh.test.ts`: SSH verification tests
- `server/credentials.test.ts`: Credential store tests
- `server/dashboard.test.ts`: Dashboard aggregation tests
- `server/install-idle-timeout.test.ts`: Install idle timeout tests
- `src/lib/session.test.ts`: Session helper tests
- `src/features/dashboard/status-overview.test.tsx`: Dashboard component tests
- `src/features/servers/server-detail.test.tsx`: Server detail component tests
- `src/features/servers/install-progress.test.tsx`: Install progress component tests
- `src/features/servers/connection-wizard.test.tsx`: Connection wizard component tests
- `src/features/providers/provider-settings.test.tsx`: Provider settings component tests
- `src/features/telegram/telegram-settings.test.tsx`: Telegram settings component tests
- `src/features/logs/logs-viewer.test.tsx`: Logs viewer component tests

## Naming Conventions

**Files:**
- Route files: `kebab-case.tsx` matching the URL path (e.g., `servers.$id.tsx` for `/servers/:id`)
- Feature files: `kebab-case.tsx` (e.g., `status-overview.tsx`, `connection-wizard.tsx`)
- Server modules: `kebab-case.ts` (e.g., `server-actions.ts`, `send-magic-link-email.ts`)
- Test files: Co-located with `.test.ts` or `.test.tsx` suffix (e.g., `servers.test.ts`, `status-overview.test.tsx`)
- Type-only files: Plain `kebab-case.ts` (e.g., `dashboard-status.ts`, `server-detail.ts`, `logs.ts`)
- UI components: `PascalCase.tsx` for exported components (e.g., `Button.tsx`, `Header.tsx`, `ThemeToggle.tsx`)

**Directories:**
- Feature domains: `kebab-case` (e.g., `dashboard/`, `servers/`, `providers/`, `telegram/`, `logs/`)
- Server sub-modules: `kebab-case` (e.g., `install/`, `db/`, `lib/`)
- Generated code: Top-level directories (e.g., `dist/`, `drizzle/`)

**Exports:**
- Named exports for components and functions (e.g., `export function DashboardStatusOverview`, `export const Route`)
- Default exports for route components and some layout components (e.g., `export default function Header`)
- Type exports via `export type` (e.g., `export type DashboardStatusSnapshot`)

## Where to Add New Code

**New Feature:**
- Primary code: `src/features/<domain>/<feature-name>.tsx`
- Tests: `src/features/<domain>/<feature-name>.test.tsx`
- Types (if shared): `src/lib/<domain>-<feature>.ts`
- Route: `src/routes/<route-path>.tsx` (thin wrapper using AppShell + feature component)
- API endpoint: Add handler in `server/<domain>.ts`, add route in `server/app.ts`

**New Server Module:**
- Implementation: `server/<module-name>.ts`
- Tests: `server/<module-name>.test.ts`
- API route: Add to `server/app.ts` with appropriate middleware

**New Database Table:**
- Schema: Add table definition to `server/db/schema.ts`
- Migration: Run `bun run db:generate`
- Types: Add to relevant `src/lib/*.ts` file if needed for frontend

**New Shared Component:**
- Implementation: `src/components/ui/<component-name>.tsx`
- Pattern: Follow Button component pattern with CVA variants and cn() utility

**New Shared Type:**
- Types: `src/lib/<domain>.ts` (e.g., `src/lib/dashboard-status.ts`)
- Pattern: Pure type definitions imported by both server modules and frontend components

**New Utility Function:**
- Server utility: `server/lib/<utility-name>.ts`
- Client utility: `src/lib/<utility-name>.ts`

## Special Directories

**dist/:**
- Purpose: Production build output (Vite compilation)
- Generated: Yes (by `bun run build`)
- Committed: Yes (in repo, but should be gitignored for clean builds)

**drizzle/:**
- Purpose: Generated SQL migration files and schema snapshots
- Generated: Yes (by `bun run db:generate`)
- Committed: Yes (migrations are checked in for deploy-time application)

**.tanstack/tmp/:**
- Purpose: TanStack Router temporary files during development
- Generated: Yes (by TanStack Router plugin)
- Committed: No (gitignored)

**node_modules/:**
- Purpose: Installed npm/bun dependencies
- Generated: Yes (by `bun install`)
- Committed: No (gitignored)

**src/routeTree.gen.ts:**
- Purpose: Auto-generated route tree from file-based routing
- Generated: Yes (by TanStack Router plugin during dev/build)
- Committed: Yes (but excluded from Biome checks, DO NOT EDIT by hand)

---
*Structure analysis: 2026-05-28*
