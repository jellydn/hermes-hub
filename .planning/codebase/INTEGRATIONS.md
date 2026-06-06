# External Integrations

## Overview
HermesHub integrates with multiple external services and APIs for authentication, infrastructure management, AI providers, and messaging. All credential storage uses AES-256-GCM encryption at rest.

---

## Authentication Provider

### Better Auth (Magic Link Only)
| Aspect | Details |
|--------|---------|
| **Provider** | Better Auth v1.6.11 |
| **Auth Method** | Magic link (email-based passwordless) |
| **Adapter** | @better-auth/drizzle-adapter (PostgreSQL) |
| **Session** | HttpOnly cookies via `tanstackStartCookies()` plugin |
| **Email Delivery** | Resend API (optional) or stdout logging (dev) |
| **Configuration** | `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `DATABASE_URL` |
| **Base URL** | Absolute URL required (`http://localhost:3000` dev, production domain) |
| **Rate Limiting** | 3 requests per 5 minutes per email (in-memory) |

**Flow**:
1. User submits email → POST `/api/auth/send-magic-link`
2. Better Auth generates magic link token
3. Email sent via Resend or logged to console
4. User clicks link → GET `/api/auth/callback/*` → session cookie set
5. Client uses `authClient` (better-auth/react) for session management

---

## Database

### PostgreSQL
| Aspect | Details |
|--------|---------|
| **Connection** | `DATABASE_URL` environment variable |
| **Driver** | `postgres` v3.4.9 (node-postgres compatible) |
| **ORM** | Drizzle ORM v0.45.2 |
| **Pool** | Configurable via `DB_POOL_MAX` (default 5) |
| **Health Check** | `pg_isready` in Docker Compose, `/api/health` endpoint |
| **Migrations** | `drizzle-kit migrate` (run at container startup) |
| **Schema** | 11 tables in `server/db/schema.ts` |

**Tables**:
- `user`, `session`, `account`, `verification` (Better Auth)
- `servers` — VPS connections (SSH credentials encrypted)
- `installs` + `install_events` — Hermes installation progress
- `ai_providers` — AI provider configs (API keys encrypted)
- `telegram_configs` — Bot tokens, deployment state
- `server_web_ui` — Hermes Web UI passwords (encrypted)
- `audit_logs` — Action history for dashboard/logs
- `health_checks` — Database connectivity verification

---

## Infrastructure & VPS Management

### SSH (node-ssh)
| Aspect | Details |
|--------|---------|
| **Library** | node-ssh v13.2.1 (wraps ssh2) |
| **Auth Methods** | Password or Private Key (RSA/Ed25519) |
| **Host Key Verification** | Fingerprint stored on first connect, verified on subsequent |
| **Operations** | Docker install, Compose write/pull/up, command exec, file transfer |
| **Connection Pooling** | Per-request (no persistent pool), `withSshConnection` wrapper |
| **OS Support** | Ubuntu/Debian (apt Docker repo), fallback to get.docker.com |
| **Timeout** | 120s for exec commands (Telegram test) |

**Server Connection Flow**:
1. User provides host, port, username, auth method, credential
2. `connectServer` → SSH connect → OS detection → fingerprint capture
3. Credentials encrypted (AES-256-GCM) → stored in `servers` table
4. Subsequent operations use stored encrypted credentials

### Docker / Docker Compose (Remote)
| Aspect | Details |
|--------|---------|
| **Target** | Remote VPS via SSH |
| **Image** | `nousresearch/hermes-agent:latest` (Hermes gateway) |
| **Web UI Image** | `ghcr.io/nesquena/hermes-webui:latest` |
| **Compose Management** | Generated YAML written to `~/hermes/docker-compose.yml` |
| **Services** | `hermes` (port 8642), optional `hermes-webui` (port 8787) |
| **Volumes** | `~/.hermes:/opt/data`, `~/workspace:/workspace` |
| **Commands** | `docker compose up -d`, `pull`, `exec` for config changes |

---

## AI Providers (LLM APIs)

HermesHub supports 5 provider types, all configurable via UI with encrypted API key storage.

| Provider | ID | Auth | Base URL | Models | Hermes Provider |
|----------|-----|------|----------|--------|-----------------|
| **OpenAI** | `openai` | API Key | `https://api.openai.com/v1` | gpt-4o, gpt-4o-mini, gpt-4-turbo | `openai-api` |
| **Anthropic** | `anthropic` | API Key | `https://api.anthropic.com` | claude-sonnet-4, claude-haiku-3.5 | `anthropic` |
| **OpenRouter** | `openrouter` | API Key | `https://openrouter.ai/api/v1` | Custom (user-defined) | `openrouter` |
| **Ollama** | `ollama` | None (local) | User-defined (default `http://localhost:11434/v1`) | Custom | `custom` |
| **Custom** | `custom` | API Key | User-defined (OpenAI-compatible) | Custom | `custom` |

**Environment Variables Injected into Hermes Container**:
```yaml
# OpenAI / OpenRouter / Custom (with key)
OPENAI_API_KEY=...
OPENROUTER_API_KEY=...
ANTHROPIC_API_KEY=...

# Ollama / Custom (base URL)
CUSTOM_BASE_URL=...
OPENAI_BASE_URL=...

# Vendor-specific key derivation (e.g., DEEPSEEK_API_KEY)
# Derived from baseUrl hostname

# Common
HERMES_INFERENCE_PROVIDER=openai-api|anthropic|openrouter|custom
API_SERVER_MODEL_NAME=<selected-model>
```

**Validation**:
- Model IDs: regex `^[A-Za-z0-9._:/-]{1,120}$`
- Provider-specific model allowlists (OpenAI, Anthropic)
- Custom providers accept any valid model string
- Connection test via provider's `/models` or `/chat/completions` endpoint

**Deploy Flow**:
1. User saves provider config → encrypted in `ai_providers` table
2. User clicks "Deploy Provider" → POST `/api/providers/deploy`
3. Requires: active Telegram deployment on a server with successful Hermes install
4. Compose regenerated with provider env vars → SSH deploy → `hermes config set model` inside container

---

## Telegram Bot API

| Aspect | Details |
|--------|---------|
| **API** | Telegram Bot API (HTTPS) |
| **Verification** | `getMe` endpoint to validate token |
| **Bot Token Storage** | AES-256-GCM encrypted in `telegram_configs.bot_token` |
| **Deployment** | Bot token + API server key injected into Hermes container |
| **Pairing** | Hermes generates pairing codes → user approves via HermesHub |
| **Webhook** | Not used; Hermes polls via long-polling inside container |

**Deploy Flow**:
1. User provides bot token → `connectTelegram` verifies via Telegram API
2. Token encrypted → stored with `isActive: true`
3. User clicks "Deploy" → `deployTelegramToServer`
4. Requires: server with successful Hermes install
5. Generates random `apiServerKey` (32-byte hex)
6. Builds Compose with `TELEGRAM_BOT_TOKEN` + `API_SERVER_KEY`
7. SSH deploy → persists `deployedServerId`, `deployedServerHost`, encrypted `apiServerKey`

**Test Flow**:
1. User sends test message → POST `/api/telegram/test`
2. Resolves deployed server + SSH credentials
3. `curl` to `http://localhost:8642/v1/chat/completions` inside container
4. Uses `Authorization: Bearer <apiServerKey>` + provider model
5. Returns AI response or error

---

## Email Delivery (Optional)

### Resend
| Aspect | Details |
|--------|---------|
| **Service** | Resend (resend.com) |
| **API Key** | `RESEND_API_KEY` (optional) |
| **From Address** | `RESEND_FROM` (optional, e.g., `noreply@example.com`) |
| **Fallback** | Magic links logged to stdout when not configured |
| **Integration** | `server/lib/send-magic-link-email.ts` |

**Usage**: Only for magic link emails. Development works without it.

---

## CI/CD & Deployment

### GitHub Actions
| Workflow | Triggers | Steps |
|----------|----------|-------|
| **CI** (ci.yml) | PR, push to main/master | Checkout → Bun setup → Cache → Install → Biome → Typecheck → Test → Build |
| **Deploy** (deploy.yml) | Manual dispatch (vps/dokku), push to main | Validate → Build image → Push GHCR → Deploy (VPS or Dokku) |

### VPS Deployment (Docker Compose)
| Aspect | Details |
|--------|---------|
| **Registry** | GHCR (`ghcr.io/${{ github.repository }}`) |
| **Authentication** | `GHCR_USERNAME`, `GHCR_TOKEN` secrets |
| **SSH** | `VPS_HOST`, `VPS_PORT`, `VPS_USER`, `VPS_SSH_PRIVATE_KEY` |
| **Compose** | `compose.yaml` + `.env` deployed to `VPS_DEPLOY_PATH` |
| **Migration** | `docker compose run --rm app drizzle-kit migrate` |
| **Health Check** | Waits for postgres healthy before migrate |

### Dokku Deployment
| Aspect | Details |
|--------|---------|
| **Target** | Dokku PaaS |
| **SSH** | `DOKKU_HOST`, `DOKKU_SSH_PRIVATE_KEY` |
| **Config** | `dokku config:set` with all env vars |
| **Deploy** | `git push dokku HEAD:master` |

---

## Local Development Stack

### Docker Compose (compose.yaml)
| Service | Image | Ports | Purpose |
|---------|-------|-------|---------|
| **app** | Built from Dockerfile | 3000:3000 | HermesHub application |
| **postgres** | postgres:17-alpine | 5432 | Primary database |
| **mailpit** | axllent/mailpit:latest | 1025, 8025 | Fake SMTP + web UI for magic links |

**Environment Variables** (from `.env` or GitHub secrets):
- `DATABASE_URL` (auto-constructed from postgres service)
- `ENCRYPTION_KEY`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`
- `RESEND_API_KEY`, `RESEND_FROM` (optional)
- `TRUSTED_PROXY_COUNT`, `DB_POOL_MAX`

---

## External APIs Called at Runtime

| API | Purpose | Authentication | Called From |
|-----|---------|----------------|-------------|
| **Telegram Bot API** (`api.telegram.org`) | Verify bot token, get bot info | Bot token in URL | `server/telegram/config.ts` |
| **OpenAI API** (`api.openai.com`) | Validate API key, list models | Bearer token | `server/providers/connection.ts` |
| **Anthropic API** (`api.anthropic.com`) | Validate API key | `x-api-key` header | `server/providers/connection.ts` |
| **OpenRouter API** (`openrouter.ai`) | Validate API key | Bearer token | `server/providers/connection.ts` |
| **Custom/OpenAI-compatible** | Validate API key + base URL | Varies | `server/providers/connection.ts` |
| **Resend API** (`api.resend.com`) | Send magic link emails | `RESEND_API_KEY` | `server/lib/send-magic-link-email.ts` |
| **Docker Hub / GHCR** | Pull Hermes images | None (public) / GHCR token | Remote VPS via SSH |
| **GitHub API** | CI/CD (workflow dispatch, secrets) | `GITHUB_TOKEN` | GitHub Actions |

---

## Security Considerations

| Area | Implementation |
|------|----------------|
| **Credential Encryption** | AES-256-GCM via Node `crypto` (server/crypto.ts) |
| **Key Derivation** | SHA-256 of `ENCRYPTION_KEY` env var |
| **HTTPS Enforcement** | `requireHttps()` middleware on mutating endpoints (production) |
| **Rate Limiting** | Magic link: 3/5min per email (in-memory) |
| **Host Key Verification** | SSH fingerprint stored on first connect, verified thereafter |
| **Session Cookies** | HttpOnly, Secure (production), SameSite=Lax |
| **Audit Logging** | All mutating actions logged to `audit_logs` with userId, ipAddress |
| **Ephemeral Credentials** | Optional in-memory cache (`server/credentials.ts`) for install flow |

---

## Webhook / Callback Endpoints

HermesHub does **not** expose public webhook endpoints. All external communication is outbound:
- Telegram Bot API (outbound verification)
- AI Provider APIs (outbound validation)
- Resend API (outbound email)
- SSH to managed VPS (outbound infrastructure management)

The Telegram integration uses long-polling inside the Hermes container, not webhooks.
