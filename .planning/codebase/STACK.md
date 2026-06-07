# Technology Stack

**Analysis Date:** 2026-06-06

## Languages

**Primary:**
- TypeScript 6.0.2 — Application code in `src/`, `server/`, `scripts/`, `shared/`, and config files (`vite.config.ts`, `drizzle.config.ts`)

**Secondary:**
- CSS — Styling via Tailwind CSS 4 in `src/styles.css`
- YAML — Docker Compose (`compose.yaml`), Hermes/MCP config generation (`server/settings/mcp/yaml.ts`)
- JavaScript (ESM) — Production entry (`scripts/start-production.mjs`), migration wrapper (`scripts/db-migrate.mjs`)
- Shell — Task runner recipes in `justfile`, deploy scripts in `.github/workflows/deploy.yml`

## Runtime

**Environment:**
- Bun 1.x — Local development, dependency install, and build (`package.json` scripts, `justfile`, CI via `oven-sh/setup-bun@v2`)
- Node.js 22 — Production runtime in `Dockerfile` (`node:22-alpine`); serves built app via `scripts/start-production.mjs`

**Package Manager:**
- Bun — Primary package manager per `AGENTS.md`
- Lockfile: present (`bun.lock`)

## Frameworks

**Core:**
- TanStack Start 1.168.x + TanStack React Router 1.170.x — Full-stack React framework; file-based routes in `src/routes/`, server entry in `src/server.ts`
- React 19.2.x — UI layer in `src/features/` and `src/components/`
- Hono 4.12.x — REST API in `server/app.ts`, mounted at `/api/*` from `src/server.ts`
- Drizzle ORM 0.45.x — PostgreSQL schema and queries (`server/db/schema.ts`, `server/db/index.ts`)
- Better Auth 1.6.x — Magic-link authentication (`server/auth.ts`, `src/lib/auth-client.ts`)
- Tailwind CSS 4.1.x — Utility-first styling via `@tailwindcss/vite` plugin in `vite.config.ts` and `src/styles.css`
- Zod 4.4.x — Request/body validation across server modules
- React Hook Form 7.76.x + `@hookform/resolvers` — Form handling in UI routes

**Testing:**
- Vitest 4.1.x — Unit/integration tests; configured in `vite.config.ts` with `environment: "node"`
- Testing Library (`@testing-library/react`, `@testing-library/dom`) — Component tests in `src/`
- happy-dom 20.x / jsdom 28.x — Available as DOM environments (Vitest defaults to Node)

**Build/Dev:**
- Vite 8.0.x — Dev server (`bun run dev` on port 3000), production build (`bun run build`)
- `@vitejs/plugin-react` — React Fast Refresh and JSX transform
- `@tanstack/devtools-vite` — TanStack devtools in development
- Biome 2.4.16 — Lint/format via `bunx @biomejs/biome` (`biome.json`, `justfile`, `.github/workflows/ci.yml`); not listed in `package.json` dependencies
- Drizzle Kit 0.31.x — Migration generation and apply (`drizzle.config.ts`, `bun run db:generate`, `bun run db:migrate`)
- react-doctor 0.4.x — Optional React health scans (`.github/workflows/react-doctor.yml`, `bun run doctor`)

## Key Dependencies

**Critical:**
- `better-auth` + `@better-auth/drizzle-adapter` — Session auth with PostgreSQL persistence (`server/auth.ts`)
- `drizzle-orm` + `postgres` — PostgreSQL client with connection pooling (`server/db/index.ts`)
- `node-ssh` — SSH connections to managed VPS servers (`server/ssh/connection.ts`); excluded from Vite `optimizeDeps` in `vite.config.ts`
- `hono` — API routing and middleware (`server/app.ts`)
- `@tanstack/react-start` — SSR, server functions, and production server bundle
- `rate-limiter-flexible` — In-memory magic-link rate limiting (`server/app.ts`)
- `zod` — Shared validation between API handlers and forms

**Infrastructure:**
- `class-variance-authority`, `clsx`, `tailwind-merge` — UI variant/class composition (`src/components/ui/`)
- `@radix-ui/react-slot` — Primitive slot composition for UI components
- `lucide-react` — Icon set
- `yaml` — MCP/Hermes config YAML parsing and generation (`server/settings/mcp/yaml.ts`)

## Configuration

**Environment:**
- Local env via `.env` (auto-loaded by `justfile`) and `.env.example` template
- Required for full runtime: `DATABASE_URL`, `ENCRYPTION_KEY`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`
- Production email: `RESEND_API_KEY`, `RESEND_FROM` (`server/lib/send-magic-link-email.ts`, `compose.yaml`)
- Optional tuning: `PORT`, `HOST`, `DB_POOL_MAX`, `TRUSTED_PROXY_COUNT`, `CREDENTIAL_CLEANUP_INTERVAL_MS`, `STALE_DEPLOY_THRESHOLD_MS`

**Build:**
- `vite.config.ts` — Vite/Vitest plugins, path aliases, SSH native-module exclusions
- `tsconfig.json` — Strict TypeScript; path aliases `#/*` and `@/*` → `src/*`
- `biome.json` — Linter/formatter; excludes `dist`, `drizzle`, `src/routeTree.gen.ts`
- `drizzle.config.ts` — PostgreSQL dialect, schema at `server/db/schema.ts`, migrations in `drizzle/`
- `package.json` — Bun scripts and dependency versions
- `justfile` — Developer command wrappers (`dev`, `test`, `typecheck`, `check`, `ci`, `db-migrate`)
- `Dockerfile` — Multi-stage: Bun build → Node 22 runtime with healthcheck on `/api/health`
- `compose.yaml` — Local/production stack: app, PostgreSQL 17, Mailpit

## Platform Requirements

**Development:**
- Bun (lockfile `bun.lock`; do not use npm/pnpm per `AGENTS.md`)
- PostgreSQL for auth, dashboard, and server management features (`DATABASE_URL`)
- `openssl rand -hex 32` to generate `ENCRYPTION_KEY` (documented in `.env.example`)
- Dev server at `http://localhost:3000` (`AGENTS.md`)

**Production:**
- Docker image built from `Dockerfile`, pushed to GHCR (`.github/workflows/deploy.yml`)
- Deployment targets: VPS via Docker Compose + SSH, or Dokku via git push
- TLS-terminating reverse proxy required in production (`requireHttps()` in `server/app.ts`)
- Migrations run at startup (`scripts/start-production.mjs`) and during VPS deploy
- Pinned remote container images: `nousresearch/hermes-agent`, `ghcr.io/nesquena/hermes-webui` (`server/constants.ts`)

---

*Stack analysis: 2026-06-06*
