# Architecture

## Overview

Hermes Hub is a full-stack TypeScript application for managing remote servers, deploying AI agent runtimes (Hermes), and orchestrating infrastructure through a web dashboard. It uses **TanStack Start** for SSR with file-based routing and **Hono** for the REST API layer.

```
┌─────────────────────────────────────────────┐
│                   Browser                    │
└──────────────────┬──────────────────────────┘
                   │ HTTP/SSR
┌──────────────────▼──────────────────────────┐
│          src/server.ts (unified)            │
│  ┌─────────────────┐  ┌──────────────────┐  │
│  │  TanStack Start  │  │  Hono API (/api) │  │
│  │  (SSR + Routes)  │  │  Server Modules  │  │
│  └─────────────────┘  └──────────────────┘  │
└──────────────────────┬──────────────────────┘
                       │
┌──────────────────────▼──────────────────────┐
│               server/ modules               │
│  Auth │ SSH │ DB │ Install │ Telegram ...   │
└──────────────────────┬──────────────────────┘
                       │ Drizzle ORM
┌──────────────────────▼──────────────────────┐
│              PostgreSQL 17                   │
│  servers │ install_events │ audit_logs ...   │
└─────────────────────────────────────────────┘
```

## Key Architectural Decisions

### Unified Server Entrypoint (`src/server.ts`)
- Sends `/api/*` requests to the **Hono** `apiApp` (exported from `server/app.ts`)
- Everything else goes to **TanStack Start** for SSR
- Production entry: `scripts/start-production.mjs` imports the built bundle from `dist/server/server.js`

### Lazy Auth Initialization
- `getAuth()` (in `server/auth.ts`) builds the Better Auth instance on first call — not at module scope
- `getAuthSession()` returns `null` when `DATABASE_URL` is missing
- Routes that need auth call `getAuthSession()` explicitly

### Single-Instance Boundary
The following are in-memory module-level state and are **not shared across nodes**:
- Install SSE streams (`server/install/sse-stream.ts`)
- Session credentials (`server/credentials.ts`)
- Magic-link rate limiter (`server/app.ts` `magicLinkRateLimiter`)
- Dashboard caches (`server/dashboard/`)

### File-Based Routing
- Routes live in `src/routes/` (TanStack Router convention)
- `src/routeTree.gen.ts` is auto-generated — never edit by hand
- Authenticated pages use `AppShell` from `src/routes/dashboard.tsx`

## Data Flow

### Typical Pattern
1. Route component loads via TanStack Router (SSR)
2. Data fetched via `createServerFn` loaders or API calls via `useMountEffect`
3. API calls hit Hono routes in `server/app.ts`
4. Server modules interact with PostgreSQL via Drizzle ORM
5. Responses flow back through the Hono context

### Exception
- `src/routes/servers.$id.tsx` fetches `/api/servers/:id` from the component using `useMountEffect` instead of a route loader

### DB Transaction Boundaries
`db.transaction()` is used when multiple Drizzle statements must commit or roll back together:
- **Telegram deploy:** SSH deploy + config update + audit log
- **Server actions:** SSH action + audit log + install version update
- **Install events:** `install_events` row + `installs` row update
- **Settings/providers:** Create/update + audit log

## Layers

### 1. Frontend (`src/`)
- `src/routes/` — File-based TanStack Start routes (thin — push logic to features/)
- `src/features/` — Domain-specific components, hooks, and state per product area
- `src/components/` — Shared UI primitives (Header, Footer, ThemeToggle, brand-mark)
- `src/components/ui/` — Shadcn UI primitives (Button, AlertPanel, StatusIcon, Input)
- `src/lib/` — Utility functions (auth-client, session, utils, server-detail, logs)

### 2. API Layer (`server/app.ts`)
- Mounts all Hono routes under `/api/`
- Includes HTTPS enforcement middleware for production
- Magic-link rate limiter applied to auth routes
- Catch-all `/*` for Better Auth handler

### 3. Backend Modules (`server/`)
- `server/auth.ts` — Authentication (Better Auth + magic links)
- `server/db/` — Database connection (`index.ts`), schema (`schema.ts`), health
- `server/ssh/` — SSH connection management, key handling, metrics
- `server/install/` — Server install orchestration, SSE streaming, event records
- `server/telegram/` — Telegram bot integration, model access, pairings
- `server/providers/` — AI provider management, subscriptions, Codex auth
- `server/hermes/` — Hermes runtime deployment, persona, MCP config, auth JSON
- `server/web-ui/` — SSH TCP proxy for web interfaces (deploy, records, pool)
- `server/settings/` — Settings management (MCP servers, agent skills, persona)
- `server/dashboard/` — Dashboard metrics aggregation
- `server/health-check/` — Server health check orchestration

### 4. Shared Contracts (`shared/contracts/`)
Cross-boundary TypeScript types shared between `src/` and `server/`:
- `agent-skills.ts`, `codex-auth.ts`, `host-key-error.ts`, `model-access.ts`
- `server-health-check.ts`, `server-web-ui.ts`, `telegram-model-access.ts`

## Deployment Architecture

### VPS Target
1. CI builds Docker image and pushes to GHCR
2. Workflow SSHes into VPS: `docker compose pull app` → `drizzle-kit migrate` → `docker compose up -d`

### Dokku Target
1. CI runs `git push dokku HEAD:master` after `config:set` on the app
2. Dokku handles build via its own buildpacks

## Security

- **HTTPS enforcement** via `requireHttps()` middleware on mutating API routes in production
- **AES-256-GCM** encryption for stored SSH credentials (`server/crypto.ts`)
- **Magic-link rate limiting** — 3 requests per 5 minutes per email, 5-minute block
- **Host key trust** management for SSH connections
