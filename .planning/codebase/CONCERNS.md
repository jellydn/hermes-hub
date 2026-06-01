# Codebase Concerns

**Analysis Date:** 2026-06-02 (updated after concerns remediation)

## Tech Debt

**Operational state kept in process memory (not durable/shared):**

- Issue: Install stream state, session credentials, dashboard caches, and auth rate-limits are all in-memory single-process structures.
- Files: `server/install/sse-stream.ts` (lines 31, 101-119), `server/credentials.ts` (lines 8-15, 51-80), `server/dashboard.ts` (lines 27-32, 117-152, 295-326), `server/app.ts` (lines 31-36)
- Impact: State is lost on restart and not shared across instances; behavior differs per node under horizontal scale.
- Fix approach: Move these concerns to shared infra (Redis/Postgres-backed queues/state/rate-limit keys), and keep in-memory cache as optional local optimization only.

**Shell command assembly by string interpolation:**

- Issue: Remote command execution and compose file writes are built by raw string concatenation.
- Files: `server/providers.ts` (lines 593, 631), `server/telegram.ts` (line 267), `server/compose.ts` (lines 35-42)
- Impact: Quoting/escaping fragility and high maintenance cost when new env vars or model values are introduced.
- Fix approach: Use safe argument escaping/quoting helpers and write compose files via safer transfer primitives (scp/sftp/file upload APIs).
- **Update 2026-06-02:** Compose file generation is now driven by a typed object + `yaml.stringify` (`server/compose.ts`), so manual `.replace(/"/g, '\\"')` escaping is gone. Quote/colon/hash round-trip is covered by `server/compose.test.ts`. SSH command assembly in providers/telegram is still string-interpolated and is tracked under the existing "Remote command injection surface via model value" item.

## Known Bugs

**Dashboard status can remain stale after writes (until TTL expiry):**

- Symptoms: Dashboard can show old server/provider/telegram/install summary for up to cache TTL.
- Files: `server/dashboard.ts` (lines 27-32, 117-152), `server/servers.ts` (line 641 only invalidates on delete)
- Trigger: Connect/update/install/provider/telegram mutations followed by immediate `/api/dashboard/status`.
- Workaround: Wait for TTL expiry (15s metrics, 60s static) or clear cache on all mutating flows.

**Install workflow can be orphaned by process restart:**

- Symptoms: Install may stay pending/running without active worker; SSE listeners/state are reset.
- Files: `server/install.ts` (line 155 fire-and-forget `void runInstallWorkflow(...)`), `server/install/sse-stream.ts` (line 31 in-memory map)
- Trigger: Restart/crash during install execution.
- Workaround: Re-run install manually from API/UI after service is healthy.

## Security Considerations

**Remote command injection surface via model value:**

- Risk: `providerRecord.model` is interpolated into a shell command without escaping; custom providers allow arbitrary non-empty model strings.
- Files: `server/providers.ts` (line 631), `src/lib/ai-providers.ts` (lines 91-93)
- Current mitigation: Basic provider/model validation exists, but custom-model branch accepts any trimmed string.
- Recommendations: Strict allowlist regex for model IDs and safe shell escaping (or argument-array execution).

**SSH host authenticity is not explicitly verified/pinned:**

- Risk: MITM/host impersonation risk if DNS/network path is compromised.
- Files: `server/ssh.ts` (lines 58-65)
- Current mitigation: Auth credentials required and connection timeout set.
- Recommendations: Add host key verification/pinning workflow and reject unknown host keys by default.
- **Resolved 2026-06-02:** `server/ssh/connection.ts` now pins host keys via `hostHash: "sha256"` + a `hostVerifier` callback that uses `timingSafeEqual` to compare the captured key to a stored `SHA256:base64` fingerprint. `connectServer`/`updateServer` persist the fingerprint on the `servers.hostKeyFingerprint` column. `updateServer` returns `409` with `code: "host_key_mismatch"` and an audit row when the presented key rotates, and `POST /api/servers/:id/host-key/accept` lets the user accept the new key. Every SSH call site (`install/workflow.ts`, `deploy.ts`, `telegram.ts`, `telegram/pairings.ts`, `server-actions.ts`, `dashboard/metrics.ts`) threads `expectedFingerprint`. Tests: `server/ssh/connection.test.ts`, `server/servers.test.ts`.

**Supply-chain risk in install command pipeline:**

- Risk: Remote install executes `curl ... | sh` from external endpoint.
- Files: `server/install.ts` (line 45)
- Current mitigation: None in-code (no checksum/signature pinning).
- Recommendations: Use distro package repos or pinned installer artifact with checksum/signature verification.
- **Update 2026-06-02:** `install-docker` step now branches on `/etc/os-release` `ID`: Ubuntu uses `download.docker.com/linux/ubuntu`, Debian uses `download.docker.com/linux/debian`, and other distros fall back to `get.docker.com` with a stderr warning. A `command -v docker` no-op verify runs first so already-installed hosts skip the install. The pinned Hermes image version is `v0.4.1` with a placeholder digest in `server/constants.ts` (`hermesImageVersion` / `hermesImageDigest`).

## Performance Bottlenecks

**Install log persistence rewrites full log blob on every event:**

- Problem: Each event appends to in-memory lines then writes `join("\n")` back to DB.
- Files: `server/install/sse-stream.ts` (lines 179-204)
- Cause: Full-text log replacement per event causes repeated large string allocations + DB writes.
- Improvement path: Store install events as append-only rows (or chunked logs), and aggregate on read.
- **Resolved 2026-06-02:** `emitInstallEvent` no longer writes `installs.log`; the `install_events` table is now the single source of truth. `hydrateInstallEvents` reads only from `install_events`, and `getLatestServerInstallLog` joins install rows against `install_events` to assemble the log lines. `getInstallLogs` (logs page) was switched to the same `install_events` source. Tests: `server/install/sse-stream.test.ts`, `server/install.test.ts`, `server/logs.test.ts`.

**Server list action query can degrade and miss recency under load:**

- Problem: Query filters JSON field and hard-limits to 100 before per-server reduction.
- Files: `server/servers.ts` (lines 520-539, 555-575), `server/db/schema.ts` (audit log indexes at lines 194-207)
- Cause: JSON extraction in predicate + global cap can exclude latest action for some servers when action volume is high.
- Improvement path: Normalize `serverId` into first-class indexed column in `audit_logs`; query latest action per server with SQL window/group strategy.
- **Resolved 2026-06-02:** `audit_logs.serverId` is now a first-class indexed column. `server/lib/insert-audit-log.ts` enforces the `serverId` write on every audit row, replacing ad-hoc `db.insert(auditLogs).values({ details: { serverId } })` across `servers.ts`, `install.ts`, `install/workflow.ts`, `providers.ts`, `telegram.ts`, `deploy.ts`, and `server-actions.ts`. `server-detail-snapshot.getServerActionHistory` now filters by `auditLogs.serverId = ${serverId}` instead of `details ->> 'serverId'`, leveraging the new `(user_id, server_id, created_at desc)` index. Tests: `server/lib/insert-audit-log.test.ts`, `server/server-detail-snapshot.test.ts` (with a 230-row fixture).

## Fragile Areas

**Compose/environment rendering and remote heredoc writes:**

- Files: `server/compose.ts`, `server/install.ts` (line 508), `server/telegram.ts` (line 267), `server/providers.ts` (line 593)
- Why fragile: Small quoting/newline/special-char changes can break deploys or inject malformed YAML.
- Safe modification: Add golden tests for compose rendering + fuzz tests for env/model/token escaping before changing command/template logic.
- Test coverage: No direct tests for deploy command assembly in provider/telegram deploy paths.
- **Update 2026-06-02:** Compose rendering is now golden-tested (`server/compose.test.ts` + snapshot) with quote/colon/hash/backtick round-trip checks. New `server/telegram.test.ts` cases cover `deployTelegramToServer` success and failure paths and assert `deployComposeViaSsh` invocation, compose env var presence, and the single `db.transaction` that updates `telegramConfigs` and writes the `telegram.deployed` audit log.

**Cross-module credential resolution flow:**

- Files: `server/server-records.ts` (lines 48-77), `server/credentials.ts` (lines 8-80), `server/install.ts` (lines 102-113), `server/server-actions.ts` (lines 108-121)
- Why fragile: Behavior depends on session id + TTL + storeCredential flag; failures surface late in install/deploy/action flows.
- Safe modification: Centralize credential lifecycle rules and add integration tests that simulate TTL expiry/session changes.
- Test coverage: Unit tests exist for some paths, but no end-to-end lifecycle coverage across reconnect/install/deploy/action.

## Scaling Limits

**Per-instance memory/state limits:**

- Current capacity: Magic-link limit is 3 requests/5min per instance; credential TTL 30 minutes; install streams/caches/maps are unbounded per process.
- Limit: Multi-instance deployments diverge (state/rate-limit not shared) and process memory grows with unique users/servers.
- Scaling path: Externalize rate limit + install/session/cache state to shared data store and add bounded cache eviction.

**Database connection pool and query/index shape:**

- Current capacity: Default DB pool max is 5 connections.
- Limit: Burst API + SSH-driven workflows can queue on DB and expensive order-by queries rely on minimal indexes.
- Scaling path: Increase/tune pool by environment and add query-aligned indexes (e.g., `(user_id, created_at desc)`, normalized `audit_logs.server_id`).
- **Update 2026-06-02:** `audit_logs_user_created_idx` and `audit_logs_server_id_idx` are now explicitly `.desc()`-sorted in the schema, and the `audit_logs.server_id` index is exercised by `getServerActionHistory`. Drizzle migration history cleaned up; `bun run db:generate` reports no drift.

## Dependencies at Risk

**Hermes image tag pinned to `latest`:**

- Risk: Upstream image changes are implicit and may introduce breaking behavior without code changes.
- Impact: Non-deterministic deploy/rollback behavior and harder incident rollback.
- Migration plan: Pin immutable version/digest in `server/constants.ts` and roll updates intentionally.
- **Resolved 2026-06-02:** `hermesImageVersion = "v0.4.1"` and a placeholder `hermesImageDigest` are pinned in `server/constants.ts`. Real digest to be filled via `docker manifest inspect` per the rollback story in `fix.md`.

**TanStack package version skew:**

- Risk: Core/router/start/devtools packages are on different minor lines.
- Impact: Subtle runtime/build incompatibilities during upgrades.
- Migration plan: Align related TanStack packages to a tested compatible matrix in `package.json`.
- **Resolved 2026-06-02:** `react-router ^1.170.10`, `react-router-ssr-query ^1.167.1`, `react-start ^1.168.18`, `router-plugin ^1.168.13`. `react-router-ssr-query` cannot share the `1.168` minor line with siblings (no `1.168.x` is published in the registry) so it tracks the latest patch within its own line; this is a registry constraint, not a code-level blocker.

## Missing Critical Features

**Durable install job orchestration/recovery:**

- Problem: Install execution is in-process only, with no durable worker queue or resume semantics.
- Blocks: Reliable long-running installs across restarts and horizontal scaling.

**Host key trust onboarding/pinning UX:**

- Problem: No first-class flow for SSH host fingerprint verification and persistence.
- Blocks: Strong anti-MITM posture for production SSH automation.
- **Resolved 2026-06-02:** First-class flow is in place — `verifyServerConnection` returns `{ verified, hostKey }`; `connectServer` persists `hostKeyFingerprint` + `hostKeyAlgorithm`; mismatches on `updateServer` yield 409 with the old + new fingerprint and an audit row; `POST /api/servers/:id/host-key/accept` rotates the stored fingerprint with another audit row. Frontend can surface the 409 response to drive a "Trust this new host key" UX.

## Test Coverage Gaps

**Provider deploy command hardening scenarios:**

- What's not tested: `deployProviderToHermes` command construction/escaping and model injection edge cases.
- Files: `server/providers.ts` (deploy logic), `server/providers.test.ts` (covers config/test request + env mapping only)
- Risk: Command-injection or broken deploy scripts can ship unnoticed.
- Priority: High

**Telegram deploy/test SSH execution paths:**

- What's not tested: Deploy-to-server compose write/restart and SSH `curl` command execution path for chat test.
- Files: `server/telegram.ts` (lines 190-491), `server/telegram.test.ts` (only connect/disconnect cases)
- Risk: Runtime failures in production-only SSH flows are not caught in CI.
- Priority: High
- **Update 2026-06-02:** `server/telegram.test.ts` now covers `deployTelegramToServer` success path (asserts `deployComposeViaSsh` invocation, compose env vars present, single `db.transaction` for audit + state set) and failure path (asserts the `telegram.deploy.failed` audit row is written and the deploy state is not persisted).

---

_Concerns audit: 2026-06-02_
