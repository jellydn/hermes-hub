# External Integrations

**Analysis Date:** 2026-05-28

## APIs & External Services
**AI Providers:**
- OpenAI - GPT-4o, GPT-4o-mini, GPT-4-turbo models for AI features
- Anthropic - Claude Sonnet 4, Claude Haiku 3.5 models for AI features
- OpenRouter - Custom model routing with user-specified model IDs
- SDK/Client: Native `fetch` calls to provider APIs (no SDK dependencies)
- Auth: User-provided API keys stored encrypted in `ai_providers` table

**Email Service:**
- Resend - Magic link email delivery for authentication
- SDK/Client: Native `fetch` to Resend HTTP API (`https://api.resend.com/emails`)
- Auth: `RESEND_API_KEY` environment variable

**Telegram:**
- Telegram Bot API - Bot configuration and verification
- SDK/Client: Native `fetch` to `https://api.telegram.org/bot{token}/{method}`
- Auth: User-provided bot tokens stored encrypted in `telegram_configs` table

## Data Storage
**Databases:**
- PostgreSQL 17 (Alpine) - Primary data store
- Connection: `DATABASE_URL` environment variable
- Client: Drizzle ORM with `postgres` (postgres.js) driver
- Connection pooling: Configurable via `DB_POOL_MAX` (default: 5)

**Schema Tables:**
- `health_checks` - System health monitoring
- `user` - Better Auth user accounts
- `session` - Better Auth sessions
- `account` - Better Auth linked accounts
- `verification` - Magic link verification tokens
- `servers` - Managed server configurations (encrypted credentials)
- `installs` - Installation tracking and logs
- `ai_providers` - Encrypted AI provider API keys
- `telegram_configs` - Encrypted Telegram bot tokens
- `audit_logs` - System audit trail

**File Storage:**
- Local filesystem only - No cloud storage integrations

**Caching:**
- None - No Redis or external caching layer

## Authentication & Identity
**Auth Provider:**
- Better Auth - Custom magic link authentication
- Implementation:
  - Lazy initialization in `server/auth.ts` (avoids crashes when `DATABASE_URL` missing)
  - Magic link plugin with configurable email delivery
  - Session management via cookies (TanStack Start integration)
  - Database adapter via `@better-auth/drizzle-adapter`

**Session Management:**
- Cookie-based sessions with `better-auth/tanstack-start` integration
- Session validation via `getAuthSession(headers)` helper
- Automatic session expiration handling

**Credential Encryption:**
- AES-256-GCM encryption for sensitive data
- `ENCRYPTION_KEY` environment variable (32-byte hex)
- Used for: server SSH credentials, AI provider API keys, Telegram bot tokens

## Monitoring & Observability
**Error Tracking:**
- None - No external error tracking service (Sentry, etc.)

**Logs:**
- Structured audit logs in `audit_logs` database table
- Actions tracked: `provider.saved`, `telegram.connected`, `telegram.disconnected`, `server.install.started`, `server.install.succeeded`, `server.install.failed`
- API request logging via Hono middleware

**Health Checks:**
- `/api/health` endpoint - Database connection status
- Docker container healthcheck - HTTP polling every 30s

## CI/CD & Deployment
**Hosting:**
- Primary: VPS with Docker Compose (self-managed)
- Alternative: Dokku (PaaS deployment)
- Container registry: GitHub Container Registry (GHCR)

**CI Pipeline:**
- GitHub Actions (`ci.yml`, `deploy.yml`)
- Pipeline stages:
  1. Code validation (Biome linting)
  2. Type checking (TypeScript)
  3. Test execution (Vitest)
  4. Production build (Vite)
  5. Docker image build and push (VPS only)
  6. Deployment (SSH to VPS or Dokku git push)

**Deployment Targets:**
- VPS: Docker image pulled from GHCR, Docker Compose orchestration
- Dokku: Git push deployment with config sync via SSH

## Environment Configuration
**Required env vars:**
- `DATABASE_URL` - PostgreSQL connection string (required for all operations)
- `ENCRYPTION_KEY` - 32-byte hex key for AES-256 credential encryption
- `BETTER_AUTH_SECRET` - Secret for Better Auth session signing
- `BETTER_AUTH_URL` - Public application URL (for magic links)

**Optional env vars:**
- `RESEND_API_KEY` - Resend email API key (required for magic links in production)
- `RESEND_FROM` - Sender email address (defaults to `HermesHub <onboarding@resend.dev>`)
- `DB_POOL_MAX` - PostgreSQL connection pool size (default: 5)
- `TRUSTED_PROXY_COUNT` - Number of trusted proxies (default: 1)
- `APP_PORT` - Application port (default: 3000)

**Secrets location:**
- Local development: `.env` file (gitignored)
- Production: Docker environment variables or Dokku config
- CI/CD: GitHub Actions secrets and variables

## Webhooks & Callbacks
**Incoming:**
- None - No webhook endpoints configured

**Outgoing:**
- Telegram Bot API calls (token verification)
- AI Provider API calls (connection testing)
- Resend email API calls (magic link delivery)

## SSH & Remote Server Management
**Integration:**
- `node-ssh` library for remote server operations
- Supported authentication methods: password, SSH key
- Operations performed:
  - Server connection verification
  - OS detection and validation (Ubuntu 22.04+, Debian 12+)
  - Docker installation and configuration
  - Hermes agent deployment via docker-compose

**Security:**
- Credentials stored encrypted in database (when `storeCredential=true`)
- Session-based ephemeral credentials (30-minute TTL) for non-stored credentials
- Automatic credential cleanup every 5 minutes

## Rate Limiting
**Implementation:**
- `rate-limiter-flexible` library for API rate limiting
- Magic link endpoint: 3 requests per 5 minutes per email
- In-memory rate limiter (no Redis dependency)

---
*Integration audit: 2026-05-28*
