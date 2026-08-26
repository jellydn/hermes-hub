# External Integrations

**Analysis Date:** 2026-08-25

## APIs & External Services

**AI Providers:**
- OpenAI - `https://api.openai.com/v1` - LLM API for chat completions
- Anthropic - `https://api.anthropic.com` - Claude API for chat completions
- OpenRouter - `https://openrouter.ai/api/v1` - Multi-model router
- Ollama - `http://localhost:11434` - Local LLM inference
- DeepSeek - `https://api.deepseek.com/v1` - DeepSeek API
- Command Code - `https://api.commandcode.ai` - Go-plan proxy translation
- Custom - User-configurable endpoints

**Email Service:**
- Resend - `https://api.resend.com` - Magic-link email delivery
- Auth: `RESEND_API_KEY` env var

**GitHub:**
- GitHub API - PR management, secrets, workflow dispatch
- Auth: GitHub CLI (`gh`) authentication

## Data Storage

**Primary Database:**
- PostgreSQL 17
- Connection: `DATABASE_URL` env var
- Client: Drizzle ORM (`drizzle-orm` 0.45.x)
- Schema: `server/db/schema.ts`

**Tables:**
- `servers` - Managed VPS records with encrypted credentials
- `install_events` - Deployment progress and history
- `audit_logs` - Action audit trail
- `ai_providers` - Encrypted AI provider credentials
- `telegram_configs` - Encrypted Telegram bot credentials
- `mcp_servers` - MCP server configurations
- `agent_skills` - Agent skill definitions
- `user`, `session`, `account`, `verification` - Better Auth tables

**File Storage:**
- Local filesystem only (no cloud storage)

**Caching:**
- In-memory only (dashboard metrics, session credentials)

## Authentication & Identity

**Auth Provider:**
- Better Auth 1.6.x (magic-link flow only)
- Implementation: Custom integration with Drizzle adapter
- Session storage: PostgreSQL via `session` table
- Token verification: `/api/auth/verify-magic-link`

**SSH Authentication:**
- VPS credentials: AES-256-GCM encrypted in `servers.encrypted_credential`
- Deployment keys: Ed25519 keys for Dokku/GitHub Actions
- Key management: `server/crypto.ts` with keyring support

## Monitoring & Observability

**Error Tracking:**
- None configured (no Sentry, LogRocket, etc.)

**Logs:**
- Pino structured logging (`server/lib/logger.ts`)
- Console output for development
- No centralized log aggregation

**Health Checks:**
- `/api/health` endpoint (returns DB connection status)

## CI/CD & Deployment

**Hosting:**
- Docker container (built via `Dockerfile`)
- Deployment targets: VPS (Docker Compose) or Dokku

**CI Pipeline:**
- GitHub Actions (`.github/workflows/ci.yml`)
- Steps: Biome lint → Typecheck → Tests → Build
- Pre-commit hooks: Biome check, typecheck, react-doctor

**Deployment Workflows:**
- `.github/workflows/deploy.yml` - Main deploy pipeline
- `.github/workflows/re-encrypt.yml` - Key rotation job
- `.github/workflows/react-doctor.yml` - React health scan

**Deployment Secrets:**
- VPS: `VPS_HOST`, `VPS_PORT`, `VPS_USER`, `VPS_SSH_KEY`
- Dokku: `DOKKU_HOST`, `DOKKU_SSH_PRIVATE_KEY`, `DOKKU_APP`, `DOKKU_SSH_KNOWN_HOSTS`

## Environment Configuration

**Required env vars:**
- `DATABASE_URL` - PostgreSQL connection string
- `ENCRYPTION_KEY` - 32-byte hex for AES-256-GCM
- `BETTER_AUTH_SECRET` - Session signing secret
- `BETTER_AUTH_URL` - Public URL for magic links

**Optional env vars:**
- `ENCRYPTION_KEY_V2` - Rotated encryption key
- `RESEND_API_KEY` - Email service API key
- `RESEND_FROM` - Sender email address
- `API_SERVER_MODEL_NAME` - Default model for Hermes deploy
- `STALE_DEPLOY_THRESHOLD_MS` - Web UI deploy timeout

**Secrets location:**
- Local: `.env.local` (not committed)
- GitHub: Actions secrets (for CI/CD)
- Dokku: `dokku config:set` (for production)

## Webhooks & Callbacks

**Incoming:**
- `/api/auth/callback` - Better Auth OAuth callback (unused currently)
- `/api/commandcode-proxy/*` - Command Code translation proxy

**Outgoing:**
- SSH commands to target VPS
- Email delivery via Resend
- AI provider API calls

## Third-Party Libraries

**Key integrations:**
- `node-ssh` - SSH client for remote execution
- `better-auth` - Authentication framework
- `drizzle-orm` - Database ORM
- `pino` - Structured logging
- `rate-limiter-flexible` - In-memory rate limiting

---

*Integration audit: 2026-08-25*
