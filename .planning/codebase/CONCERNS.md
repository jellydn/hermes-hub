# Codebase Concerns

**Analysis Date:** 2026-05-31

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

**Supply-chain risk in install command pipeline:**
- Risk: Remote install executes `curl ... | sh` from external endpoint.
- Files: `server/install.ts` (line 45)
- Current mitigation: None in-code (no checksum/signature pinning).
- Recommendations: Use distro package repos or pinned installer artifact with checksum/signature verification.

## Performance Bottlenecks

**Install log persistence rewrites full log blob on every event:**
- Problem: Each event appends to in-memory lines then writes `join("\n")` back to DB.
- Files: `server/install/sse-stream.ts` (lines 179-204)
- Cause: Full-text log replacement per event causes repeated large string allocations + DB writes.
- Improvement path: Store install events as append-only rows (or chunked logs), and aggregate on read.

**Server list action query can degrade and miss recency under load:**
- Problem: Query filters JSON field and hard-limits to 100 before per-server reduction.
- Files: `server/servers.ts` (lines 520-539, 555-575), `server/db/schema.ts` (audit log indexes at lines 194-207)
- Cause: JSON extraction in predicate + global cap can exclude latest action for some servers when action volume is high.
- Improvement path: Normalize `serverId` into first-class indexed column in `audit_logs`; query latest action per server with SQL window/group strategy.

## Fragile Areas

**Compose/environment rendering and remote heredoc writes:**
- Files: `server/compose.ts`, `server/install.ts` (line 508), `server/telegram.ts` (line 267), `server/providers.ts` (line 593)
- Why fragile: Small quoting/newline/special-char changes can break deploys or inject malformed YAML.
- Safe modification: Add golden tests for compose rendering + fuzz tests for env/model/token escaping before changing command/template logic.
- Test coverage: No direct tests for deploy command assembly in provider/telegram deploy paths.

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

## Dependencies at Risk

**Hermes image tag pinned to `latest`:**
- Risk: Upstream image changes are implicit and may introduce breaking behavior without code changes.
- Impact: Non-deterministic deploy/rollback behavior and harder incident rollback.
- Migration plan: Pin immutable version/digest in `server/constants.ts` and roll updates intentionally.

**TanStack package version skew:**
- Risk: Core/router/start/devtools packages are on different minor lines.
- Impact: Subtle runtime/build incompatibilities during upgrades.
- Migration plan: Align related TanStack packages to a tested compatible matrix in `package.json`.

## Missing Critical Features

**Durable install job orchestration/recovery:**
- Problem: Install execution is in-process only, with no durable worker queue or resume semantics.
- Blocks: Reliable long-running installs across restarts and horizontal scaling.

**Host key trust onboarding/pinning UX:**
- Problem: No first-class flow for SSH host fingerprint verification and persistence.
- Blocks: Strong anti-MITM posture for production SSH automation.

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

---

*Concerns audit: 2026-05-31*
