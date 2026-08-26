# Technology Stack

**Analysis Date:** 2026-08-25

## Languages

**Primary:**
- TypeScript 7.0 - Full-stack application (frontend routes, server API, database layer)
- React 19.2 - UI components and pages

**Secondary:**
- Node.js - Server runtime, scripts, and CLI tools
- Bash - Deployment scripts (`scripts/setup-dokku-deploy-secrets.sh`, `scripts/db-migrate.mjs`)

## Runtime

**Environment:**
- Node.js >= 20 (required per README)
- Bun 1.3.14 - Preferred package manager and runtime

**Package Manager:**
- Bun 1.3.14 - `bun install` for dependencies
- Lockfile: `bun.lock` (present)

## Frameworks

**Core:**
- TanStack Start 1.168.x - File-based routing, SSR, and dev server
- TanStack Router 1.171.9 - Client-side routing (pinned for hydration compatibility)
- Hono 4.12.x - Lightweight REST API framework for `/api/*` endpoints

**UI:**
- TailwindCSS 4.1.x - Utility-first CSS framework
- Radix UI 1.2.x - Accessible component primitives (`@radix-ui/react-slot`)
- shadcn/ui pattern - Pre-built UI components in `src/components/ui/`

**Testing:**
- Vitest 4.1.x - Unit and integration test runner
- Testing Library 16.x - React component testing utilities
- happy-dom/jsdom - DOM simulation for tests

**Build/Dev:**
- Vite 8.0.x - Build tool and dev server
- TypeScript 7.0 - Type checking (`tsc --noEmit`)
- Biome - Linting and formatting (via `@biomejs/biome check`)

## Key Dependencies

**Critical:**
- `better-auth` 1.6.x - Magic-link authentication (session management, token verification)
- `drizzle-orm` 0.45.x + `drizzle-kit` 0.31.x - PostgreSQL ORM and migrations
- `node-ssh` 13.x - SSH client for VPS connection and remote execution
- `hono` 4.12.x - API routing, middleware, SSE streaming

**Infrastructure:**
- `postgres` 3.4.x - PostgreSQL driver (server-only)
- `pino` 10.x - Structured logging
- `rate-limiter-flexible` 11.x - In-memory rate limiting (magic-link endpoint)

**Security:**
- Node.js `crypto` - AES-256-GCM encryption for credentials
- `@better-auth/drizzle-adapter` - Auth database integration

## Configuration

**Environment:**
- `.env.local` (not committed) - Local development secrets
- `.env.example` - Template for required variables
- Required vars: `DATABASE_URL`, `ENCRYPTION_KEY`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`
- Optional: `ENCRYPTION_KEY_V2` (key rotation), `RESEND_API_KEY`, `RESEND_FROM`

**Build:**
- `vite.config.ts` - Vite/TanStack Start/Vitest configuration
- `drizzle.config.ts` - Database migration configuration
- `tsconfig.json` - TypeScript compiler options
- `biome.json` - Linting and formatting rules
- Path aliases: `#/*` → `./src/*`, `#server/*` → `./server/*`, `#shared/*` → `./shared/*`

## Platform Requirements

**Development:**
- Node.js >= 20
- Bun (preferred)
- PostgreSQL (local or Docker)
- Docker & Docker Compose (for full-stack testing with Mailpit)

**Production:**
- Docker container (built via `Dockerfile`)
- PostgreSQL (managed or self-hosted)
- TLS-terminating reverse proxy (Caddy/nginx) or Dokku with Let's Encrypt
- SSH access to target VPS for deployment

---

*Stack analysis: 2026-08-25*
