# HermesHub

> Your personal AI agent in 5 minutes. Zero terminal required.

HermesHub is a web application that lets non-technical users deploy and manage a self-hosted [Hermes AI Agent](https://github.com/anomalyco/hermes) on any VPS — no SSH, Docker, or Linux knowledge needed.

## The Problem

Setting up a self-hosted AI agent currently requires SSH access, Linux administration, Docker configuration, environment variable wrangling, and security hardening. This blocks adoption for creators, educators, freelancers, and founders who want a private AI assistant with persistent memory and Telegram-based workflows.

## What It Does

1. **Connect a VPS** — enter IP, username, and password or SSH key
2. **Click Install** — HermesHub automates Docker, Docker Compose, and Hermes setup
3. **Add an API key** — OpenAI, Anthropic, or OpenRouter
4. **Connect Telegram** — paste your BotFather token
5. **Chat with your agent** — through Telegram or the web dashboard

## Status

**MVP Complete** — All core user stories are implemented and tested. HermesHub is ready for first-time deployments on Ubuntu 22.04+ / Debian 12+ VPS targets.

- [Full MVP PRD](tasks/prd-hermes-hub-mvp.md) — all user stories, schema, and functional requirements
- [Ralph build plan](scripts/ralph/prd.json) — executable story queue for the Ralph autonomous agent loop

### Implemented Features

| Feature                         | Description                                                                 |
| ------------------------------- | --------------------------------------------------------------------------- |
| **Magic Link Auth**             | Passwordless email sign-in via Better Auth; session cookie management        |
| **VPS Connection**              | SSH connection wizard with password or private-key auth; real OS validation |
| **Credential Security**         | AES-256-GCM encryption at rest; ephemeral in-memory credential option       |
| **Hermes Install**              | Automated Docker + Compose setup, image pull, and container launch over SSH |
| **Live Install Progress**       | SSE-based real-time streaming logs; replay from DB on reconnection          |
| **Dashboard**                   | Aggregated status cards — VPS health (CPU/mem/disk), agent, provider, Telegram |
| **Live VPS Metrics**            | CPU, memory, disk usage, and uptime polled over SSH every 30 seconds        |
| **AI Provider Config**          | OpenAI, Anthropic, and OpenRouter; encrypted API key storage; test button   |
| **Telegram Integration**        | Bot token verification via Telegram API; connect/disconnect flow            |
| **Server Detail & Actions**     | Restart, update, rollback; action confirmation card; audit-based history     |
| **Rollback Image Resolution**   | Auto-resolves previous version from install history or explicit target       |
| **Audit Logs**                  | All server, provider, and Telegram actions logged with timestamps and IP     |
| **Logs Viewer**                 | Aggregated install logs and operational action history; clear-logs button    |
| **Error Handling**              | Unsupported OS detection, ephemeral credential expiry, concurrent install guard |
| **Component / Server Tests**    | Vitest + Testing Library; server-side integration tests                     |

## Planned Stack Implemented

| Layer    | Choice                                                                        |
| -------- | ----------------------------------------------------------------------------- |
| Frontend | [TanStack Start](https://tanstack.com/start/latest) (file-based routing)      |
| UI       | [TailwindCSS v4](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/) |
| Backend  | [Hono](https://hono.dev/) REST API on `/api/*`                               |
| Database | PostgreSQL + [Drizzle ORM](https://orm.drizzle.team/)                        |
| Auth     | [Better Auth](https://www.better-auth.com/) (magic link only)                 |
| SSH      | [node-ssh](https://github.com/steelbrain/node-ssh)                            |
| State    | TanStack Server Functions + `useState` for component-local state             |
| Realtime | Server-Sent Events (Hono `streamSSE`) for install progress                   |
| Encryption | AES-256-GCM (built-in Node `crypto`)                                      |
| Tests    | [Vitest](https://vitest.dev/) + [Testing Library](https://testing-library.com/) |

## Development

```bash
# Prerequisites
node >= 20
bun (preferred package manager)
postgresql running locally

# Clone and install
git clone <repo-url>
cd hermes-hub
bun install

# Set up environment
cp .env.example .env
# Edit .env with your DATABASE_URL and ENCRYPTION_KEY

# Run database migrations
bun run db:migrate

# Start dev server
bun run dev

# Typecheck
bun run typecheck

# Run tests
bun run test
```

### Environment Variables

| Variable             | Description                                       |
| -------------------- | ------------------------------------------------- |
| `DATABASE_URL`       | PostgreSQL connection string                      |
| `ENCRYPTION_KEY`     | 32-byte hex key for AES-256 credential encryption |
| `BETTER_AUTH_SECRET` | Secret for Better Auth session signing            |
| `BETTER_AUTH_URL`    | Public URL of the app for magic link emails       |

## Architecture

```
src/routes/           — TanStack Start file-based routes (11 pages)
├── __root.tsx         — Root layout (theme init, devtools, header/footer)
├── index.tsx          — Landing page (redirects to dashboard when authed)
├── login.tsx          — Magic link email login
├── dashboard.tsx      — Authenticated shell + aggregated status (AppShell export)
├── servers.tsx        — VPS connection wizard + install trigger
├── servers.$id.tsx    — Server detail, actions, action history
├── servers.$id.install.tsx  — Live SSE install progress
├── ai-provider.tsx    — AI provider selection and API key config
├── telegram.tsx       — Telegram bot connection wizard
├── logs.tsx           — Install + action log viewer
├── about.tsx          — About page (CTA scaffold, outside AppShell)
└── settings.tsx       — Settings stub (AppShell frame only)
src/features/         — Feature components (dashboard, servers, providers, telegram, logs)
src/components/ui/    — Shared UI primitives (button based on shadcn)
src/lib/              — Type definitions, auth client, helpers
server/               — Hono API routes and business logic
├── app.ts            — Hono router with all API route bindings
├── auth.ts           — Better Auth instance (lazy, DB-optional)
├── crypto.ts         — AES-256-GCM encrypt/decrypt
├── credentials.ts    — In-memory ephemeral credential cache
├── ssh.ts            — node-ssh wrapper, OS validation, connection verification
├── servers.ts        — VPS connection (insert, credential handling, audit)
├── install.ts        — Hermes install pipeline with SSE streaming
├── server-actions.ts — Restart/update/rollback via SSH
├── dashboard.ts      — Aggregated status with live VPS metrics
├── providers.ts      — AI provider save, test, model validation
├── telegram.ts       — Telegram bot token verification + connect/disconnect
├── logs.ts           — Install + action log queries and clearing
└── db/               — Drizzle schema, connection, health check
```

### Key Design Decisions

- **Lazy auth** — Better Auth is created inside a getter, not at module load. Page routes render even when `DATABASE_URL` is missing (shows login error instead of crashing).
- **Ephemeral credential fallback** — Credentials can be stored encrypted (persist across sessions) or kept in-memory only (discarded when the session ends).
- **SSE with DB persistence** — Install events are written to the `installs.log` column and mirrored in-memory for real-time subscribers. Reconnecting clients replay past events from the log.
- **Audit-driven action history** — Server actions (restart/update/rollback) are recorded in `audit_logs` with typed action names. The history page filters and renders them client-side.
- **Confirmation cards over dialogs** — Destructive actions use an inline `ConfirmationCard` inside the feature component rather than `window.confirm` or an `AlertDialog` (avoids a11y trapping and keeps the flow in the component tree).

### Credential Security

All sensitive credentials (SSH keys, API keys, bot tokens) are encrypted with **AES-256-GCM** before storage. The `ENCRYPTION_KEY` environment variable seeds the encryption key via SHA-256. The ciphertext format is `iv.authTag.encryptedData`, all base64url-encoded.

## API Reference

Complete documentation for all API endpoints is available in [`docs/api-reference.md`](docs/api-reference.md):

- Authentication (magic link flow via Better Auth)
- Health check
- VPS connection, install (with SSE streaming), and server actions (restart/update/rollback)
- Dashboard status aggregation
- Install & action logs
- AI provider configuration and testing
- Telegram bot connect/disconnect

## License

MIT
