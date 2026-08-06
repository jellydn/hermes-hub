# CONTEXT.md — HermesHub Glossary

## Terms

**Quick Win**: A small, self-contained fix (under ~15 minutes) that has high impact on security, correctness, or performance. Chosen as the first pass over codebase concerns.

**Lazy Failure**: When a required secret or env var is missing, throw at request time rather than module load time. Lets non-dependent routes still serve while making the failure explicit and logged. Consistent with the project's convention of lazy auth wiring.

**Session Credential**: An SSH password or private key held in process memory (not the database) for the duration of an active VPS operation. Expires after 30 minutes of inactivity via TTL eviction. Renamed from "ephemeral credential" — the old name implied short-lived, but without TTL they were actually immortal until process restart.

**Stored Credential**: An SSH password or private key encrypted at rest in the database via AES-256-GCM. Persists indefinitely across sessions. The complement to session credentials.

**Bot Username**: The Telegram bot's display name (e.g., `my_hermes_bot`). Stored in `telegram_configs.bot_username` (renamed from `chat_id`). Used only for display in the dashboard — the bot's `botToken` is sufficient for message delivery via the Telegram API; no separate numeric chat ID is needed.

**Agent Persona**: User-authored instructions that define how Hermes speaks, reasons, and presents itself. Edited on the Persona tab of `/settings`, stored in `hermes_settings.agent_persona`, and deployed to `SOUL.md` on a selected Hermes VPS with a successful install. Save persists locally; deploy writes over SSH and restarts the gateway. When multiple servers qualify, the Settings page exposes a deploy-target selector; the API accepts optional `serverId` and otherwise defaults to the most recently updated successful install. Content is trimmed markdown, capped at 20,000 characters.

**MCP Server Config**: User-defined Hermes MCP server entries for stdio or HTTP transports. Edited on the MCP Servers tab of `/settings`, stored in `mcp_servers` (names unique per user), and deployed by replacing only the `mcp_servers` key in `/root/.hermes/config.yaml` on a selected Hermes VPS with a successful install. Recommended presets pre-fill common stdio servers; advanced setup supports custom transports. Environment variables and HTTP header values are encrypted at rest; API responses expose keys with masked `valueLast4` metadata only. Blank secret values on edit preserve existing encrypted values for the active transport; switching transport clears inactive fields (stdio command/args/env vs HTTP URL/headers). Deploy merges into valid existing YAML and aborts without remote writes when the file is invalid. The settings page loader reads saved servers and eligible deploy targets server-side; there is no list GET endpoint for v1. Deleting or disabling a server changes local state until the user deploys MCP settings.

**Agent Skills**: User-managed capability instruction sets deployed to target Hermes VPS instances. Configured on the Agent Skills tab of `/settings`, stored in `agent_skills`, and synchronized to `/root/.hermes/hermeshub-agent-skills.json` and `/root/.hermes/skills/hermeshub/` over SSH. Supports Nous Hub references, custom URL references, or custom markdown content. Save persists locally; deploy writes over SSH and restarts the gateway.

**Hermes Deploy Target**: An owned VPS with a successful Hermes install, eligible for persona and MCP deploy from `/settings`. Resolved by `listHermesDeploymentTargets()`; default target is the server with the most recent successful install timestamp.

**Client IP**: The IP address recorded in audit logs for accountability. Extracted via a shared `getClientIp(context)` helper that reads the rightmost entry from `x-forwarded-for` (standard convention behind a single reverse proxy). Configurable via `TRUSTED_PROXY_COUNT` env var for multi-proxy setups. Never reads `x-forwarded-for` raw — always goes through the helper.

**Migration Reset**: The project is pre-production (no live databases), so all existing Drizzle migration files and the journal are deleted and regenerated as a single clean `0001` migration from the current schema. No data loss risk.

**Rate Limiting**: Magic link sending is rate-limited to 3 requests per 5 minutes per email using `rate-limiter-flexible` with its in-memory store. A library was chosen over hand-rolling because it handles sliding windows, retry-after headers, and edge cases (burst, reset) that are easy to get wrong.

**HTTPS Enforcement**: Credential-bearing endpoints reject plain HTTP requests in production by checking `x-forwarded-proto` or the request URL scheme. No client-side pre-encryption — the threat model is a misconfigured proxy stripping TLS, not network interception of HTTPS traffic. Keys are already encrypted at rest via AES-256-GCM.

**Legacy Plaintext API Server Key**: A `telegram_configs.api_server_key` value written before the AES-256-GCM refactor — no `iv.tag.cipher` dot structure. `decryptApiServerKey` no longer returns such plaintext verbatim: it logs a structured warning (`kind: "decrypt"`) and throws. Test-bot and provider-deploy calls therefore return HTTP 500 with "…legacy plaintext format… the operator must re-save it via /api/providers." until the provider is re-saved (which rewrites the key encrypted). Expect the failure in the meantime — silent acceptance was the bug.

**Encryption Key Rotation**: `server/crypto.ts` keeps a keyring derived from `ENCRYPTION_KEY` (legacy `v1`, always required) and optionally `ENCRYPTION_KEY_V2` (rotated key). Encrypted payloads carry a literal `vN.` wire-format prefix (`v1.iv.authTag.cipher` since the keyring landed); payloads written before versioning have no prefix and decrypt as `v1` for full backward compatibility. When `ENCRYPTION_KEY_V2` is set it becomes the **active** key — new writes use it (and record the version in `telegram_configs.encryption_key_version` / `ai_providers.encryption_key_version`) while all rows continue to decrypt because the keyring holds both versions. Setting the column default is safe on existing rows — Postgres backfills the `'v1'` default.

Rotation runbook (plan 011, `bun run re-encrypt`):
1. Set `ENCRYPTION_KEY_V2=<new>` and restart the app. New writes now use `v2`.
2. Run `bun run re-encrypt` (dry-run by default) to preview how many rows are stale — it lists row identifiers for any payload that cannot be decrypted and exits non-zero on errors without writing.
3. Run `bun run re-encrypt --apply` (or the `Re-encrypt` workflow with the `apply` input) to rewrite every stale payload to the active key inside a single transaction. Fail-fast: if any payload is undecryptable (corrupt, or a legacy plaintext `api_server_key` per plan 005), nothing is written and each `table:id:column — reason` is printed.
4. Re-run the dry-run until it reports `0 rows to re-encrypt` (idempotent).
5. Once no stale rows remain, the v1 key is dormant; unset `ENCRYPTION_KEY_V2` only after rotating its value forward (retiring v1 entirely is a future keyring change).

**Dashboard Caching**: Two-tier in-memory cache on the server. **Static data** (server info, provider, telegram, install status) cached for 60 seconds. **Live metrics** (SSH: cpu, memory, disk, uptime) cached for 15 seconds. Each tier is a module-level variable with a timestamp check. SSH only runs once per 15s expiry regardless of client count. The 30-second client poll hits cached data most of the time.

**Single-Instance Boundary**: Near-term deployments are intentionally single-instance. In-memory state (install streams, session credentials, rate limiting, dashboard caches) is accepted as a temporary constraint and must be documented as non-shared across nodes.

**OS Validation**: Ubuntu 22.04+ and Debian 12+ are officially supported and pass validation. All other Linux distributions are allowed through with a `warning` status instead of rejection. The dashboard displays a note: "This OS is not officially supported; Hermes runs via Docker but some features may not work." The validation function returns a `supportLevel: "supported" | "untested"` field alongside the OS info, so the UI can show the warning without blocking the user.

**Install Module Decomposition**: `server/install.ts` splits its SSE infrastructure into `server/install/sse-stream.ts` (stream state map, heartbeat, idle timeout, event hydration). The install workflow orchestration and step definitions stay in `server/install.ts`. This isolates ~150 lines of pure SSE plumbing from the business logic.

**SSR Auth Base URL**: During server-side rendering, `src/lib/auth-client.ts` reads `BETTER_AUTH_URL` from env vars instead of hardcoding `localhost:3000`. On the client, it uses `window.location.origin`. The env var is already enforced in production by the lazy failure pattern, so the SSR branch always has a real URL.

**Credential TTL Testing**: Read-time expiry is the real safety net, but the periodic cleanup timer is also tested. The cleanup interval is injectable (configurable via parameter or env var) so tests can set it to ~100ms and verify cleanup actually deletes expired entries — no fake timers needed.

**SSH Test Strategy**: Focus on `normalizeSshError` and credential resolution as pure unit tests, then one integration test per caller (connect, restart, dashboard metrics) mocking only `withSshConnection`. This extends the existing test pattern. No Docker-based SSH server in CI.

**SSE Test Strategy**: Test pure logic layer in `sse-stream.ts` (event emission, hydration, stream reset, status normalization) as unit tests. Add one focused integration test for idle timeout behavior using `vi.useFakeTimers()`. Heartbeat and replay are Hono's responsibility — skip those.

**Dashboard Polling**: The real bug is that 30-second polling never backs off — a dead server gets hammered indefinitely. Fix: exponential backoff (30s → 60s → 120s) with a hard cap at 3 consecutive failures, then stop polling and show a "connection lost" state with a manual retry button. Resets to 30s on successful response. Test both server error responses and client retry/backoff behavior.

**Auth Test Scope**: Two focused tests: (1) `requireSession` redirects to `/login` when no session, (2) `hasDatabaseUrl() === false` returns 503 for auth routes. No broader integration test — the 15 existing route tests cover the happy path.

**Rollback Test Scope**: Two unit tests for pure functions: `getRollbackTargetFromHistory` (returns first successful rollback image ref, returns null for empty history) and the fallback chain (mock DB, verify each level: param → history → install version → "latest"). Quick to write, covers the logic.

**Polling Backoff**: Dashboard polling uses exponential backoff with a hard cap. On consecutive errors, the interval doubles (30s → 60s → 120s). After 3 consecutive failures, polling stops entirely and a "connection lost" state is shown with a manual retry button. On a successful response, the interval resets to 30s. This is both a behavior fix and a test requirement.

**Magic Link Email**: Delivered via Resend when `RESEND_API_KEY` is set. In development (no API key), the magic link URL is logged to console. The `sendMagicLink` callback delegates to a `sendMagicLinkEmail()` function that resolves the transport at call time — no provider is wired at module load, consistent with lazy failure.

**Auth Route Handling**: Better Auth requests are handled entirely by the catch-all `GET/POST /api/auth/*` route with a `hasDatabaseUrl()` guard. No explicit per-endpoint rewrites are needed — the library routes its own paths internally.

**DB Pool**: Connection pool size of 5 (configurable via `DB_POOL_MAX` env var, default 5). Enough for a single-user self-hosted deployment: dashboard queries, SSE stream, and auth running concurrently.

**SSE Timeout**: Install progress streams close after 90 seconds of no data (idle timeout). Heartbeat events (SSE comment `:` lines) are sent every 30 seconds during active installs, so the timeout only triggers when both the client is gone and the install is idle.

**Host Key Pin**: The SHA256 host key fingerprint stored on the server record (`servers.hostKeyFingerprint`) during first-connect verification. Every subsequent SSH connection (deploy, action, health check, model switch) verifies the observed fingerprint against this stored pin to prevent MITM attacks. A missing pin (`hostKeyFingerprint: null`) triggers a recoverable `host_key_missing` error with a trust-and-retry flow — the client surfaces a `HostKeyTrustPanel` so the user can accept the observed fingerprint and continue. A mismatched pin triggers `host_key_mismatch` with both the expected and observed fingerprints for user review.

**Host Key Recovery**: The client-server flow for resolving SSH host key errors without blocking the user. When a deploy or switch endpoint encounters a host key error, it returns a **409** with a structured payload (code, serverId, serverHost, observedFingerprint, observedAlgorithm). The client renders a `HostKeyTrustPanel` that displays the fingerprint details. On user approval, the client calls `POST /api/servers/:id/host-key/accept` to store the new pin, then automatically retries the original operation. All deploy and model-switch endpoints support this flow (telegram deploy/test/model-switch, providers deploy, persona/mcp/agent-skills deploy, web-ui deploy).

**DB Transaction Boundaries**: Two deploy-path write sequences use `db.transaction()` to ensure local DB and remote Hermes state stay in sync. `deployTelegramToServer` wraps the config update (`deployedServerId`, `deployedServerHost`, `apiServerKey`) and success audit log in a single transaction — if the transaction fails, deploy state is not persisted, so a retry starts clean without a stale "deployed" record. `runServerAction` wraps the success audit log and install version update (SELECT then UPDATE on `installs`) in a single transaction — if the version update fails, the audit log also rolls back, keeping action history consistent with the tracked version. Single-write audit logs (connect, disconnect, provider save, install start) are intentionally sequential, not transactional — the audit trail is historical, and a failed audit insert doesn't corrupt the primary data.
