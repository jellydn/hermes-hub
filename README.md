# Welcome to HermesHub 👋

[![GitHub stars](https://img.shields.io/github/stars/jellydn/hermes-hub)](https://github.com/jellydn/hermes-hub/stargazers)
[![GitHub license](https://img.shields.io/github/license/jellydn/hermes-hub)](https://github.com/jellydn/hermes-hub/blob/main/LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/jellydn/hermes-hub/pulls)
[![Twitter: jellydn](https://img.shields.io/twitter/follow/jellydn.svg?style=social)](https://twitter.com/jellydn)

> **Your personal AI agent in 5 minutes. Zero terminal required.**

HermesHub is a web application that lets non-technical users deploy and manage a self-hosted [Hermes AI Agent](https://github.com/nousresearch/hermes-agent) on any VPS — no SSH, Docker, or Linux knowledge needed.

## ✨ Features

- 🔑 **Magic Link Auth** — Passwordless email sign-in via Better Auth
- 🖥️ **VPS Connection** — SSH connection wizard with password or private-key auth
- 🔒 **Credential Security** — AES-256-GCM encryption at rest; ephemeral in-memory option
- 🚀 **Hermes Install** — Automated Docker + Compose setup and container launch over SSH
- 📊 **Live Install Progress** — SSE-based real-time streaming logs with replay
- 📈 **Dashboard** — Aggregated status cards with live VPS metrics (CPU/memory/disk)
- 🤖 **AI Provider Config** — OpenAI, Anthropic, OpenRouter, Ollama, and custom endpoints with encrypted key storage
- 🚀 **Hermes Provider Deploy** — Push provider config to your Hermes VPS over SSH; sets API keys, base URLs, and default model inside the running container
- 💬 **Telegram Integration** — Bot token verification via Telegram API; connect/disconnect flow
- 🔄 **Server Actions** — One-click restart, update, rollback with audit-based history
- 📋 **Logs Viewer** — Aggregated install logs and operational action history
- ✅ **58 tests** — Vitest + Testing Library for components and server integration

## 📹 Demo

[![IT Man Channel](https://img.shields.io/badge/YouTube-IT%20Man%20Channel-red?logo=youtube)](https://github.com/jellydn/itman-channel)

## 🛠️ Prerequisites

- **Node.js >= 20** — JavaScript runtime
- **Bun** — Fast package manager and runtime (preferred)
- **PostgreSQL** — Running locally for development
- **Docker & Docker Compose** — For local full-stack testing with an email server

## 🚀 Quick Start

```bash
# Clone the repository
git clone https://github.com/jellydn/hermes-hub.git
cd hermes-hub

# Install dependencies
bun install

# Set up environment
cp .env.example .env
# Edit .env with your DATABASE_URL, ENCRYPTION_KEY, BETTER_AUTH_SECRET, and BETTER_AUTH_URL

# Initialize the database
bun run db:migrate

# Start the dev server
bun run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## 🐳 Local Full-Stack Testing with Docker Compose

The project includes a `compose.yaml` that spins up the full stack locally with **PostgreSQL** and **Mailpit** (a fake SMTP server for viewing magic link emails in the browser). This is the recommended way to test the complete auth and onboarding flow end-to-end.

### Setup

```bash
# 1. Set required environment variables
export APP_IMAGE=hermes-hub:local
export BETTER_AUTH_SECRET=dev-only-better-auth-secret-for-local-development
export BETTER_AUTH_URL=http://localhost:3000
export ENCRYPTION_KEY=0123456789abcdef0123456789abcdef

# 2. Build the Docker image
docker build -t hermes-hub:local .

# 3. Start the stack (Postgres + Mailpit + App)
docker compose up -d

# 4. Check that all services are healthy
docker compose ps
```

### Login Flow

The app runs in development mode (`NODE_ENV=development`) inside the container, so magic link emails are logged to stdout when no `RESEND_API_KEY` is set:

```bash
# 1. Request a magic link via the API
curl -X POST http://localhost:3000/api/auth/send-magic-link \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'

# 2. Retrieve the magic link URL from the app logs
docker compose logs app --tail=5
# Look for: Magic link for test@example.com: http://localhost:3000/api/auth/...

# 3. Open the magic link URL in your browser to log in
# Alternatively, use Mailpit to see the email (if RESEND_API_KEY is set):
open http://localhost:8025
```

### Service URLs

| Service  | URL                               |
| -------- | --------------------------------- |
| App      | http://localhost:3000             |
| Mailpit  | http://localhost:8025             |
| Postgres | localhost:5432 (via port mapping) |

### Resetting the Stack

```bash
# Stop and remove all containers (data persists in volumes)
docker compose down

# Stop and remove everything including volumes (fresh start)
docker compose down -v
```

## 🧪 Running Tests

```bash
# Run all tests
bun run test

# TypeScript type check
bun run typecheck

# Full CI pipeline (Biome → typecheck → test → build)
bun run build
```

## 📦 Scripts

| Command               | Description                        |
| --------------------- | ---------------------------------- |
| `bun run dev`         | Start Vite dev server on port 3000 |
| `bun run build`       | Build for production               |
| `bun run test`        | Run Vitest test suite              |
| `bun run typecheck`   | Run TypeScript type checking       |
| `bun run db:generate` | Generate Drizzle migrations        |
| `just dev`            | Thin wrapper: `bun run dev`        |
| `just test`           | Thin wrapper: `bun run test`       |
| `just typecheck`      | Thin wrapper: `bun run typecheck`  |
| `just check`          | Runs typecheck + test in parallel  |
| `just lint`           | Biome check (no auto-fix)          |
| `just format`         | Biome auto-format (`--write`)      |
| `just ci`             | Full pipeline: lint → typecheck → test → build |

## 🔧 Environment Variables

| Variable             | Description                                       |
| -------------------- | ------------------------------------------------- |
| `DATABASE_URL`       | PostgreSQL connection string                      |
| `ENCRYPTION_KEY`     | 32-byte hex key for AES-256 credential encryption |
| `BETTER_AUTH_SECRET` | Secret for Better Auth session signing            |
| `BETTER_AUTH_URL`    | Public URL of the app for magic link emails       |
| `API_SERVER_MODEL_NAME` | Model ID injected into Hermes Docker Compose on deploy |
| `RESEND_API_KEY`     | Resend API key for sending magic-link emails (optional) |
| `RESEND_FROM`        | Sender email address for magic-link emails (optional, e.g. `noreply@example.com`) |

## 🏗️ Architecture

```
src/routes/           — TanStack Start file-based routes (11 pages)
├── __root.tsx         — Root layout (theme init, devtools, header/footer)
├── index.tsx          — Landing page
├── login.tsx          — Magic link email login
├── dashboard.tsx      — Authenticated shell + aggregated status
├── servers.tsx        — VPS connection wizard + install trigger
├── servers.$id.tsx    — Server detail, actions, action history
├── servers.$id.install.tsx  — Live SSE install progress
├── ai-provider.tsx    — AI provider selection and API key config
├── telegram.tsx       — Telegram bot connection wizard
├── logs.tsx           — Install + action log viewer
└── about.tsx          — About page

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

### Stack

| Layer      | Choice                                                                           |
| ---------- | -------------------------------------------------------------------------------- |
| Frontend   | [TanStack Start](https://tanstack.com/start/latest) (file-based routing)         |
| UI         | [TailwindCSS v4](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/) |
| Backend    | [Hono](https://hono.dev/) REST API on `/api/*`                                   |
| Database   | PostgreSQL + [Drizzle ORM](https://orm.drizzle.team/)                            |
| Auth       | [Better Auth](https://www.better-auth.com/) (magic link only)                    |
| SSH        | [node-ssh](https://github.com/steelbrain/node-ssh)                               |
| Realtime   | Server-Sent Events (Hono `streamSSE`)                                            |
| Encryption | AES-256-GCM (built-in Node `crypto`)                                             |
| Tests      | [Vitest](https://vitest.dev/) + [Testing Library](https://testing-library.com/)  |

## 📚 API Reference

Complete documentation for all API endpoints is available in [`docs/api-reference.md`](docs/api-reference.md):

- Authentication (magic link flow via Better Auth)
- Health check
- VPS connection, install (with SSE streaming), and server actions
- Dashboard status aggregation
- Install & action logs
- AI provider configuration and testing
- Telegram bot connect/disconnect

## 📄 License

MIT

## 👤 Author

**Dung Huynh Duc**

- Website: [https://productsway.com/](https://productsway.com/)
- Twitter: [@jellydn](https://twitter.com/jellydn)
- GitHub: [@jellydn](https://github.com/jellydn)

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! Feel free to check the [issues page](https://github.com/jellydn/hermes-hub/issues).

## 🌟 Show your support

Give a ⭐️ if this project helped you!

---

_This README was generated with ❤️ by [readme-md-generator](https://github.com/kefranabg/readme-md-generator)_
