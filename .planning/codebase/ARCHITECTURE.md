# System Architecture

Generated: 2026-06-06

## Architecture Pattern

**Full-stack monolith with API proxy** — TanStack Start serves the React frontend with SSR and handles `/api/*` requests by forwarding to a Hono sub-app. Business logic lives in `server/` modules imported directly by both Hono route handlers and TanStack Start server functions.

## Request Flow

```
Browser
  │
  ├── /api/* ──→ src/server.ts ──→ server/app.ts (Hono)
  │                                    ├── Auth middleware (Better Auth)
  │                                    ├── Request guards (ownership, SSH)
  │                                    └── Route handlers
  │                                         ├── PostgreSQL (Drizzle ORM)
  │                                         ├── SSH (node-ssh → VPS)
  │                                         └── External APIs (Telegram, OpenAI, etc.)
  │
  └── /* ──────→ src/server.ts ──→ TanStack Start handler
                                    ├── SSR (React 19)
                                    ├── Server functions (createServerFn)
                                    └── Client hydration
```

## Layers

| Layer | Location | Responsibility |
|-------|----------|----------------|
| **Routes** | `src/routes/` | File-based route definitions, beforeLoad data fetching, component assignment |
| **Features** | `src/features/` | Feature-specific UI components, hooks, state machines, polling logic |
| **Components** | `src/components/` | Shared UI components (Header, Footer, ThemeToggle, ui primitives) |
| **Lib** | `src/lib/` | Shared utilities, types, auth client, status pill helpers |
| **Contracts** | `shared/contracts/` | Shared TypeScript types between server and client |
| **API handlers** | `server/app.ts` | Hono route bindings → handler modules |
| **Business logic** | `server/` | Domain modules: servers, install, providers, telegram, web-ui (`deploy.ts`, `records.ts`, `proxy-http.ts`), dashboard, logs |
| **Infrastructure** | `server/db/`, `server/ssh/` | Database connection, SSH connection, encryption |

## Data Flow Patterns

### Page Load (Authenticated)
1. `src/routes/*.tsx` → `beforeLoad` → `createServerFn` (SSR) → `server/*.ts` → PostgreSQL
2. Returns snapshot to client via route context
3. Client hydrates with server-rendered data
4. After mount, client polls for fresh data (SSE for installs, fetch for dashboard/web-ui)

### API Mutations
1. Client POST → `server/app.ts` → auth middleware → request guards → handler
2. Handler: validates, SSH to VPS, updates PostgreSQL, inserts audit log
3. Returns JSON response

### Real-time (SSE)
1. `GET /api/servers/:id/install/events` → Hono `streamSSE`
2. Server pushes install progress events
3. Reconnecting clients receive past events first (`replayInstallEvents`)

## Key Abstractions

| Abstraction | Location | Purpose |
|-------------|----------|---------|
| `requireSession` | `src/lib/session.ts` | Redirect unauthenticated users |
| `requireOwnedServer` | `server/request-guards.ts` | Verify server ownership |
| `requireOwnedServerSsh` | `server/request-guards.ts` | Verify ownership + resolve SSH credentials |
| `requireHttps` | `server/request-guards.ts` | Enforce HTTPS in production |
| `getDb` | `server/db/index.ts` | Lazy DB connection singleton |
| `encryptSecret` / `decryptSecret` | `server/crypto.ts` | AES-256-GCM encryption |
| `useMountEffect` | `src/lib/use-mount-effect.ts` | useEffect that runs once on mount |
| `AppShell` | `src/features/dashboard/app-shell.tsx` | Authenticated layout wrapper |
| `db.transaction` | Drizzle ORM | Atomic multi-statement writes |

## Entry Points

| Entry | File | Role |
|-------|------|------|
| Dev server | `src/server.ts` → `bun run dev` | Vite dev server (port 3000) |
| Production server | `scripts/start-production.mjs` | Runs migrations then starts built server |
| Docker entry | `Dockerfile` → `node dist/server/server.js` | Container runtime |
| Auth | `server/auth.ts` | Better Auth lazy initialization |
| DB | `server/db/index.ts` | PostgreSQL connection via `DATABASE_URL` |

## Database Transaction Boundaries

Per `AGENTS.md`, `db.transaction()` is used when a secondary write (audit log, version update) is coupled to a primary write and must commit or roll back together:

- **`server/telegram.ts`** — deploy + config update + audit log
- **`server/server-actions.ts`** — SSH action + audit log + install version update
- **`server/install/sse-stream.ts`** — install event insert + installs row update
- **`server/providers.ts`** — deactivate old + insert new provider config
- **`server/telegram.ts`** — deactivate old + insert new telegram config
