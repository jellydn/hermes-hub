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

## Planned Stack

| Layer    | Choice                                                                        |
| -------- | ----------------------------------------------------------------------------- |
| Frontend | [TanStack Start](https://tanstack.com/start/latest)                           |
| UI       | [TailwindCSS](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/) |
| Backend  | [Hono](https://hono.dev/)                                                     |
| Database | PostgreSQL + [Drizzle ORM](https://orm.drizzle.team/)                         |
| Auth     | [Better Auth](https://www.better-auth.com/) (magic link only)                 |
| SSH      | node-ssh / ssh2                                                               |
| State    | TanStack Query                                                                |
| Realtime | Server-Sent Events                                                            |

## Status

**Scaffolded** — TanStack Start is in place with file-based routing, TailwindCSS v4, and the default starter pages. MVP feature work is still pending.

- [Full MVP PRD](tasks/prd-hermes-hub-mvp.md) — all user stories, schema, and functional requirements
- [Ralph build plan](scripts/ralph/prd.json) — executable story queue for the Ralph autonomous agent loop

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
src/routes/       — TanStack Start file-based routes
src/components/   — shared UI components
src/router.tsx    — router setup
server/           — Hono API routes
server/db/        — Drizzle schema and migrations
server/ssh/       — SSH connection utilities
server/install/   — Hermes install orchestration with SSE
```

Credential security: AES-256-GCM encryption at rest. SSH credentials can be stored encrypted or be ephemeral (in-memory only, discarded after session).

## License

MIT
