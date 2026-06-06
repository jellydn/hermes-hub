# Technology Stack

## Overview
HermesHub is a full-stack TypeScript application for deploying and managing self-hosted Hermes AI agents on VPS infrastructure. Built with TanStack Start (React framework) on the frontend and Hono on the backend, with PostgreSQL/Drizzle for data persistence.

---

## Languages & Runtime

| Category | Technology | Version |
|----------|------------|---------|
| **Primary Language** | TypeScript | ^6.0.2 (strict mode) |
| **Runtime (Dev)** | Bun | Latest (package manager + runtime) |
| **Runtime (Prod)** | Node.js | 22 (Alpine base in Docker) |
| **Target** | ESNext / ES2022 | Bundler module resolution |

---

## Frontend Framework & Libraries

| Layer | Technology | Version | Purpose |
|-------|------------|---------|---------|
| **Framework** | TanStack Start | ^1.168.20 | File-based routing, SSR, server functions |
| **Router** | @tanstack/react-router | ^1.170.11 | Type-safe client-side routing |
| **SSR Query** | @tanstack/react-router-ssr-query | ^1.167.1 | Server-side data fetching integration |
| **UI Framework** | React | ^19.2.0 | Component library |
| **Styling** | TailwindCSS | ^4.1.18 | Utility-first CSS (Vite plugin) |
| **UI Primitives** | Radix UI Slot | ^1.2.4 | Accessible component primitives |
| **Class Utilities** | class-variance-authority | ^0.7.1 | Variant-based class composition |
| **Class Merging** | clsx / tailwind-merge | ^2.1.1 / ^3.6.0 | Conditional className handling |
| **Forms** | react-hook-form | ^7.76.1 | Form state management |
| **Validation** | @hookform/resolvers / zod | ^5.4.0 / ^4.4.3 | Schema validation |
| **Icons** | lucide-react | ^1.16.0 | Icon library |
| **DevTools** | @tanstack/devtools-vite | ^0.7.0 | Development debugging |

---

## Backend Framework & Libraries

| Layer | Technology | Version | Purpose |
|-------|------------|---------|---------|
| **API Framework** | Hono | ^4.12.23 | Lightweight REST API on `/api/*` |
| **Rate Limiting** | rate-limiter-flexible | ^11.1.0 | Magic link rate limiting |
| **SSH Client** | node-ssh | ^13.2.1 | VPS connection & command execution |
| **Database ORM** | drizzle-orm | ^0.45.2 | Type-safe SQL query builder |
| **Database Driver** | postgres | ^3.4.9 | PostgreSQL client |
| **Migrations** | drizzle-kit | ^0.31.10 | Schema migration tooling |
| **Auth** | better-auth | ^1.6.11 | Authentication (magic link only) |
| **Auth Adapter** | @better-auth/drizzle-adapter | ^1.6.11 | Drizzle integration for Better Auth |
| **TanStack Auth** | better-auth/tanstack-start | ^1.6.11 | Cookie handling for TanStack Start |
| **Email** | Resend (optional) | - | Magic link email delivery |
| **Encryption** | Node.js crypto (built-in) | - | AES-256-GCM credential encryption |
| **YAML** | yaml | ^2.9.0 | Docker Compose generation |
| **Realtime** | Hono streamSSE | Built-in | Server-Sent Events for install progress |

---

## Database

| Component | Technology | Details |
|-----------|------------|---------|
| **Database** | PostgreSQL | Primary datastore |
| **ORM** | Drizzle ORM | Schema-first, type-safe |
| **Dialect** | postgresql | Configured in drizzle.config.ts |
| **Schema Location** | server/db/schema.ts | 11 tables (users, sessions, servers, installs, install_events, ai_providers, telegram_configs, server_web_ui, audit_logs, health_checks, verifications) |
| **Migration Strategy** | drizzle-kit generate / migrate | CI runs migrate on deploy |

---

## Configuration Files

| File | Purpose |
|------|---------|
| `package.json` | Dependencies, scripts (dev, build, test, typecheck, db:generate) |
| `tsconfig.json` | Strict TypeScript config, path aliases (#/*, @/*) |
| `vite.config.ts` | Vite + TanStack Start + Vitest config, optimizeDeps exclusions |
| `drizzle.config.ts` | Drizzle Kit config (requires DATABASE_URL at load time) |
| `biome.json` | Biome linter/formatter (excludes generated routeTree.gen.ts) |
| `.env.example` | Environment variable template |
| `compose.yaml` | Local Docker Compose (app + postgres + mailpit) |
| `Dockerfile` | Multi-stage production build (Bun deps → Node runtime) |
| `justfile` | Task runner aliases (dev, build, test, typecheck, lint, format, ci) |
| `.pre-commit-config.yaml` | Pre-commit hooks (Biome, typecheck, trailing whitespace) |
| `.github/workflows/ci.yml` | CI pipeline (Biome → typecheck → test → build) |
| `.github/workflows/deploy.yml` | Deploy to VPS (Docker Compose) or Dokku |

---

## Project Structure

```
├── src/
│   ├── routes/              # TanStack Start file-based routes (11 pages)
│   │   ├── __root.tsx       # Root layout, theme, devtools
│   │   ├── index.tsx        # Landing page
│   │   ├── login.tsx        # Magic link auth
│   │   ├── dashboard.tsx    # Authenticated shell + status cards
│   │   ├── servers.*        # VPS connection, detail, install
│   │   ├── ai-provider.tsx  # AI provider config
│   │   ├── telegram.tsx     # Telegram bot wizard
│   │   ├── logs.tsx         # Log viewer
│   │   └── about.tsx        # About page
│   ├── components/ui/       # shadcn/ui primitives (button, etc.)
│   ├── features/            # Feature-specific UI components
│   ├── lib/                 # Shared utilities (auth-client, ai-providers, etc.)
│   ├── server.ts            # Server entrypoint (Hono + TanStack Start)
│   └── router.tsx           # Router configuration
│
├── server/                  # Hono API + business logic
│   ├── app.ts               # Main API router with all endpoints
│   ├── auth.ts              # Better Auth (lazy initialization)
│   ├── crypto.ts            # AES-256-GCM encrypt/decrypt
│   ├── ssh/                 # SSH connection, OS validation, errors
│   ├── db/                  # Drizzle schema, connection, health
│   ├── install/             # Install workflow + SSE streaming
│   ├── telegram/            # Telegram bot verification, pairings
│   ├── providers/           # AI provider config, validation, deploy
│   ├── web-ui/              # Hermes Web UI proxy, SSH tunneling
│   ├── dashboard/           # Aggregated status + VPS metrics
│   └── *.ts                 # Server modules (servers, actions, logs, etc.)
│
├── drizzle/                 # Generated SQL migrations
├── scripts/                 # Production startup script
├── public/                  # Static assets
└── dist/                    # Build output (gitignored)
```

---

## Key Architectural Decisions

1. **Lazy Auth Initialization**: Better Auth instantiated on first request to avoid crash when DATABASE_URL unset
2. **SSR Base URL**: Absolute BETTER_AUTH_URL required for magic link emails
3. **HTTPS Guard**: `requireHttps()` middleware on all mutating API routes in production
4. **OptimizeDeps Exclusions**: `node-ssh`, `ssh2`, `cpu-features` excluded from Vite prebundling (native .node binaries)
5. **Generated Route Tree**: `src/routeTree.gen.ts` auto-generated, excluded from Biome checks
6. **In-Memory SSE + Persisted Events**: Install progress in both `install_events` table and in-memory stream
7. **Encrypted Credentials**: AES-256-GCM for SSH credentials, API keys, bot tokens at rest

---

## Development Commands

| Command | Description |
|---------|-------------|
| `bun run dev` | Vite dev server on port 3000 |
| `bun run build` | Production build |
| `bun run test` | Vitest test suite |
| `bun run typecheck` | TypeScript strict check |
| `bun run db:generate` | Generate Drizzle migrations |
| `bunx @biomejs/biome check .` | Lint/format check |
| `bunx @biomejs/biome check --write .` | Auto-format |
| `just ci` | Full pipeline: lint → typecheck → test → build |

---

## Production Deployment

- **Container**: Multi-stage Dockerfile (Bun deps → Node 22 Alpine runtime)
- **Health Check**: `/api/health` endpoint (database connectivity)
- **Migrations**: Auto-run on container start via `start-production.mjs`
- **Reverse Proxy**: Required for TLS termination (Caddy/nginx), sets `x-forwarded-proto`
- **Environment**: All secrets via env vars (see `.env.example` + deploy workflow)

---

## Testing Stack

| Tool | Version | Configuration |
|------|---------|---------------|
| **Test Runner** | Vitest | ^4.1.5, Node environment |
| **Testing Library** | @testing-library/react | ^16.3.0 |
| **DOM** | happy-dom / jsdom | ^20.10.1 / ^28.1.0 |
| **Coverage** | Not configured | --reporter=dot |

Test patterns: `src/**/*.test.{ts,tsx}`, `server/**/*.test.ts`
