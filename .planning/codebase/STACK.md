# Technology Stack

**Analysis Date:** 2026-05-31

## Languages

**Primary:**
- TypeScript (ESNext, strict mode) - app, API, and scripts (`tsconfig.json`, `src/**/*`, `server/**/*`, `scripts/start-production.mjs`)

**Secondary:**
- SQL (PostgreSQL schema/migrations via Drizzle) - relational schema and migrations (`server/db/schema.ts`, `drizzle.config.ts`, `drizzle/`)
- YAML - container orchestration and CI/CD workflows (`compose.yaml`, `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`)

## Runtime

**Environment:**
- Node.js 22 (production runtime image) (`Dockerfile`, `scripts/start-production.mjs`)
- Bun 1 (dependency install and build stages) (`Dockerfile`)

**Package Manager:**
- Bun (install/run workflows and local task runner) (`package.json`, `justfile`, `.github/workflows/ci.yml`)
- Lockfile: present (`bun.lock`)

## Frameworks

**Core:**
- TanStack Start + TanStack Router (React full-stack app shell/routing) (`package.json`, `vite.config.ts`)
- React 19 + React DOM 19 (UI runtime) (`package.json`)
- Hono (REST API under `/api`) (`package.json`, `server/app.ts`)
- Better Auth + Drizzle adapter (magic-link auth/session) (`package.json`, `server/auth.ts`)
- Drizzle ORM + postgres client (database access) (`package.json`, `server/db/index.ts`, `drizzle.config.ts`)

**Testing:**
- Vitest (unit/integration test runner) (`package.json`, `vite.config.ts`)
- Testing Library + jsdom (component/runtime test utilities) (`package.json`)

**Build/Dev:**
- Vite 8 + React/TanStack/Tailwind plugins (build/dev server) (`package.json`, `vite.config.ts`)
- Biome (lint/format) (`biome.json`, `justfile`, `.github/workflows/ci.yml`)
- Drizzle Kit (migration generation/execution) (`package.json`, `drizzle.config.ts`, `scripts/start-production.mjs`)

## Key Dependencies

**Critical:**
- `hono` - API routing and request handling (`package.json`, `server/app.ts`)
- `better-auth` + `@better-auth/drizzle-adapter` - authentication and session persistence (`package.json`, `server/auth.ts`)
- `drizzle-orm` + `postgres` - PostgreSQL ORM and driver (`package.json`, `server/db/index.ts`)
- `node-ssh` - remote VPS install/deploy/action execution (`package.json`, `server/ssh.ts`, `server/install.ts`, `server/server-actions.ts`)
- `rate-limiter-flexible` - magic-link request throttling (`package.json`, `server/app.ts`)

**Infrastructure:**
- `tailwindcss` + `@tailwindcss/vite` - styling pipeline (`package.json`, `vite.config.ts`)
- `drizzle-kit` - schema migration tooling (`package.json`, `drizzle.config.ts`)
- Docker multi-stage images (Bun build + Node runtime) (`Dockerfile`)

## Configuration

**Environment:**
- Environment-variable driven setup with required core settings (`DATABASE_URL`, `ENCRYPTION_KEY`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`) and optional integrations (`RESEND_API_KEY`, `RESEND_FROM`, `DB_POOL_MAX`, `TRUSTED_PROXY_COUNT`) (`.env.example`, `server/auth.ts`, `server/crypto.ts`, `server/db/index.ts`, `server/lib/send-magic-link-email.ts`)
- Runtime env injection via Compose and GitHub Actions deploy (`compose.yaml`, `.github/workflows/deploy.yml`)

**Build:**
- Build/type/test configuration in `vite.config.ts`, `tsconfig.json`, and workflow jobs (`vite.config.ts`, `tsconfig.json`, `.github/workflows/ci.yml`)
- Production packaging and startup in Docker + Node launcher (`Dockerfile`, `scripts/start-production.mjs`)

## Platform Requirements

**Development:**
- Node.js >=20, Bun, PostgreSQL for local development (`README.md`, `.env.example`)
- Optional local full stack with Docker Compose (app + postgres + mailpit) (`compose.yaml`, `README.md`)

**Production:**
- Containerized deployment to VPS (Docker Compose) or Dokku (`.github/workflows/deploy.yml`, `Dockerfile`, `compose.yaml`)
- HTTPS reverse-proxy setup expected for sensitive server operations (`server/app.ts`)

---

*Stack analysis: 2026-05-31*
