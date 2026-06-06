# External Integrations

Generated: 2026-06-06

## Database

| Service | Purpose | Configuration |
|---------|---------|---------------|
| PostgreSQL | Primary data store | `DATABASE_URL` env var |
| Drizzle ORM | Type-safe queries, migrations | `drizzle.config.ts`, `server/db/` |

**Tables:** `servers`, `installs`, `install_events`, `server_web_ui`, `ai_providers`, `telegram_configs`, `audit_logs`, `user`, `session`, `account`, `verification`

**Key files:** `server/db/schema.ts`, `server/db/index.ts`, `server/db/health.ts`

## Authentication

| Service | Purpose | Configuration |
|---------|---------|---------------|
| Better Auth | Passwordless magic-link auth | `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` |
| @better-auth/drizzle-adapter | Auth ↔ PostgreSQL adapter | — |
| Resend (optional) | Magic-link email delivery | `RESEND_API_KEY`, `RESEND_FROM` |

**Key file:** `server/auth.ts` (lazy initialization, DB-optional at module scope)

**Client:** `src/lib/auth-client.ts` (absolute SSR base URL from `BETTER_AUTH_URL`)

## SSH & VPS Management

| Service | Purpose | Implementation |
|---------|---------|----------------|
| node-ssh | SSH connections to user VPS | `server/ssh/` |
| Docker on VPS | Hermes agent + Web UI deployment | Via SSH commands |
| Hermes Agent | Self-hosted AI agent | `ghcr.io/hermes-agent/hermes` |

**SSH auth methods:** Password, SSH key (PEM). Credentials encrypted with AES-256-GCM at rest (`server/crypto.ts`).

**Key files:** `server/ssh/connection.ts`, `server/ssh/os.ts`, `server/ssh/` directory

## AI Providers

| Provider | API Integration | Default Model |
|----------|----------------|---------------|
| OpenAI | REST API (api.openai.com) | gpt-4o-mini |
| Anthropic | REST API (api.anthropic.com) | claude-sonnet-4-20250514 |
| OpenRouter | REST API (openrouter.ai) | openai/gpt-4o-mini |
| Ollama | Local REST API | llama3 |
| Custom/BYO | OpenAI-compatible endpoint | User-specified |

API keys encrypted with AES-256-GCM at rest. Provider config deployed to VPS via SSH (docker compose update + env vars inside container).

**Key files:** `server/providers.ts`, `server/providers/config.ts`, `src/lib/ai-providers.ts`

## Telegram

| Service | Purpose | Configuration |
|---------|---------|---------------|
| Telegram Bot API | Bot token verification (getMe), bot management | Bot token from @BotFather |

Bot token encrypted at rest. Bot deployed to VPS alongside Hermes agent. Pairing approval proxied through SSH to Hermes container.

**Key files:** `server/telegram.ts`, `src/features/telegram/`

## Monitoring

| Service | Purpose | Notes |
|---------|---------|-------|
| @sentry/node | Error tracking, performance monitoring | Configured via `@sentry/node` |

## Development Services

| Service | Purpose | Notes |
|---------|---------|-------|
| Mailpit | Fake SMTP for magic link emails | Part of `compose.yaml` (dev only) |
| PostgreSQL | Local dev database | Part of `compose.yaml` |

## Hermes Web UI

The Hermes Web UI is a separate Docker container (`ghcr.io/hermes-agent/hermes-webui`) deployed alongside the Hermes agent on the user's VPS. HermesHub proxies traffic to the Web UI via SSH tunneling through `/api/servers/:id/web-ui/proxy/`.

**Key files:** `server/web-ui/deploy.ts` (orchestration), `handlers.ts` (HTTP), `proxy-http.ts` + `ssh-forward.ts` (SSH TCP proxy), `records.ts` (persistence + stale deploy), `reachability.ts` (health probes)

**API routes** (`server/app.ts`): `GET /servers/:id/web-ui`, `POST /servers/:id/web-ui/deploy`, `GET /servers/:id/web-ui/password`, `ALL /servers/:id/web-ui/proxy/*`

## Known Integration Gaps

- Stripe, Supabase, SendGrid, AWS integrations: **Not present**
- Monitoring beyond Sentry: **Not present**
- Rate limiting beyond basic guards: **Minimal** (`server/request-guards.ts`)
