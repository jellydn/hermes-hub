# External Integrations

**Analysis Date:** 2026-05-31

## APIs & External Services

**AI Providers:**
- OpenAI Models API - validate provider API key/connectivity (`server/providers.ts`)
- SDK/Client: native `fetch` in server handlers (`server/providers.ts`)
- Auth: user-provided key stored encrypted (`server/providers.ts`, `server/crypto.ts`, `server/db/schema.ts`)

**AI Providers:**
- Anthropic Models API - validate Anthropic key/connectivity (`server/providers.ts`)
- SDK/Client: native `fetch` (`server/providers.ts`)
- Auth: user-provided key stored encrypted (`server/providers.ts`, `server/db/schema.ts`)

**AI Providers:**
- OpenRouter API - validate OpenRouter key/connectivity (`server/providers.ts`)
- SDK/Client: native `fetch` (`server/providers.ts`)
- Auth: user-provided key stored encrypted (`server/providers.ts`, `server/db/schema.ts`)

**AI Providers:**
- Ollama/custom OpenAI-compatible endpoint - `/models` probe against configured base URL (`src/lib/ai-providers.ts`, `server/providers.ts`)
- SDK/Client: native `fetch` (`server/providers.ts`)
- Auth: optional bearer key + base URL from user config, persisted encrypted (`server/providers.ts`, `server/db/schema.ts`)

**Email Delivery:**
- Resend API - send Better Auth magic-link emails (`server/lib/send-magic-link-email.ts`, `server/auth.ts`)
- SDK/Client: native `fetch` (`server/lib/send-magic-link-email.ts`)
- Auth: `RESEND_API_KEY` (+ optional `RESEND_FROM`) (`.env.example`, `compose.yaml`, `.github/workflows/deploy.yml`)

**Messaging:**
- Telegram Bot API - bot token verification (`getMe`) and connect flow (`server/telegram.ts`)
- SDK/Client: native `fetch` (`server/telegram.ts`)
- Auth: user-supplied bot token, encrypted at rest (`server/telegram.ts`, `server/db/schema.ts`, `server/crypto.ts`)

**Remote Infra Control:**
- SSH to user VPS for install/deploy/restart/update/rollback (`server/ssh.ts`, `server/install.ts`, `server/server-actions.ts`, `server/telegram.ts`, `server/providers.ts`)
- SDK/Client: `node-ssh` (`package.json`, `server/ssh.ts`)
- Auth: stored encrypted SSH credential or ephemeral session credential (`server/server-records.ts`, `server/credentials.ts`, `server/db/schema.ts`)

## Data Storage

**Databases:**
- PostgreSQL (primary relational store for auth, servers, installs, providers, telegram config, audit logs) (`server/db/schema.ts`, `compose.yaml`)
- Connection: `DATABASE_URL` (`.env.example`, `server/db/index.ts`, `drizzle.config.ts`)
- Client: `drizzle-orm` + `postgres` (`package.json`, `server/db/index.ts`)

**File Storage:**
- Local filesystem only for built static assets and deployment artifacts; no external object storage integration (`scripts/start-production.mjs`, `Dockerfile`)

**Caching:**
- No external cache service; uses in-memory stores for rate limiting and ephemeral credentials (`server/app.ts`, `server/credentials.ts`)

## Authentication & Identity

**Auth Provider:**
- Better Auth (magic-link passwordless auth) (`server/auth.ts`, `server/app.ts`)
- Implementation: Better Auth + Drizzle adapter + Postgres-backed session/user tables + magic-link email sender (`server/auth.ts`, `server/db/schema.ts`, `server/lib/send-magic-link-email.ts`)

## Monitoring & Observability

**Error Tracking:**
- None (no Sentry/Datadog/etc. integration found) (`package.json`, `server/**/*`)

**Logs:**
- Application-level logging via console + persisted operational/audit/install logs in Postgres (`server/lib/send-magic-link-email.ts`, `server/install.ts`, `server/server-actions.ts`, `server/db/schema.ts`)

## CI/CD & Deployment

**Hosting:**
- Self-hosted VPS via Docker Compose and optional Dokku deployment path (`.github/workflows/deploy.yml`, `compose.yaml`, `Dockerfile`)

**CI Pipeline:**
- GitHub Actions (validate + build + deploy workflows) (`.github/workflows/ci.yml`, `.github/workflows/deploy.yml`)
- Image registry integration: GitHub Container Registry (GHCR) (`.github/workflows/deploy.yml`)

## Environment Configuration

**Required env vars:**
- Core app/runtime: `DATABASE_URL`, `ENCRYPTION_KEY`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` (`.env.example`, `server/auth.ts`, `server/crypto.ts`, `server/db/index.ts`)
- Integration/runtime tuning: `RESEND_API_KEY`, `RESEND_FROM`, `TRUSTED_PROXY_COUNT`, `DB_POOL_MAX`, `PORT`, `HOST` (`server/lib/send-magic-link-email.ts`, `server/lib/get-client-ip.ts`, `server/db/index.ts`, `scripts/start-production.mjs`, `compose.yaml`)

**Secrets location:**
- Local development: `.env` values loaded from `.env.example` template (`.env.example`)
- CI/CD deployment: GitHub Actions Secrets/Variables (`.github/workflows/deploy.yml`)
- User-supplied provider keys, Telegram bot token, and SSH credentials encrypted before DB persistence (`server/crypto.ts`, `server/providers.ts`, `server/telegram.ts`, `server/server-records.ts`)

## Webhooks & Callbacks

**Incoming:**
- No third-party webhook receiver endpoints detected; API is user/client initiated (`server/app.ts`)
- Auth callback-style routes are internal Better Auth handlers (`/api/auth/*`) rather than external webhook processors (`server/app.ts`, `server/auth.ts`)

**Outgoing:**
- `https://api.resend.com/emails` (magic-link delivery) (`server/lib/send-magic-link-email.ts`)
- `https://api.telegram.org/bot.../getMe` (bot token verification) (`server/telegram.ts`)
- `https://api.openai.com/v1/models`, `https://api.anthropic.com/v1/models`, `https://openrouter.ai/api/v1/models`, and configurable custom base URL `/models` checks (`server/providers.ts`, `src/lib/ai-providers.ts`)
- SSH-executed Docker/CLI commands on user VPS for Hermes deployment/operations (`server/install.ts`, `server/server-actions.ts`, `server/telegram.ts`, `server/providers.ts`)

---

*Integration audit: 2026-05-31*

