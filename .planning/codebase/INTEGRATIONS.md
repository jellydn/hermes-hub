# External Integrations
**Analysis Date:** 2026-05-26

## APIs & External Services

**Telegram Bot API:**
- **Service:** `api.telegram.org`
- **Usage:** Bot token verification via `getMe` endpoint at `https://api.telegram.org/bot{token}/getMe`
- **File:** `server/telegram.ts` — `verifyTelegramToken()` function
- **Payload:** Bot token stored encrypted in `telegram_configs.bot_token` column
- **Error handling:** Distinguishes `invalid_token` (401) from `connection_failed` (network error)

**AI Provider APIs (API key validation):**
- **OpenAI:** `https://api.openai.com/v1/models` — GET with `Authorization: Bearer {key}`
- **Anthropic:** `https://api.anthropic.com/v1/models` — GET with `anthropic-version: 2023-06-01` and `x-api-key` headers
- **OpenRouter:** `https://openrouter.ai/api/v1/models` — GET with `Authorization: Bearer {key}`
- **File:** `server/providers.ts` — `createProviderTestRequest()` and `verifyProviderConnection()`
- **Validation:** Returns 200 on valid key; 401/403 treated as `invalid_api_key`; network errors as `connection_failed`

**GitHub Container Registry (Hermes agent deployment):**
- **Image:** `ghcr.io/hermes-agent/hermes:latest`
- **Usage:** Written into a `docker-compose.yml` on the target VPS during install
- **File:** `server/install.ts` — `defaultHermesImage` constant, `buildComposeWriteCommand()`

**Google Fonts (UI):**
- **Service:** `fonts.googleapis.com`
- **Usage:** Loads "Fraunces" (serif display) and "Manrope" (sans-serif body) fonts via CSS `@import`
- **File:** `src/styles.css`

## Data Storage
**Databases:** PostgreSQL relational database
- **Connection:** `DATABASE_URL` environment variable (PostgreSQL connection string)
- **Client:** `postgres` ^3.4.9 (lightweight PostgreSQL client, used via Drizzle ORM)
- **ORM:** `drizzle-orm` ^0.45.2 with `drizzle-orm/postgres-js` driver
- **Schema location:** `server/db/schema.ts`
- **Migrations:** `drizzle-kit` output to `./drizzle/` directory (SQL migration files)

**Database tables (9 app-managed + 4 auth-managed):**

| Table | Purpose | Managed By |
|-------|---------|-----------|
| `user` | Better Auth users | Better Auth (via `@better-auth/drizzle-adapter`) |
| `session` | Auth sessions | Better Auth |
| `account` | OAuth/linked accounts | Better Auth |
| `verification` | Email verifications | Better Auth |
| `servers` | Connected VPS records | App code |
| `installs` | Hermes install tracking | App code |
| `ai_providers` | AI provider configs (OpenAI/Anthropic/OpenRouter) | App code |
| `telegram_configs` | Telegram bot botTokens and chatIds | App code |
| `audit_logs` | Full action audit trail | App code |
| `health_checks` | DB health-check rows | App code |

**Encryption at rest:** AES-256-GCM via Node.js `crypto` module (`createCipheriv`/`createDecipheriv`)
- Key: `ENCRYPTION_KEY` env var, SHA-256 hashed to 32 bytes
- Used for: `servers.encrypted_credential`, `ai_providers.encrypted_api_key`, `telegram_configs.bot_token`
- File: `server/crypto.ts` — `encryptSecret()` / `decryptSecret()`

**Ephemeral credential store:** In-memory `Map<string, EphemeralCredentialRecord>` in `server/credentials.ts`
- Lives only during session lifetime
- Used when `storeCredential: false`

## Authentication & Identity
**Auth Provider:** Better Auth ^1.6.11 (self-hosted, no external SSO provider)
**Implementation:** Magic link (passwordless) authentication
- **Client:** `better-auth/react` `createAuthClient()` with `magicLinkClient()` plugin
- **Server:** `better-auth` with `magicLink()` plugin, Drizzle adapter for PostgreSQL
- **Session:** Cookie-based via `tanstackStartCookies()` plugin (enables SSR session hydration)
- **Routing:** Better Auth mounted directly in `server/app.ts`; custom `/api/auth/*` endpoints rewrites for magic-link flow
- **Base URL:** Configurable via `BETTER_AUTH_URL` (defaults to `http://localhost:3000`)
- **Secret:** `BETTER_AUTH_SECRET` env var (defaults to `dev-only-better-auth-secret` in dev)
- **Key files:**
  - `server/auth.ts` — `createAuth()`, `getAuth()`, `getAuthSession()`
  - `src/lib/auth-client.ts` — client-side `authClient` singleton
  - `src/lib/session.ts` — `getCurrentSession()` and `requireSession()` server functions

**Ephemeral vs Stored Credentials:**
- VPS SSH credentials can be stored encrypted (DB) or kept ephemeral (in-memory Map keyed by session ID)
- Ephemeral credentials survive only for the session that created the server connection
- Mechanism: `server/credentials.ts` — `storeEphemeralCredential()` and `getEphemeralCredential()`

## Monitoring & Observability
**Error Tracking:** None (no Sentry, Datadog, or similar service wired)
**Logs:**
- **Install logs:** Stored in `installs.log` (text column) per install attempt; hydrated as SSE events on reconnect
- **Audit logs:** `audit_logs` table records all user actions with timestamps, IP addresses, and JSONB details
- **Supply chain:** No external log aggregation (ELK, Loki, etc.)
- **Console:** Magic link URLs printed to `console.log()` in development (no email transport configured)

**Health Endpoint:** `GET /api/health` checks database connectivity, returns `{ status, database, timestamp }`

## CI/CD & Deployment
**Hosting:** No CI/CD pipeline detected; no hosting platform configured
- No `.github/workflows/` directory
- No Dockerfile or docker-compose.yml for the app itself
- No Wrangler/Cloudflare configuration
- No Vercel/Netlify adapter config

**Pre-commit:** `.pre-commit-config.yaml` runs:
- Whitespace/format checks (pre-commit-hooks)
- Biome lint + check (`@biomejs/biome`)
- TypeScript typecheck (`bun run typecheck`)

**Build:** `bun run build` produces `./dist/` (server bundle + client assets via Vite)

## Environment Configuration
**Required env vars (4 total):**

| Variable | Required | Description | In .env.example |
|----------|----------|-------------|-----------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string | ✅ `postgresql://user:password@localhost:5432/hermes_hub` |
| `ENCRYPTION_KEY` | Yes | 32-byte hex key for AES-256-GCM | ✅ (comment: `openssl rand -hex 32`) |
| `BETTER_AUTH_SECRET` | Yes | Session cookie signing secret | ✅ |
| `BETTER_AUTH_URL` | No (dev default) | Public URL for magic links | ✅ `http://localhost:3000` |

## Webhooks & Callbacks
**Incoming:** None. No webhook receiver endpoints are implemented.

**Outgoing:** None. There are no outgoing webhook calls to external systems.

**Event streaming (internal):** Server-Sent Events (SSE) at `GET /api/servers/:id/install/events` streams real-time install progress to the browser. Implemented via `hono/streaming` `streamSSE()`. Not an external webhook — it's client-browser SSE.

## Integration Points Summary
| Integration | Direction | Protocol | Format |
|-------------|-----------|----------|--------|
| OpenAI API | Outbound | HTTPS | JSON (API key validation) |
| Anthropic API | Outbound | HTTPS | JSON (API key validation) |
| OpenRouter API | Outbound | HTTPS | JSON (API key validation) |
| Telegram Bot API | Outbound | HTTPS | JSON (bot token verification) |
| Google Fonts | Outbound | HTTPS | CSS (font loading) |
| GitHub Container Registry | Embedded in generated compose files | Docker pull | Docker images (Hermes agent) |
| Target VPS | Outbound SSH | SSH/TCP | Remote command execution (node-ssh) |
| PostgreSQL | Persistent DB connection | PostgreSQL/TCP | SQL (Drizzle ORM) |
