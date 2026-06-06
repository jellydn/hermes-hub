# Codebase Concerns

**Analysis Date:** 2026-06-02

## Tech Debt

**Legacy `installs.log` column kept for read-fallback only (Centralized):**
- Status: **Improved / Centralized**.
- Issue: `installs.log` is documented in AGENTS.md as legacy, but writers previously set `log: null` on upserts and fallback parsing was scattered.
- Files: `server/db/schema.ts:143`, `server/install/records.ts`, `server/install/legacy-log.ts`, `server/logs.ts`, `server/install.ts`
- Resolution: We dropped redundant `log: null` writes from `upsertInstallRecord` and collapsed the scattered fallback parsing logic to a single unified helper `buildLogLinesFromEvents` inside `server/install/legacy-log.ts`. Added a TODO to drop the column entirely after a backfill migration.

**Audit-log action name list duplicated in three modules (Resolved):**
- Status: **Fully Resolved**.
- Issue: The `server.action.*.succeeded|failed` enum was duplicated in multiple places.
- Files: `server/audit-log-actions.ts`, `server/logs.ts`, `server/servers/records.ts`, `server/server-detail-snapshot.ts`
- Resolution: Created `server/audit-log-actions.ts` to centralize these constants and imported them across all modules, eliminating all enum duplication.

**Route-loader pattern violated on server detail page:**
- Issue: AGENTS.md flags `src/routes/servers.$id.tsx` as the only authenticated dashboard page that fetches via `useMountEffect` instead of a `createServerFn` route loader.
- Files: `src/routes/servers.$id.tsx:28-67`
- Impact: Page renders a loader/spinner on every navigation, can't participate in TanStack Start's loader caching, and inconsistency increases cognitive load.
- Fix approach: Port the fetch into a `beforeLoad`/`loader` calling `getServerDetail` (already exists in `server/server-actions.ts`) so the page matches the rest of the dashboard.

**Vite literal replacement workaround for `NODE_ENV`:**
- Issue: `requireHttps` and `sendMagicLinkEmail` both read `globalThis.process.env.NODE_ENV` instead of `process.env.NODE_ENV` to dodge Vite's compile-time replacement that the Dockerfile bakes in.
- Files: `server/app.ts:74-84`, `server/lib/send-magic-link-email.ts:17-24`
- Impact: Fragile. Any new server-side guard that reads `process.env.NODE_ENV` directly will be tree-shaken away in the production build. Requires tribal knowledge.
- Fix approach: Centralize the runtime env read in one helper (`getRuntimeEnv()`) and forbid direct `process.env.NODE_ENV` reads in server code via lint rule or convention.

**Three independent in-memory caches with hand-rolled TTLs:**
- Issue: Each subsystem invented its own `Map<string, {data, timestamp}>` + TTL bookkeeping.
- Files: `server/dashboard.ts:31-53` (static cache, 60s), `server/dashboard/metrics.ts:14-25` (metrics cache, 15s), `server/credentials.ts:9-45` (session credentials, 30 min + cleanup interval).
- Impact: Drifting eviction logic, duplicated test setup, and no shared metric on hit/miss rate.
- Fix approach: Introduce a tiny shared TTL-cache helper or use an existing library (`lru-cache`). Unifies clear/cleanup semantics.

## Known Bugs

**`runInstallWorkflow` fire-and-forget orphans installs on process restart:**
- Symptoms: If the Node process dies between `void runInstallWorkflow(...)` and the final success/failure audit log, the `installs` row stays at `running`/`pending` forever and the in-process stream slot is lost. No supervisor or sweeper resets stale rows.
- Files: `server/install.ts:97-106`, `server/install/workflow.ts:77-156`, `server/install/sse-stream.ts:100-118`
- Trigger: Crash, deploy, or container restart during a long-running install (e.g. `apt-get install docker-ce`, `docker compose pull`).
- Workaround: Operator must manually delete or mark the row before the user can re-run; otherwise `tryClaimInstallStream` will let them through but the UI replays only the pre-crash events.

**Install SSE replay does not signal "ended" for finished installs:**
- Symptoms: When `ensureInstallStream` rehydrates from DB for a finished install, it replays events but the route resolves immediately with no terminal frame beyond the last persisted event. Clients that key off a sentinel may keep retrying.
- Files: `server/install.ts:143-154`, `server/install/sse-stream.ts:127-157`
- Trigger: Open install page after install has already succeeded/failed.
- Workaround: Front-end currently treats the last event's `status` as terminal, but this is implicit and easily broken.

## Security Considerations

**Cookie-auth POST endpoints have no CSRF protection beyond Better Auth's own routes:**
- Risk: `/api/servers/*`, `/api/providers/*`, `/api/telegram/*`, `/api/logs/clear` accept POST with the session cookie alone. No origin check, no CSRF token, no SameSite enforcement in code.
- Files: `server/app.ts:201-226`
- Current mitigation: `httpsMiddleware` (TLS only). Better Auth handles its own auth routes. Cookies presumably default to SameSite=Lax via Better Auth, but the application does not assert it.
- Recommendations: Add an `Origin`/`Sec-Fetch-Site` middleware on mutating endpoints, or explicitly require `Content-Type: application/json` plus an origin allow-list. Document the SameSite assumption.

**HTTPS guard relies on a trusted reverse proxy that overwrites `x-forwarded-proto`:**
- Risk: `requireHttps` accepts `x-forwarded-proto: https` from the request as proof of TLS. If the app process is ever exposed directly to the public Internet, an attacker can spoof the header and the guard passes.
- Files: `server/app.ts:54-103`
- Current mitigation: Comment block documents the deployment assumption.
- Recommendations: Combine the header check with `app.set('trust proxy', N)` semantics — fail closed unless an env flag (e.g. `BEHIND_TLS_PROXY=true`) is set. Or look at the socket address class to confirm the request reached a private listener.

**`getServerById` skips ownership checks:**
- Risk: Returns the full SSH credential row (`encryptedCredential`, `hostKeyFingerprint`) for any caller that knows the ID. Currently safe because callers only feed IDs sourced from the requesting user's own telegram/provider config row, but the function name does not encode that contract.
- Files: `server/server-records.ts:147-171`, callers: `server/deploy.ts:92`, `server/telegram.ts:378`, `server/telegram/pairings.ts:41`
- Current mitigation: Convention only.
- Recommendations: Rename to `getServerByIdUnsafe`, add a JSDoc warning, or require a `userId` parameter and join on `servers.userId`.

**Session credential cache survives logout:**
- Risk: `sessionCredentials` is keyed by `${serverId}:${sessionId}` with a 30-minute TTL. A logout / session revoke event does not evict the cached SSH credential; an attacker who later replays the session ID (e.g. via lingering cookie) within 30 minutes still has SSH access.
- Files: `server/credentials.ts:1-80`
- Current mitigation: TTL only.
- Recommendations: Hook Better Auth's session revoke into `sessionCredentials.delete` for the matching session ID; also clear on `serverId` deletion.

**Docker install script falls back to piping `curl … | sudo sh`:**
- Risk: For non-Ubuntu/Debian hosts the install workflow runs `curl -fsSL https://get.docker.com | sudo sh` on the user's VPS.
- Files: `server/install/workflow.ts:166-192`
- Current mitigation: AGENTS.md notes OS validation in `server/ssh/os.ts`, and the apt path is preferred.
- Recommendations: Either drop the fallback entirely (and surface a clear "unsupported distro" error) or pin a Docker installer version and verify a checksum.

**Magic-link rate limiter is per-process in-memory:**
- Risk: `RateLimiterMemory` resets on each deploy and does not coordinate across instances. A horizontally scaled deployment provides no real per-email cap.
- Files: `server/app.ts:33-37`, `server/app.ts:113-141`
- Current mitigation: Single instance assumed.
- Recommendations: Swap for `RateLimiterRedis` or `RateLimiterPostgres` when scaling beyond one process; document the single-instance assumption in deployment docs.

**`decryptApiServerKey` silently accepts legacy unencrypted secrets:**
- Risk: Migration shim returns the raw payload if it doesn't look like AES-GCM (no dots).
- Files: `server/crypto.ts:56-68`
- Current mitigation: Comment marks it as legacy.
- Recommendations: Track all legacy rows with a one-off backfill migration that encrypts them, then delete the fallback branch so we cannot regress to plaintext storage.

## Performance Bottlenecks

**Dashboard metrics SSH on every uncached request:**
- Problem: 15-second cache TTL but a cache miss opens a fresh `NodeSSH` connection, runs four sequential `execCommand` calls, then closes the connection (each `withSshConnection` is one full TLS+SSH handshake).
- Files: `server/dashboard/metrics.ts:80-167`
- Cause: No persistent SSH pool. Each connection adds 100-500 ms of latency.
- Improvement path: Maintain a per-server pooled `NodeSSH` connection, or push a tiny daemon onto the host that exposes metrics over the existing API.

**Install log fetch loads all events with a coarse limit:**
- Problem: `getLatestServerInstallLog` selects every `install_events` row by `installId` (no limit) and concatenates into a single string.
- Files: `server/install.ts:273-287`
- Cause: A pathological install that emits hundreds of events causes a payload spike.
- Improvement path: Add `LIMIT INSTALL_LOG_EVENT_LIMIT_PER_INSTALL` (already used in `server/logs.ts:146`) and stream lines incrementally to the client.

**`getInstallLogs` over-fetches events for users with many installs:**
- Problem: `limit(INSTALL_LOG_EVENT_LIMIT_PER_INSTALL * installIds.length)` may pull thousands of rows before the in-memory bucketing trims them.
- Files: `server/logs.ts:136-156`
- Cause: SQL can't easily express "top-N per group" without a window-function CTE.
- Improvement path: Switch to `ROW_NUMBER() OVER (PARTITION BY install_id ORDER BY created_at)` in a CTE, or paginate per install.

## Fragile Areas

**Install events: dual-write of in-memory stream + DB rows:**
- Files: `server/install/sse-stream.ts:159-214`
- Why fragile: Every `emitInstallEvent` updates an in-memory `Map`, then atomically inserts an `install_events` row and updates `installs` inside one transaction. The in-memory state is the only thing routed to live listeners; if a worker is replaced mid-install the listener dies and the client must fall back to the `ensureInstallStream` rehydrate path. AGENTS.md explicitly warns to keep both sides in sync.
- Safe modification: Add new event fields to both the `InstallEvent` type and `install_events` schema in one PR; treat `emitInstallEvent` as the only legal writer.
- Test coverage: `server/install/sse-stream.test.ts` covers happy paths but no test asserts what happens when the listener leaks (process restart, dropped socket while the transaction is mid-flight).

**Install slot lifecycle uses `runId` as a guard token across modules:**
- Files: `server/install.ts:59-106`, `server/install/sse-stream.ts:100-125`, `server/install/sse-stream.ts:159-172`, `server/install/workflow.ts:77-156`
- Why fragile: The slot can be claimed but un-claimed via several paths (`releaseInstallStream` on DB failure, runId mismatch in `emitInstallEvent`). Comments call out the "should be impossible" branch — which is exactly the kind of branch that goes stale.
- Safe modification: Don't refactor the claim/release pairs without tracing every early-return; add a regression test that simulates a `upsertInstallRecord` failure after `tryClaimInstallStream` succeeded.

**Better Auth lazy init must stay lazy:**
- Files: `server/auth.ts:1-77`
- Why fragile: Pages crash when `DATABASE_URL` is missing if anyone moves the `betterAuth()` call to module scope. AGENTS.md flags this.
- Safe modification: Keep `getAuth()` as the only entry point; never import `authInstance` directly.

**Server-action audit history depends on the indexed `audit_logs.server_id` column:**
- Files: `server/servers/records.ts:91-115`, `server/server-detail-snapshot.ts:21-…`
- Why fragile: AGENTS.md emphasises filtering by `server_id` column (not by JSON `details.serverId`). Future writers who forget to populate the column will silently break history rendering.
- Safe modification: Make `insertAuditLog` require `serverId` (or explicit `null`) instead of accepting omission; add a Drizzle non-null constraint for the action families that always carry one.

**Telegram bot token / API server key fields are unmarked encrypted blobs:**
- Files: `server/db/schema.ts:200-218`
- Why fragile: Columns are named `bot_token` and `api_server_key`. They actually store AES-GCM payloads (`encryptSecret(...)`). A future hand-written migration or admin SQL query that treats them as plaintext will leak or corrupt data.
- Safe modification: Rename to `encrypted_bot_token` / `encrypted_api_server_key` in a migration, or add a CHECK constraint matching the `iv.tag.cipher` pattern.

## Scaling Limits

**Single-process assumption pervades the backend:**
- Current capacity: 1 Node process per environment.
- Limit: `installStreams` (`server/install/sse-stream.ts:31`), `sessionCredentials` (`server/credentials.ts:13`), `staticCache`/`metricsCache` (`server/dashboard.ts:38`, `server/dashboard/metrics.ts:21`), and `magicLinkRateLimiter` (`server/app.ts:33`) are all in-process. With two replicas, install streams attach to whichever pod the user lands on, rate limits double, and metrics may be stale per-pod.
- Scaling path: Either pin sticky sessions and document the limit, or move install events to a pub/sub channel (Postgres LISTEN/NOTIFY is on hand), credentials to an encrypted Redis, and rate limits to `RateLimiterRedis`.

**DB pool size defaults to 5 connections:**
- Current capacity: `DB_POOL_MAX` env or 5.
- Limit: All Drizzle queries plus Better Auth share the same `postgres` client.
- Files: `server/db/index.ts:14`
- Scaling path: Raise via env at deploy time; consider a separate read-only pool if dashboard reads dominate.

## Dependencies at Risk

**`node-ssh` / `ssh2` native bindings (`cpu-features`):**
- Risk: AGENTS.md notes Vite has to exclude these from `optimizeDeps` because they pull native `.node` binaries and break the dev client prebundling.
- Impact: Any addition that accidentally imports server-side SSH code from a client module breaks `bun run dev`.
- Migration plan: Keep the Vite excludes synchronised with the dep list; add a lint or CI check that fails if `node-ssh`/`ssh2` is imported from anything under `src/`.

**Better Auth `tanstack-start` integration is pre-1.0 territory:**
- Risk: Cookie/session shape changes (sessions table, magic link plugin) require schema migrations.
- Impact: `server/db/schema.ts` re-exports `user`/`session`/`account`/`verification` aliases just to match Better Auth's lookup.
- Migration plan: Pin versions; review changelog on every Better Auth bump.

## Missing Critical Features

**No installer recovery / stale-row sweeper:**
- Problem: Nothing resets `installs.status='running'` rows after a crash.
- Blocks: A user can be permanently blocked from retrying an install if the process died mid-run (see "Known Bugs" above).

**No CORS / origin allow-list configuration:**
- Problem: There is no explicit CORS middleware in `server/app.ts`. Browsers will block cross-origin requests by default, but documented allow-list semantics are missing.
- Blocks: Future browser extensions, mobile apps, or external dashboards integrating with the API.

**No audit-log retention / pruning:**
- Problem: `audit_logs` grows unbounded. `clearLogs` only deletes a handful of action names for the current user; nothing prunes by age.
- Blocks: Long-running deployments will accumulate millions of rows, slowing `audit_logs_user_created_idx` scans.

## Test Coverage Gaps

**No unit tests for `server/crypto.ts`:**
- What's not tested: AES-GCM round-trip, malformed payload handling, the legacy `decryptApiServerKey` plaintext fallback path.
- Files: `server/crypto.ts`
- Risk: Silent breakage of encrypted secrets across upgrades; the legacy fallback is exactly the path that needs a regression test before it can be removed.
- Priority: High.

**No tests for `server/deploy.ts` (provider deploy to Hermes):**
- What's not tested: End-to-end provider deploy flow, error normalisation, and re-rendering of `docker-compose.yml`.
- Files: `server/deploy.ts`
- Risk: Provider deploy regressions only surface in production.
- Priority: High.

**No tests for `server/dashboard/metrics.ts` or `server/dashboard/records.ts`:**
- What's not tested: SSH metrics command parsing (`top`, `free`, `df`, `uptime`), cache hit/miss behaviour, error paths.
- Files: `server/dashboard/metrics.ts`, `server/dashboard/records.ts`
- Risk: A subtle shell-output change on a new Ubuntu release breaks the dashboard with no warning.
- Priority: Medium.

**No tests for `server/install/records.ts` or `server/install/workflow.ts`:**
- What's not tested: `upsertInstallRecord` resets vs creates; `runInstallWorkflow` step execution order, audit-log emission on success/failure, SSH error normalisation. Only `server/install/sse-stream.test.ts` covers stream plumbing.
- Files: `server/install/records.ts`, `server/install/workflow.ts`
- Risk: Install regressions (the highest-value flow) ship undetected.
- Priority: High.

**No tests for `server/lib/send-magic-link-email.ts` or `server/lib/get-client-ip.ts`:**
- What's not tested: Production env throws when `RESEND_API_KEY` is missing; `x-forwarded-for` trimming and `TRUSTED_PROXY_COUNT` arithmetic.
- Files: `server/lib/send-magic-link-email.ts`, `server/lib/get-client-ip.ts`
- Risk: A spoofable IP audit log or a silently-broken magic-link send in production.
- Priority: Medium.

**No tests for the `server/providers/` and `server/telegram/` subdirectory helpers, or `server/server-records.ts`:**
- What's not tested: `resolveServerCredential`, `resolveServerSshConfigOrError`, `getServerById` (the unsafe-by-design fetch), `verifyTelegramToken`, pairing helpers.
- Files: `server/server-records.ts`, `server/providers/config.ts`, `server/providers/connection.ts`, `server/providers/records.ts`, `server/telegram/config.ts`, `server/telegram/pairings.ts`, `server/telegram/records.ts`
- Risk: Credential resolution is security-sensitive and untested in isolation.
- Priority: High for `server-records.ts`, Medium for the rest.

**Skipped/disabled tests:** none found (`rg "\.skip\(|\.only\(" → 0 hits`). Coverage gaps are about missing files, not silenced ones.

---

*Concerns audit: 2026-06-02*
