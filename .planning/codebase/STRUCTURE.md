# Codebase Structure

**Analysis Date:** 2026-05-26

## Directory Layout

```
hermes-hub/
├── .planning/              # Architecture docs & planning artifacts
├── .tanstack/              # Auto-generated router config
├── .vscode/                # Editor settings
├── drizzle/                # Drizzle Kit migrations & snapshots
│   ├── meta/               #   Migration journal & snapshot JSON
│   ├── 0000_*.sql          #   Initial schema migration
│   └── 0002_*.sql          #   Later migrations
├── node_modules/           # Dependencies (bun)
├── public/                 # Static assets
├── scripts/
│   └── ralph/              #   Ralph autonomous build agent
├── server/                 # Backend: Hono API + Drizzle + SSH
│   ├── db/                 #   Drizzle ORM schema & connection
│   ├── app.ts              #   Hono API router (all /api/* endpoints)
│   ├── auth.ts             #   Better Auth lazy initialization
│   ├── credentials.ts      #   In-memory ephemeral credential store
│   ├── crypto.ts           #   AES-256-GCM encrypt/decrypt
│   ├── dashboard.ts        #   Dashboard status snapshot builder
│   ├── install.ts          #   Server install workflow + SSE streaming
│   ├── logs.ts             #   Log aggregation & clearing
│   ├── providers.ts        #   AI provider config save/test
│   ├── server-actions.ts   #   Server restart/update/rollback
│   ├── servers.ts          #   Server connect & credential lookup
│   ├── ssh.ts              #   Node-SSH wrapper + OS validation
│   ├── telegram.ts         #   Telegram bot connect/disconnect
│   └── *.test.ts           #   Test files (co-located)
├── src/                    # Frontend: TanStack Start + React
│   ├── components/         #   Shared UI components
│   │   └── ui/             #     shadcn-style primitives
│   ├── features/           #   Feature modules (stateful components)
│   │   ├── dashboard/      #     Dashboard status overview
│   │   ├── logs/           #     Logs viewer
│   │   ├── providers/      #     AI provider settings
│   │   ├── servers/        #     Connection wizard, install progress, detail
│   │   └── telegram/       #     Telegram settings
│   ├── lib/                #   Shared types, utilities, auth client
│   ├── routes/             #   File-based TanStack Router pages
│   ├── router.tsx          #   Router creation
│   ├── routeTree.gen.ts    #   Auto-generated route tree (DO NOT EDIT)
│   ├── server.ts           #   Server entry: dispatches /api/* to Hono
│   └── styles.css          #   TailwindCSS v4 styles
├── tasks/                  # PRD & planning docs
├── .cta.json               # Create TanStack App scaffold metadata
├── .env.example            # Required env vars template
├── AGENTS.md               # Project conventions & sources of truth
├── biome.json              # Biome (linter/formatter) config
├── bun.lock                # Bun lockfile
├── components.json         # shadcn/ui config
├── drizzle.config.ts       # Drizzle Kit config
├── package.json            # Dependencies & scripts
├── tsconfig.json           # TypeScript config
└── vite.config.ts          # Vite + Vitest config
```

## Directory Purposes

**`server/`:** Hono API backend — all business logic lives here. Each file is a domain module (servers, install, dashboard, etc.) exposing handler functions that are registered in `app.ts`. Database schema and connection are in `server/db/`. The `ssh.ts` module is the sole SSH abstraction used by install, actions, and dashboard health.

**`src/routes/`:** TanStack Router file-based pages. Each `.tsx` file maps to a URL path via file naming conventions (dynamic params with `$id`, nested routes with `.` separator). Every authenticated route imports and wraps content with `<AppShell>`.

**`src/features/`:** Domain-specific, stateful UI components. Each feature folder contains a main component and a co-located test file. These are mounted by route components and own their own client-side state (forms, action status, error handling). They communicate with the backend via direct `fetch()` calls or `EventSource`.

**`src/lib/`:** Shared frontend utilities and type definitions. Key files: `ai-providers.ts` (shared AI provider metadata), `session.ts` (auth guard helpers), `auth-client.ts` (Better Auth client singleton), `utils.ts` (`cn()` helper). Types defined here are imported by server modules.

**`src/components/`:** Reusable, presentational UI components. The `ui/` subdirectory holds shadcn-style primitives (Button). `Header.tsx` and `Footer.tsx` are app-wide shell components rendered by `__root.tsx`.

**`public/`:** Static assets served at `/` (favicon, images, etc.).

**`drizzle/`:** Auto-generated migration files from `drizzle-kit generate`. Each migration has a SQL file and a metadata snapshot. The `meta/_journal.json` tracks applied migrations.

## Key File Locations

**Entry Points:**
- `src/server.ts`: Server-side entry — decides between Hono API handler and TanStack SSR handler
- `src/router.tsx`: Client router creation with auto-generated route tree
- `server/app.ts`: All API route registrations in one file

**Auth:**
- `server/auth.ts`: Better Auth lazy initialization, `getAuthSession()` helper
- `src/lib/auth-client.ts`: Client-side Better Auth singleton
- `src/lib/session.ts`: `getCurrentSession` and `requireSession` server functions

**Database:**
- `server/db/schema.ts`: All 8 Drizzle table definitions
- `server/db/index.ts`: Lazy DB connection via `getDb()`
- `server/db/health.ts`: `select 1` health check

**SSH & Install:**
- `server/ssh.ts`: `withSshConnection()`, `verifyServerConnection()`, `parseAndValidateOs()`
- `server/install.ts`: Install workflow, SSE streaming, install steps definition
- `server/credentials.ts`: Ephemeral credential `Map` store

**Dashboard:**
- `server/dashboard.ts`: `getDashboardStatusSnapshot()`, VPS metrics polling
- `src/features/dashboard/status-overview.tsx`: Dashboard card grid with 30s polling
- `src/routes/dashboard.tsx`: Dashboard route + `AppShell` layout export

**Server Actions:**
- `server/server-actions.ts`: Restart/update/rollback SSH commands, `getServerDetailSnapshot()`
- `src/features/servers/server-detail.tsx`: Server detail + action UI with confirmation card
- `src/routes/servers.$id.tsx`: Server detail route

**Integration Pages:**
- `src/routes/ai-provider.tsx` + `server/providers.ts` + `src/features/providers/provider-settings.tsx`: AI provider CRUD
- `src/routes/telegram.tsx` + `server/telegram.ts` + `src/features/telegram/telegram-settings.tsx`: Telegram bot connect/disconnect
- `src/routes/logs.tsx` + `server/logs.ts` + `src/features/logs/logs-viewer.tsx`: Install + action log viewer

**Crypto:**
- `server/crypto.ts`: AES-256-GCM `encryptSecret()` / `decryptSecret()`

**Shared Types (frontend ↔ backend contract):**
- `src/lib/dashboard-status.ts`: `DashboardStatusSnapshot`, summary types
- `src/lib/server-detail.ts`: `ServerDetailSnapshot`, `ServerActionType`, action history types
- `src/lib/logs.ts`: `LogsSnapshot`, `InstallLogEntry`, `ActionLogEntry`
- `src/lib/ai-providers.ts`: `AiProviderId`, provider metadata, `isValidAiModel()`

## Naming Conventions

**Files:**
- **Routes:** `kebab-case` with `$` for dynamic params and `.` for nesting: `servers.$id.tsx`, `servers.$id.install.tsx`, `ai-provider.tsx`
- **Feature components:** `kebab-case` with `.tsx` extension: `connection-wizard.tsx`, `install-progress.tsx`, `status-overview.tsx`
- **Server modules:** `kebab-case` `.ts`: `server-actions.ts`, `dashboard.ts`, `install.ts`
- **Tests:** Co-located with source, `*.test.ts` or `*.test.tsx`: `install.test.ts`, `connection-wizard.test.tsx`
- **Lib files:** `kebab-case` `.ts`: `auth-client.ts`, `dashboard-status.ts`, `use-mount-effect.ts`
- **Migration files:** `{sequence}_{name}.sql` (auto-generated by Drizzle Kit)

**Exports:**
- Route components default-export the page component
- Feature components named-export the main component (`export function ConnectionWizard`)
- Server handlers named-export handler functions (`export async function connectServer`)
- Types named-exported with PascalCase (`export type ServerDetailSnapshot`)
- Constants in SCREAMING_SNAKE or camelCase depending on usage

**API Routes:**
- RESTful patterns: `POST /api/servers/connect`, `GET /api/servers/:id`, `POST /api/servers/:id/actions`
- SSE endpoints: `GET /api/servers/:id/install/events`
- Auth proxied: `/api/auth/send-magic-link` → `/api/auth/sign-in/magic-link`

**Database:**
- Tables: `snake_case` plural: `servers`, `installs`, `ai_providers`, `telegram_configs`, `audit_logs`
- Columns: `snake_case`: `user_id`, `auth_method`, `encrypted_credential`, `created_at`
- Primary keys: `text` with `gen_random_uuid()::text` default

## Where to Add New Code

**New Feature (end-to-end):**
- Route: `src/routes/{feature-name}.tsx` — file-based route with `beforeLoad` auth guard
- Feature component: `src/features/{feature-name}/{feature-name}.tsx` — stateful UI
- Test: `src/features/{feature-name}/{feature-name}.test.tsx` — co-located Vitest
- Server handler: `server/{feature-name}.ts` — Hono handler function(s)
- Server test: `server/{feature-name}.test.ts` — co-located Vitest
- Route registration: `server/app.ts` — add route to `apiApp`
- Types: `src/lib/{feature-name}.ts` — shared types if needed by both sides

**New UI Primitive:**
- `src/components/ui/{primitive}.tsx` — shadcn-style with `cn()` helper

**New Database Table:**
- `server/db/schema.ts` — add `pgTable` with `gen_random_uuid()::text` primary key
- Run `bun run db:generate` for migration
- Add query helpers in the relevant `server/` module

**New API Endpoint:**
- Add handler function in appropriate `server/{domain}.ts`
- Register in `server/app.ts` with `apiApp.get/post/...`

**New Auth Guard:**
- Use `requireSession()` in route `beforeLoad` or call `getAuthSession()` in server handlers
