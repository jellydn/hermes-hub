# Welcome to HermesHub 👋

[![GitHub stars](https://img.shields.io/github/stars/jellydn/hermes-hub)](https://github.com/jellydn/hermes-hub/stargazers)
[![GitHub license](https://img.shields.io/github/license/jellydn/hermes-hub)](https://github.com/jellydn/hermes-hub/blob/main/LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/jellydn/hermes-hub/pulls)
[![Twitter: jellydn](https://img.shields.io/twitter/follow/jellydn.svg?style=social)](https://twitter.com/jellydn)

> **Your personal AI agent in 5 minutes. Zero terminal required.**

HermesHub is a web application that lets non-technical users deploy and manage a self-hosted [Hermes AI Agent](https://github.com/nousresearch/hermes-agent) on any VPS — no SSH, Docker, or Linux knowledge needed.

## Who is HermesHub for?

HermesHub is for people who want the power of a self-hosted Hermes AI Agent but do not want to manage SSH commands, Docker setup, Linux administration, provider configuration, or Telegram onboarding manually.

It transforms Hermes deployment into a guided web wizard.

## 🔗 Hermes ecosystem

HermesHub focuses on the VPS setup path: connect your server, install Hermes with live progress, deploy your AI provider, finish Telegram onboarding, and manage restart, update, and rollback from the dashboard.

After setup, the **Hermes Web UI** is the browser interface for using Hermes day to day — sessions, chat, workspace files, and tool calls. The community Hermes site at [get-hermes.ai](https://get-hermes.ai/) describes that Web UI and the broader Hermes ecosystem.

For iPhone users, **[Hermex](https://github.com/uzairansaruzi/hermex)** is a free, native SwiftUI iOS app built by the community that connects to your self-hosted Hermes Web UI — chat with your agent, browse sessions, manage tasks, and more. Available on the [App Store](https://apps.apple.com/app/hermex/id6767006319).

HermesHub is a separate product and is not affiliated with [get-hermes.ai](https://get-hermes.ai/).

## ✨ Features

- 🔑 **Passwordless login** — Sign in with a magic link, no passwords to manage
- 🖥️ **Guided VPS setup** — Step-by-step server connection wizard for non-technical users
- 🚀 **One-click Hermes deployment** — Install Docker, Compose, and Hermes from the dashboard with live progress
- 🤖 **AI provider configuration** — Set up OpenAI, Anthropic, OpenRouter, Ollama, DeepSeek, Command Code, custom endpoints, and OpenAI Codex / ChatGPT OAuth without editing env files (custom model IDs supported for every provider)
- 💬 **Telegram onboarding** — Connect your bot, verify the token, and approve pairing codes from one screen
- 🎭 **Agent persona editor** — Define how Hermes speaks via `SOUL.md` on the Settings page, then deploy to a chosen VPS
- 🔌 **MCP server manager** — Add stdio or HTTP MCP servers (including recommended presets) on the Settings page, then deploy them to Hermes `config.yaml`
- 📈 **Live server monitoring** — Dashboard with install logs and VPS metrics (CPU, memory, disk)
- ✅ **VPS setup check** — On-demand readiness check on the server detail page (Docker, Hermes workspace, agent health) with plain-language results
- 🔄 **One-click restart, update, and rollback** — Manage the running agent with audit history
- 🖥️ **Built-in Hermes Web UI** — Deploy and open the Hermes browser interface from your server detail page
- 📋 **Operational logs** — Review install history and server action records in one place

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

## 🚀 Production Deployment

The `compose.yaml` stack runs the app with `NODE_ENV=production` and publishes the app on `:3000`. In production, HermesHub must sit **behind a single TLS-terminating reverse proxy** (Caddy, nginx, …) that owns the public hostname — the app process must **not** be exposed directly to the Internet.

The HTTPS guard on credential-bearing endpoints (`httpsMiddleware` → `requireHttps`) rejects plain-HTTP requests with **HTTP 426** unless the request URL is `https://` **or** the proxy forwards `x-forwarded-proto: https`. Without a correctly configured proxy, install progress polling (SSE), credential saves, and all mutating routes fail in production.

Minimal Caddy setup (Caddy sets `X-Forwarded-Proto` automatically):

```caddyfile
hermes-hub.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

Minimal nginx setup:

```nginx
server {
    server_name hermes-hub.example.com;
    listen 443 ssl;
    # ... TLS certificates ...

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

Keep `TRUSTED_PROXY_COUNT` at its default of `1` (the app reads the rightmost `x-forwarded-for` entry from the single proxy in front of it), and set `BETTER_AUTH_URL` to the public HTTPS origin so magic links point at the proxy.

### Dokku targets

Dokku's built-in nginx proxy already forwards `x-forwarded-proto` correctly (it sets it from `$scheme`), but TLS termination only happens once the app has a **certificate installed**. Enable Let's Encrypt on the Dokku host once — the `deploy-dokku` CI job fails the deploy when no certificate is present (except the bootstrap deploy of a newly created app, which the HTTP-01 challenge needs to exist first):

Run the bootstrap script from a trusted local machine with `gh`, OpenSSH, an authenticated [GitHub CLI](https://cli.github.com/), and existing administrative SSH access to the Dokku host. The administrative account must be able to run `dokku version` and `dokku ssh-keys:*` commands:

```bash
# Uses your SSH agent/config for administrative access and creates
# ~/.ssh/hermes-hub-dokku-deploy as a dedicated deployment key.
./scripts/setup-dokku-deploy-secrets.sh \
  --host <dokku-host> \
  --admin-user root

# Select an existing administrative key, a different SSH port, and optionally
# rerun and monitor a failed deployment after setup.
./scripts/setup-dokku-deploy-secrets.sh \
  --host <dokku-host> \
  --port <ssh-port> \
  --admin-user <admin-user> \
  --admin-key ~/.ssh/<admin-key> \
  --rerun <actions-run-id>
```

The host can be supplied through `DOKKU_HOST` instead of `--host`; it is never stored in this repository. The script verifies administrative access, creates an unencrypted Ed25519 deployment key locally, installs only its public key through the administrative connection, and verifies `dokku` access with the dedicated key. Repeated runs reuse a valid, working key without reinstalling it. The private key is streamed directly to `gh secret set` and is never printed. Port 22 uses the workflow default and removes a stale `DOKKU_SSH_PORT`; non-default ports are stored explicitly. SSH asks you to confirm a previously unknown host key.

```bash
# On the Dokku host — one-time setup
dokku plugin:install https://github.com/dokku/dokku-letsencrypt.git
dokku letsencrypt:cron-job --add
dokku letsencrypt:set --global email you@example.com

# After the app is deployed and reachable on :80 (HTTP-01 challenge)
dokku letsencrypt:enable <app>
```

Custom certificates work too: `dokku certs:add <app>` (passing the cert and key). Without a certificate, Dokku serves plain HTTP, the app receives `x-forwarded-proto: http`, and the HTTPS guard returns **HTTP 426** for every credential-bearing route.

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

| Command               | Description                                    |
| --------------------- | ---------------------------------------------- |
| `bun run dev`         | Start Vite dev server on port 3000             |
| `bun run build`       | Build for production                           |
| `bun run test`        | Run Vitest test suite                          |
| `bun run typecheck`   | Run TypeScript type checking                   |
| `bun run db:generate` | Generate Drizzle migrations                    |
| `bun run db:migrate`  | Apply Drizzle migrations locally               |
| `just dev`            | Thin wrapper: `bun run dev`                    |
| `just test`           | Thin wrapper: `bun run test`                   |
| `just typecheck`      | Thin wrapper: `bun run typecheck`              |
| `just check`          | Runs typecheck + test in parallel              |
| `just lint`           | Biome check (no auto-fix)                      |
| `just format`         | Biome auto-format (`--write`)                  |
| `just db-migrate`     | Thin wrapper: `bun run db:migrate`             |
| `just ci`             | Full pipeline: lint → typecheck → test → build |

## 🔧 Environment Variables

| Variable                    | Description                                                                       |
| --------------------------- | --------------------------------------------------------------------------------- |
| `DATABASE_URL`              | PostgreSQL connection string                                                      |
| `ENCRYPTION_KEY`            | 32-byte hex key for AES-256 credential encryption                                 |
| `BETTER_AUTH_SECRET`        | Secret for Better Auth session signing                                            |
| `BETTER_AUTH_URL`           | Public URL of the app for magic link emails                                       |
| `API_SERVER_MODEL_NAME`     | Model ID injected into Hermes Docker Compose on deploy                            |
| `RESEND_API_KEY`            | Resend API key for sending magic-link emails (optional)                           |
| `RESEND_FROM`               | Sender email address for magic-link emails (optional, e.g. `noreply@example.com`) |
| `STALE_DEPLOY_THRESHOLD_MS` | Stale Web UI deploy timeout in milliseconds (default: 600000 = 10 minutes)        |

## Troubleshooting

### Telegram says the user is not recognized

When Hermes replies in Telegram with a pairing code and asks the owner to run `hermes pairing approve telegram <code>`, approve the code from HermesHub instead:

1. Open `/telegram`.
2. Make sure the Telegram bot has been deployed to the Hermes VPS.
3. Paste the 8-character code into **Pair Telegram users**.
4. Click **Approve**.

HermesHub runs the approval against the deployed Hermes container over SSH and uses Hermes' own pairing store. You do not need to run `hermes setup` for the managed install path.

If the same Telegram user is asked to approve again after a successful approval, the pairing files may have been written by an older root-run approval command. Refresh the **Pair Telegram users** panel or approve the next code from HermesHub again. HermesHub repairs `$HERMES_HOME/platforms/pairing` ownership and runs the pairing command as the container's `hermes` user so the live Telegram gateway can read the approved-user file.

### Telegram test returns a Hermes API 401 or 502

Check the deployed Hermes container logs on the VPS first:

```bash
docker logs hermes --tail=100
```

If the raw provider API works but Hermes returns an authentication error, redeploy the AI provider from HermesHub. For custom OpenAI-compatible providers, the deployed container must receive both the generic base URL variables and the host-derived API key variable. For example:

| Custom base URL               | Required vendor key |
| ----------------------------- | ------------------- |
| `https://crof.ai/v1`          | `CROF_API_KEY`      |
| `https://api.deepseek.com/v1` | `DEEPSEEK_API_KEY`  |

HermesHub now derives that vendor key during provider deploy, alongside `OPENAI_API_KEY`, `CUSTOM_BASE_URL`, `OPENAI_BASE_URL`, and `HERMES_INFERENCE_PROVIDER=custom`.

### OpenAI Codex deploy says authentication is missing

OpenAI Codex uses ChatGPT device-code login on the deployed Hermes server, not an API key in HermesHub. On `/ai-provider`, select **OpenAI Codex / ChatGPT**, click **Start ChatGPT Login**, approve the code at OpenAI, then click **I entered the code**. Deploy stays disabled until remote auth status shows authenticated.

HermesHub never stores Codex OAuth tokens in its database. Auth state lives in remote `/root/.hermes/auth.json`. If HermesHub restarts during login, start device-code auth again.

### MCP deploy fails with a 502 error

MCP deploy merges your saved servers into the existing `/root/.hermes/config.yaml` on the VPS. If that file is corrupted or not valid YAML, HermesHub refuses to overwrite it and returns a deploy error. Fix or back up the remote config on the VPS first, then deploy again from `/settings`.

## 🏗️ Architecture

```
src/routes/           — TanStack Start file-based routes (11 pages)
├── __root.tsx         — Root layout (theme init, devtools, header/footer)
├── index.tsx          — Landing page (Hermes ecosystem links)
├── login.tsx          — Magic link email login
├── dashboard.tsx      — Authenticated shell + aggregated status
├── servers.tsx        — VPS connection wizard + install trigger
├── servers.$id.tsx    — Server detail, VPS setup check, Hermes Web UI, actions, action history
├── servers.$id.install.tsx  — Live SSE install progress
├── ai-provider.tsx    — AI provider selection and API key config
├── telegram.tsx       — Telegram bot connection wizard
├── settings.tsx       — Hermes persona editor and MCP server manager
├── logs.tsx           — Install + action log viewer
└── about.tsx          — About page (Hermes ecosystem context)

server/               — Hono API routes and business logic
├── app.ts            — Hono router with all API route bindings
├── auth.ts           — Better Auth instance (lazy, DB-optional)
├── crypto.ts         — AES-256-GCM encrypt/decrypt
├── credentials.ts    — In-memory ephemeral credential cache
├── ssh.ts            — node-ssh wrapper, OS validation, connection verification
├── servers.ts        — VPS connection (insert, credential handling, audit)
├── install.ts        — Hermes install pipeline with SSE streaming
├── server-actions.ts — Restart/update/rollback via SSH
├── web-ui/           — Hermes Web UI deploy, password reveal, SSH-forward proxy
├── dashboard.ts      — Aggregated status with live VPS metrics
├── providers.ts      — AI provider save, test, model validation
├── telegram.ts       — Telegram bot token verification + connect/disconnect
├── settings.ts       — Agent persona save and SOUL.md deploy
├── settings/mcp.ts   — MCP server CRUD and config.yaml deploy
├── hermes/deploy.ts  — Shared Hermes deploy orchestration (SSH, audit, gateway restart)
├── hermes/deploy-targets.ts — Eligible VPS targets (successful Hermes installs)
├── hermes/persona.ts — Persona validation and SOUL.md SSH write helper
├── hermes/mcp-config.ts — Hermes config.yaml SSH read/write helper
├── hermes/telegram-deploy.ts — Telegram-linked provider deploy (SSH, audit, restart)
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
- VPS connection, install (with SSE streaming), VPS setup check, server actions, and Hermes Web UI proxy
- Dashboard status aggregation
- Install & action logs
- AI provider configuration and testing
- Telegram bot connect/disconnect
- Agent persona save and SOUL.md deploy
- MCP server CRUD and config.yaml deploy

## 📄 License

MIT

## 👤 Author

**Dung Huynh Duc**

- Website: [https://productsway.com/](https://productsway.com/)
- Twitter: [@jellydn](https://twitter.com/jellydn)
- GitHub: [@jellydn](https://github.com/jellydn)

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! Feel free to check the [issues page](https://github.com/jellydn/hermes-hub/issues).

## Show your support

[![kofi](https://img.shields.io/badge/Ko--fi-F16061?style=for-the-badge&logo=ko-fi&logoColor=white)](https://ko-fi.com/dunghd)
[![paypal](https://img.shields.io/badge/PayPal-00457C?style=for-the-badge&logo=paypal&logoColor=white)](https://paypal.me/dunghd)
[![buymeacoffee](https://img.shields.io/badge/Buy_Me_A_Coffee-FFDD00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://www.buymeacoffee.com/dunghd)

Give a ⭐️ if this project helped you!
