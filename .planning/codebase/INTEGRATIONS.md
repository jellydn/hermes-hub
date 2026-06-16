# External Integrations

## Database

| Service | Usage | Environment |
|---------|-------|-------------|
| **PostgreSQL 17** | Primary application database | Dev via `compose.yaml`; production via VPS/Dokku Postgres |
| **Drizzle ORM** | Type-safe query builder and migration tool | Direct dependency |
| **Drizzle Kit** | Migration generation | devDependency |

Connection string: `DATABASE_URL` env var (required).

## Authentication

| Service | Usage | Integration |
|---------|-------|-------------|
| **Better Auth** | Magic link authentication | `server/auth.ts` — lazy singleton with `getAuth()` |
| **Resend** | Transactional email for magic links | `server/lib/send-magic-link-email.ts` via `RESEND_API_KEY` env var |
| **Mailpit** | Dev email catch-all (SMTP :1025, Web UI :8025) | `compose.yaml` service |

## Infrastructure & Deployment

| Service | Usage | Details |
|---------|-------|---------|
| **GitHub Container Registry (GHCR)** | Docker image registry | Images pushed during CI/CD Deploy workflow |
| **VPS (Docker Compose)** | Primary deployment target | SSH-based deployment with `docker compose` |
| **Dokku** | Secondary deployment target | `git push dokku HEAD:master` pattern |
| **Docker** | Containerization | Multi-stage build (Bun build → Node.js runtime) |

## CI/CD

| Pipeline | Trigger | Actions |
|----------|---------|---------|
| **CI** (`ci.yml`) | Push to main, PR | Biome check → typecheck → test → build |
| **Deploy** (`deploy.yml`) | Push to main (or manual) | Build image → Push to GHCR → Deploy to VPS/Dokku |
| **React Doctor** (`react-doctor.yml`) | PR, push to main | Code quality scan, health score comment |

## AI & Communication

| Service | Usage | Integration |
|---------|-------|-------------|
| **Telegram Bot** | Server management, runtime commands | `server/telegram/` — pairing, model access, deploy |
| **OpenAI Codex** | AI provider integration | `server/providers/codex-auth/` — OAuth flow |
| **ChatGPT OAuth** | OpenAI authentication | Provider subscription management |
| **Xiaomi MiMo** | Token Plan subscription access | `server/providers/subscription-records.ts` |
| **Various AI Providers** | Model access management | `server/providers/` — unified provider interface |

## Server Management

| Service | Usage | Integration |
|---------|-------|-------------|
| **SSH (node-ssh)** | Remote server access | `server/ssh/` — connection pool, key management |
| **Hermes Runtime** | Agent deployment on remote servers | `server/hermes/` — deploy context, auth, MCP config, persona |
| **Health Checks** | Server monitoring | `server/health-check/` — periodic checks, command execution |
| **Web UI Proxy** | SSH-based TCP proxy for web interfaces | `server/web-ui/` — proxy, deploy, records, SSH pool |

## Security & Encryption

| Service | Usage | Integration |
|---------|-------|-------------|
| **AES-256-GCM** | Credential encryption | `server/crypto.ts` — `ENCRYPTION_KEY` env var (hex-decoded to 32 bytes) |
| **HTTPS Enforcement** | Production security | `server/request-guards.ts` — `requireHttps()` middleware |

## Monitoring & Observability

| Service | Usage | Integration |
|---------|-------|-------------|
| **Dashboard** | Server metrics aggregation | `server/dashboard/` — metrics, records |
| **Audit Logs** | Action history tracking | `server/audit-log-actions.ts`, database `audit_logs` table |
| **Install Events** | Server install progress tracking | `server/install/` — SSE stream, event records, workflow orchestration |
