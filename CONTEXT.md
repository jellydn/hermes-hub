# CONTEXT.md — HermesHub Glossary

## Terms

**Quick Win**: A small, self-contained fix (under ~15 minutes) that has high impact on security, correctness, or performance. Chosen as the first pass over codebase concerns.

**Lazy Failure**: When a required secret or env var is missing, throw at request time rather than module load time. Lets non-dependent routes still serve while making the failure explicit and logged. Consistent with the project's convention of lazy auth wiring.

**Session Credential**: An SSH password or private key held in process memory (not the database) for the duration of an active VPS operation. Expires after 30 minutes of inactivity via TTL eviction. Renamed from "ephemeral credential" — the old name implied short-lived, but without TTL they were actually immortal until process restart.

**Stored Credential**: An SSH password or private key encrypted at rest in the database via AES-256-GCM. Persists indefinitely across sessions. The complement to session credentials.

**Bot Username**: The Telegram bot's display name (e.g., `my_hermes_bot`). Stored in `telegram_configs.bot_username` (renamed from `chat_id`). Used only for display in the dashboard — the bot's `botToken` is sufficient for message delivery via the Telegram API; no separate numeric chat ID is needed.

**Client IP**: The IP address recorded in audit logs for accountability. Extracted via a shared `getClientIp(context)` helper that reads the rightmost entry from `x-forwarded-for` (standard convention behind a single reverse proxy). Configurable via `TRUSTED_PROXY_COUNT` env var for multi-proxy setups. Never reads `x-forwarded-for` raw — always goes through the helper.

**Migration Reset**: The project is pre-production (no live databases), so all existing Drizzle migration files and the journal are deleted and regenerated as a single clean `0001` migration from the current schema. No data loss risk.

**Magic Link Email**: Delivered via Resend when `RESEND_API_KEY` is set. In development (no API key), the magic link URL is logged to console. The `sendMagicLink` callback delegates to a `sendMagicLinkEmail()` function that resolves the transport at call time — no provider is wired at module load, consistent with lazy failure.

**Auth Route Handling**: Better Auth requests are handled entirely by the catch-all `GET/POST /api/auth/*` route with a `hasDatabaseUrl()` guard. No explicit per-endpoint rewrites are needed — the library routes its own paths internally.

**DB Pool**: Connection pool size of 5 (configurable via `DB_POOL_MAX` env var, default 5). Enough for a single-user self-hosted deployment: dashboard queries, SSE stream, and auth running concurrently.

**SSE Timeout**: Install progress streams close after 90 seconds of no data (idle timeout). Heartbeat events (SSE comment `:` lines) are sent every 30 seconds during active installs, so the timeout only triggers when both the client is gone and the install is idle.
