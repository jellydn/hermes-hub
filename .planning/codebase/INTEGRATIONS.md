# External Integrations

**Analysis Date:** 2026-06-06

## APIs & External Services

**AI Inference Providers:**
- OpenAI — Connection test via `GET https://api.openai.com/v1/models` (`server/providers/connection.ts`); API keys stored encrypted and deployed as env vars to remote Hermes containers (`server/providers/config.ts`)
- Anthropic — Connection test via `GET https://api.anthropic.com/v1/models` (`server/providers/connection.ts`)
- OpenRouter — Connection test via `GET https://openrouter.ai/api/v1/models` (`server/providers/connection.ts`)
- Ollama / Custom OpenAI-compatible — Connection test against user-supplied `baseUrl` (`server/providers/connection.ts`, `src/lib/ai-providers.ts`)
- SDK/Client: Native `fetch` (no provider SDK packages)
- Auth: User-supplied API keys encrypted with `ENCRYPTION_KEY`; deployed remotely as `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`, etc. (`server/providers/config.ts`)

**Telegram:**
- Telegram Bot API — Token verification (`getMe`), bot testing, pairing management (`server/telegram/config.ts`, `server/telegram.ts`)
- SDK/Client: Native `fetch` to `https://api.telegram.org/bot{token}/{method}` (`server/telegram/config.ts`)
- Auth: Bot token stored encrypted in `telegram_configs` table; deployed to Hermes via SSH (`server/telegram.ts`)

**Email (Magic Links):**
- Resend — Transactional email for Better Auth magic links (`server/lib/send-magic-link-email.ts`)
- SDK/Client: Native `fetch` to `https://api.resend.com/emails`
- Auth: `RESEND_API_KEY`; sender via `RESEND_FROM`

**Remote Server Management (SSH):**
- Managed VPS hosts — Connect, install Hermes, run health checks, deploy compose stacks, proxy Web UI (`server/ssh/connection.ts`, `server/servers.ts`, `server/managed-compose-deploy.ts`)
- SDK/Client: `node-ssh` (`server/ssh/connection.ts`)
- Auth: Password or SSH private key; credentials held in-memory per session (`server/credentials.ts`), server host keys fingerprinted and stored in DB

**Hermes Agent (on remote servers):**
- OpenAI-compatible gateway — Health checks and Telegram bot tests hit `http://127.0.0.1:8642/v1/*` over SSH (`server/health-check/commands.ts`, `server/telegram.ts`)
- Docker images — `nousresearch/hermes-agent` (agent), `ghcr.io/nesquena/hermes-webui` (Web UI) pinned by digest (`server/constants.ts`)
- Deploy mechanism: Generated `docker-compose` YAML pushed and applied over SSH (`server/server-compose.ts`, `server/compose-deploy-ssh.ts`)

**Fonts (frontend):**
- Google Fonts — Fraunces and Manrope loaded from `fonts.googleapis.com` (`src/styles.css`)

## Data Storage

**Databases:**
- PostgreSQL 17 — Primary application database
- Connection: `DATABASE_URL` (constructed in `compose.yaml` for Docker; required in `server/db/index.ts`)
- Client: `postgres` driver + Drizzle ORM (`server/db/index.ts`, `server/db/schema.ts`)
- Migrations: Drizzle Kit (`drizzle/` folder, `drizzle.config.ts`, `scripts/db-migrate.mjs`, startup migrate in `scripts/start-production.mjs`)
- Schema includes: users/sessions (Better Auth), servers, installs, audit logs, AI providers, Telegram configs, MCP servers, health checks

**File Storage:**
- Local filesystem only — No cloud object storage; static assets served from `dist/client` in production (`scripts/start-production.mjs`)
- Remote server filesystem — Hermes compose volumes and agent source sync over SSH (`server/constants.ts`, `server/managed-compose-deploy.ts`)

**Caching:**
- In-memory only — Dashboard status cache (`server/dashboard.ts`), VPS metrics cache (`server/dashboard/metrics.ts`), install SSE stream state (`server/install/sse-stream.ts`), session SSH credential store (`server/credentials.ts`), magic-link rate limiter (`server/app.ts`)
- No Redis or external cache service

## Authentication & Identity

**Auth Provider:**
- Better Auth — Magic-link email sign-in (no OAuth providers configured)
- Implementation: Lazy-initialized in `server/auth.ts` with Drizzle adapter (`@better-auth/drizzle-adapter`), `tanstackStartCookies()` plugin, and `magicLink` plugin
- Client: `better-auth/react` in `src/lib/auth-client.ts`; SSR uses absolute `BETTER_AUTH_URL` + `/api/auth`
- Session enforcement: `getAuthSession()` / `requireAuthSession()` on protected API routes (`server/request-guards.ts`)
- Production guards: `BETTER_AUTH_SECRET` + `BETTER_AUTH_URL` required (`server/auth.ts`); HTTPS required on mutating routes (`server/app.ts`)

## Monitoring & Observability

**Error Tracking:**
- None — No Sentry, Datadog, or similar integration in application code

**Logs:**
- `console.log` / `console.error` — Server errors, migration output, dev magic-link URLs (`scripts/start-production.mjs`, `server/lib/send-magic-link-email.ts`)
- PostgreSQL `audit_logs` — User-initiated actions, deploy events, health checks (`server/lib/insert-audit-log.ts`, `server/logs.ts`)
- PostgreSQL `install_events` — Persisted install progress (source of truth alongside SSE) (`server/install/sse-stream.ts`)
- Health endpoint: `GET /api/health` returns DB connectivity status (`server/app.ts`, `server/db/health.ts`)
- Docker `HEALTHCHECK` — Probes `/api/health` (`Dockerfile`)

## CI/CD & Deployment

**Hosting:**
- VPS — Docker Compose deploy over SSH (`.github/workflows/deploy.yml`, `compose.yaml`)
- Dokku — Git-push deploy with `dokku config:set` (`.github/workflows/deploy.yml`)
- Container registry — GitHub Container Registry (`ghcr.io`) for app image

**CI Pipeline:**
- GitHub Actions — `.github/workflows/ci.yml`: Biome → typecheck → Vitest → build
- Deploy workflow — `.github/workflows/deploy.yml`: validate → build/push image → VPS or Dokku deploy
- React Doctor — Optional PR/main scans (`.github/workflows/react-doctor.yml`)

## Environment Configuration

**Required env vars:**
- `DATABASE_URL` — PostgreSQL connection (`server/db/index.ts`, `.env.example`)
- `ENCRYPTION_KEY` — AES-256-GCM encryption for stored secrets (`server/crypto.ts`, `.env.example`)
- `BETTER_AUTH_SECRET` — Session signing (`server/auth.ts`, `.env.example`)
- `BETTER_AUTH_URL` — Public app URL for auth callbacks and compose public origin (`server/auth.ts`, `server/server-compose.ts`)
- `RESEND_API_KEY` — Required in production for magic-link delivery (`server/lib/send-magic-link-email.ts`)

**Commonly set in production/deploy:**
- `NODE_ENV=production` — Set in `Dockerfile` and `compose.yaml`
- `PORT` — Default `3000` (`scripts/start-production.mjs`, `compose.yaml`)
- `HOST` — Default `0.0.0.0` (`scripts/start-production.mjs`)
- `RESEND_FROM` — Email sender address (`server/lib/send-magic-link-email.ts`)
- `TRUSTED_PROXY_COUNT` — Client IP extraction behind reverse proxy (`server/lib/get-client-ip.ts`, default `1`)
- `DB_POOL_MAX` — Postgres pool size (`server/db/index.ts`, default `5`)
- `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` — VPS compose Postgres (`compose.yaml`, deploy workflow)

**Optional tuning:**
- `CREDENTIAL_CLEANUP_INTERVAL_MS` — SSH credential in-memory cleanup interval (`server/credentials.ts`)
- `STALE_DEPLOY_THRESHOLD_MS` — Web UI deploy timeout detection (`server/web-ui/stale-deploy.ts`)

**Secrets location:**
- Local: `.env` file (see `.env.example`)
- CI/CD: GitHub Actions secrets (`BETTER_AUTH_SECRET`, `ENCRYPTION_KEY`, `RESEND_API_KEY`, `VPS_SSH_PRIVATE_KEY`, `DOKKU_SSH_PRIVATE_KEY`, `DATABASE_URL`, `GHCR_TOKEN`, etc. in `.github/workflows/deploy.yml`)
- VPS: `.env` file copied during deploy (`.github/workflows/deploy.yml`)
- Dokku: `dokku config:set` (`.github/workflows/deploy.yml`)

## Webhooks & Callbacks

**Incoming:**
- Better Auth routes — `GET|POST /api/auth/*` and `POST /api/auth/send-magic-link` handled by Better Auth handler (`server/app.ts`); magic-link verification/callback URLs, not third-party webhooks
- Install SSE — `GET /api/servers/:id/install/events` streams server-sent events to the dashboard (`server/app.ts`, `server/install/sse-stream.ts`)
- Web UI reverse proxy — `ALL /api/servers/:id/web-ui/proxy/*` proxies to remote Hermes Web UI over SSH tunnel (`server/web-ui.ts`)
- No inbound webhooks from Telegram, Stripe, or other external push services

**Outgoing:**
- Resend API — Magic-link email delivery (`server/lib/send-magic-link-email.ts`)
- AI provider APIs — Provider connection tests (`server/providers/connection.ts`)
- Telegram Bot API — Token validation (`server/telegram/config.ts`)
- SSH commands on managed servers — Install, deploy, health checks, Hermes API calls via `curl` over SSH (`server/telegram.ts`, `server/health-check/`, `server/managed-compose-deploy.ts`)
- Docker registry pulls on remote hosts — Hermes agent and Web UI images (`server/constants.ts`, `server/compose-deploy-ssh.ts`)
- Google Fonts CDN — Font loading in browser (`src/styles.css`)

---

*Integration audit: 2026-06-06*
