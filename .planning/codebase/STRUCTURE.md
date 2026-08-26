# Directory Structure

**Analysis Date:** 2026-08-25

## Top-Level Layout

```
hermes-hub/
├── src/                  # Frontend (React/TypeScript)
├── server/               # Backend (Hono/Node.js)
├── shared/               # Cross-boundary types
├── scripts/              # CLI tools and utilities
├── drizzle/              # Database migrations
├── docs/                 # Documentation (ADRs, API reference)
├── plans/                # Implementation plans (archived)
├── .github/              # CI/CD workflows
├── .freebuff/            # Local tooling (preview, run docs)
└── [config files]        # package.json, vite.config.ts, etc.
```

## Source Code (398 TypeScript files)

### `src/` (188 files) - Frontend

**Routes (`src/routes/`):**
- `__root.tsx` - Root layout (theme, devtools, header/footer)
- `index.tsx` - Landing page
- `login.tsx` - Magic link authentication
- `dashboard.tsx` - Authenticated shell + status
- `servers.tsx` - VPS connection wizard
- `servers.$id.tsx` - Server detail, actions, Web UI
- `servers.$id.install.tsx` - Live install progress (SSE)
- `ai-provider.tsx` - AI provider configuration
- `telegram.tsx` - Telegram bot setup
- `settings.tsx` - Persona editor, MCP manager
- `logs.tsx` - Install/action log viewer
- `about.tsx` - About page

**Features (`src/features/`):**
- `servers/` - VPS management UI (22 files)
- `providers/` - AI provider UI (21 files)
- `settings/` - Settings UI (26 files)
- `telegram/` - Telegram UI (13 files)
- `dashboard/` - Dashboard UI (5 files)
- `logs/` - Log viewer UI (5 files)
- `landing/` - Landing page UI (5 files)
- `auth/` - Auth UI (3 files)
- `about/` - About page UI (3 files)

**Shared (`src/lib/`):**
- `utils.ts` - `cn()` helper for class names
- `auth-client.ts` - Better Auth client
- `use-mount-effect.ts` - Mount-only escape hatch
- `use-stale-ref.ts` - Stale ref helper

**Components (`src/components/`):**
- `ui/` - shadcn/ui components (button, card, dialog, etc.)
- `AppShell.tsx` - Authenticated layout wrapper

### `server/` (198 files) - Backend

**Core:**
- `app.ts` - Hono router with all API routes
- `auth.ts` - Better Auth instance (lazy, DB-optional)
- `crypto.ts` - AES-256-GCM encryption with keyring
- `credentials.ts` - In-memory credential cache
- `ssh.ts` - node-ssh wrapper
- `servers.ts` - VPS connection logic
- `install.ts` - Hermes install pipeline
- `server-actions.ts` - Restart/update/rollback

**Modules:**
- `providers/` - AI provider logic (config, test, validation)
- `telegram/` - Telegram bot integration
- `settings/` - Persona and MCP config
- `hermes/` - Hermes deploy orchestration
- `web-ui/` - Hermes Web UI proxy
- `dashboard/` - Status aggregation
- `commandcode/` - Command Code translation proxy
- `db/` - Drizzle schema, connection, migrations
- `lib/` - Shared utilities (logger, etc.)

### `shared/` (8 files) - Cross-Boundary

**Contracts (`shared/contracts/`):**
- `server-actions.ts` - Server action types
- `server-detail-snapshot.ts` - Server detail types
- Provider/Telegram/Settings types

### `scripts/` (2 files) - CLI Tools

- `db-migrate.mjs` - Database migration wrapper
- `re-encrypt.ts` - Key rotation re-encryption
- `start-production.mjs` - Production server startup
- `setup-dokku-deploy-secrets.sh` - Dokku secret configuration
- `generate-brand-assets.ts` - Brand asset generation

## Configuration Files

**Build:**
- `vite.config.ts` - Vite/TanStack Start/Vitest
- `tsconfig.json` - TypeScript compiler
- `biome.json` - Linting/formatting
- `drizzle.config.ts` - Database migrations

**Deployment:**
- `Dockerfile` - Container build
- `compose.yaml` - Local development stack
- `.github/workflows/` - CI/CD pipelines

**Documentation:**
- `README.md` - Project overview
- `AGENTS.md` - Developer guide
- `CONTEXT.md` - Codebase context
- `docs/api-reference.md` - API documentation

## Naming Conventions

**Files:**
- `kebab-case` for files: `server-actions.ts`, `crypto.ts`
- `PascalCase` for React components: `AppShell.tsx`
- `*.test.ts` / `*.test.tsx` for tests

**Directories:**
- `kebab-case` for feature dirs: `ai-provider/`, `commandcode/`
- `PascalCase` for component dirs: `ui/`

**Exports:**
- Named exports for functions/types
- Default exports for React components

---

*Structure analysis: 2026-08-25*
