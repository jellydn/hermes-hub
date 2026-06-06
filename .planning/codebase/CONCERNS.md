# Codebase Concerns

**Analysis Date:** 2026-06-06

## Tech Debt

**Server detail page bypasses route loader pattern:**
- Issue: `ServerDetailPage` fetches `/api/servers/:id` client-side via `useMountEffect` instead of a `createServerFn` loader like other dashboard pages.
- Files: `src/routes/servers.$id.tsx`, `src/features/servers/server-detail-page.tsx`
- Impact: Extra client round-trip, no SSR snapshot, inconsistent data-loading pattern across routes, harder to test at route level.
- Fix approach: Add a route loader mirroring `dashboard.tsx` / `logs.tsx`; keep `useMountEffect` only if intentional refresh is needed.

**Dual rollback-target resolution paths:**
- Issue: UI rollback sends `detail.rollbackTarget` from audit history (`getRollbackTargetFromHistory`), but the server fallback in `runServerAction` reads `installs.version` via `getRollbackTarget()` — not audit history. AGENTS.md documents `request targetVersion -> latest installs.version -> "latest"`, omitting the UI's audit-history source.
- Files: `server/server-actions.ts`, `server/server-detail-snapshot.ts`, `src/features/servers/use-server-actions.ts`, `AGENTS.md`
- Impact: UI-displayed rollback target and server-side auto-resolution can disagree when `installs.version` and audit `imageRef` diverge.
- Fix approach: Unify on one resolver (e.g. `targetVersion ?? auditHistoryImageRef ?? installs.version ?? "latest"`) and add an integration test for the full chain.

**Install version always forced to `"latest"`:**
- Issue: `emitInstallEvent` and `upsertInstallRecord` hardcode `version: "latest"` on every install progress write and retry reset.
- Files: `server/install/sse-stream.ts`, `server/install/records.ts`
- Impact: Rollback fallback via `installs.version` loses meaningful version tags after install or retry; version tracking is coarse.
- Fix approach: Preserve existing version on retry unless install succeeds; set version from pulled image tag on completion.

**Large/complex modules:**
- Issue: Several files mix orchestration, UI, and infrastructure in single modules (>350 lines).
- Files: `server/servers.ts` (564 lines), `src/features/dashboard/status-overview.tsx` (608 lines), `server/hermes/runtime.ts` (380 lines), `server/telegram.ts` (462 lines), `src/features/servers/install-progress.tsx` (375 lines)
- Impact: Higher merge conflict risk, harder to reason about change blast radius.
- Fix approach: Extract SSH route handlers from `servers.ts`, split status-overview into hook + presentational cards, keep extracting runtime command builders.

**Generated route tree:**
- Issue: `src/routeTree.gen.ts` is auto-generated and excluded from Biome checks.
- Files: `src/routeTree.gen.ts`, `biome.json`, `AGENTS.md`
- Impact: Manual edits are overwritten; tooling must respect exclusions.
- Fix approach: Never edit by hand; regenerate via TanStack Router after route changes.

## Known Bugs

**Install SSE UI claims auto-reconnect but does not reconnect:**
- Symptoms: Banner says "HermesHub will reconnect when the browser can reach the server again" on stream drop, but `onerror` only sets `connectionState` to `"error"` — no retry/backoff loop.
- Files: `src/features/servers/install-progress.tsx`
- Trigger: Network blip or server idle-timeout (90s) during a running install.
- Workaround: User must refresh the page or click Retry Install.

**Rollback UI target can disagree with server auto-resolution:**
- Symptoms: Dashboard shows one rollback target from audit history while a rollback with no explicit `targetVersion` uses `installs.version` on the server.
- Files: `server/server-detail-snapshot.ts`, `server/server-actions.ts`, `src/features/servers/use-server-actions.ts`
- Trigger: User updates/rolls back, then reinstalls (resets version to `"latest"`), but audit history still shows prior `imageRef`.
- Workaround: Pass explicit `targetVersion` (UI already does when `rollbackTarget` is set).

## Security Considerations

**HTTPS guard depends on trusted reverse proxy:**
- Risk: `requireHttps()` trusts `x-forwarded-proto` or URL scheme; spoofed headers on a pass-through CDN could bypass the guard.
- Files: `server/app.ts`
- Current mitigation: Documented deployment assumption (single TLS-terminating proxy that overwrites headers); returns 426 on plaintext in production; uses `globalThis.process.env.NODE_ENV` to avoid Vite tree-shaking the guard away.
- Recommendations: Document required proxy config in deployment guide; consider rejecting requests when `x-forwarded-proto` is absent in production unless direct HTTPS.

**Mutating routes missing `httpsMiddleware`:**
- Risk: `POST /api/logs/clear` and `POST /api/telegram/disconnect` mutate state without HTTPS enforcement in production.
- Files: `server/app.ts`, `server/logs.ts`, `server/telegram.ts`
- Current mitigation: Session auth still required; no credential bodies on these endpoints.
- Recommendations: Apply `httpsMiddleware` consistently to all mutating routes for defense in depth.

**SSH session credentials held in process memory:**
- Risk: Passwords/private keys stored plaintext in a module-level `Map` for up to 30 minutes.
- Files: `server/credentials.ts`, `server/server-records.ts`
- Current mitigation: 30-minute TTL on read and periodic cleanup (`CREDENTIAL_CLEANUP_INTERVAL_MS`); not persisted to DB when `storeCredential` is false.
- Recommendations: Consider shorter TTL for high-risk deployments; zero credentials on session end if Better Auth exposes a hook.

**Development auth secret fallback:**
- Risk: Missing `BETTER_AUTH_SECRET` in development falls back to `"dev-only-better-auth-secret"`.
- Files: `server/auth.ts`
- Current mitigation: Throws in production when env vars missing.
- Recommendations: Require explicit dev secret via `.env.example`; warn on startup when using default.

**Legacy unencrypted API server keys:**
- Risk: `decryptApiServerKey` returns plaintext payloads that lack the AES-GCM structure, preserving legacy unencrypted values.
- Files: `server/crypto.ts`
- Current mitigation: New writes use `encryptSecret`; decryption fails loudly on malformed encrypted payloads.
- Recommendations: Migration script to re-encrypt legacy keys; remove plaintext fallback after migration.

**In-memory rate limiting:**
- Risk: Magic-link rate limits (`RateLimiterMemory`, 3 per 5 min per email) do not share state across processes.
- Files: `server/app.ts`
- Current mitigation: Adequate for single-instance deployment.
- Recommendations: Redis-backed limiter before horizontal scaling.

**Encryption key required at runtime:**
- Risk: Missing `ENCRYPTION_KEY` throws on first encrypt/decrypt, not at startup.
- Files: `server/crypto.ts`, `drizzle.config.ts` (no DB URL at config time — by design)
- Current mitigation: Lazy failure pattern consistent with auth.
- Recommendations: Health check could surface missing secrets before first user action.

## Performance Bottlenecks

**Dashboard status polling with SSH metrics:**
- Problem: Client polls `/api/dashboard/status` every 30s; server may SSH into VPS for cpu/memory/disk when metrics cache (15s) expires.
- Files: `src/features/dashboard/status-overview.tsx`, `server/dashboard.ts`, `server/dashboard/metrics.ts`
- Cause: Live metrics require remote `execCommand` over SSH; static data cached 60s but metrics cache is shorter.
- Improvement path: Already has exponential backoff (30s→120s, stops after 3 failures). Consider longer metrics TTL or push-based metrics from agent.

**Install log card polling during active installs:**
- Problem: Polls `/api/servers/:id/install/log` every 3s while install status is `running`, duplicating SSE on the install page.
- Files: `src/features/servers/install-log-card.tsx`, `server/install.ts`
- Cause: Server detail page uses HTTP polling for log tail; install page uses SSE separately.
- Improvement path: Share SSE snapshot or increase poll interval when install page is open.

**Telegram pairing list polling:**
- Problem: Polls pairings on a fixed interval while Telegram is deployed.
- Files: `src/features/telegram/telegram-pairing-section.tsx`
- Cause: No webhook/SSE for pairing state changes.
- Improvement path: SSE or longer interval with manual refresh; acceptable for low-frequency pairing.

**Web UI deploy status polling:**
- Problem: Client polls deploy status until terminal state.
- Files: `src/features/servers/web-ui-deploy-poll.ts`
- Cause: Deploy is async over SSH with no server-push channel.
- Improvement path: Reuse install SSE pattern or websocket for deploy progress.

**Vite dev prebundling and native SSH modules:**
- Problem: `node-ssh`, `ssh2`, `cpu-features` break Vite `optimizeDeps` if pulled into client scan.
- Files: `vite.config.ts`, `AGENTS.md`
- Cause: Native `.node` binaries in server-only dependency chain.
- Improvement path: Keep exclusions; audit imports so SSH code never enters client bundles.

## Fragile Areas

**Install events + in-memory SSE stream sync:**
- Files: `server/install/sse-stream.ts`, `server/install.ts`, `server/install/workflow.ts`, `server/install/records.ts`
- Why fragile: Two sources of truth — persisted `install_events` rows and `installStreams` Map. `emitInstallEvent` uses a transaction for DB writes but in-memory listeners are outside the transaction. `tryClaimInstallStream` is single-process only.
- Safe modification: Always update DB and stream in `emitInstallEvent`; use `runId` gating; on retry, `upsertInstallRecord` deletes old events before reset. Test both `sse-stream.test.ts` and `install-idle-timeout.test.ts`.
- Test coverage: Good unit coverage for stream helpers and idle timeout; limited multi-request concurrency tests.

**Rollback target resolution:**
- Files: `server/server-actions.ts`, `server/server-detail-snapshot.ts`, `server/hermes/runtime.ts`, `src/features/servers/use-server-actions.ts`
- Why fragile: Three inputs (request param, audit history, `installs.version`) with different consumers; `rollbackGateway` uses `sed` on remote `docker-compose.yml`.
- Safe modification: Validate tags with `isValidDockerTag` before SSH; keep transaction wrapping audit log + version update in `runServerAction`.
- Test coverage: Unit tests for explicit target, installs-table fallback, and `getRollbackTargetFromHistory`; no test for UI/server mismatch scenario.

**DB transaction boundaries:**
- Files: `server/telegram.ts`, `server/server-actions.ts`, `server/install/sse-stream.ts`, `AGENTS.md`
- Why fragile: Only three paths use transactions; other primary+audit sequences are intentionally sequential and can leave audit gaps.
- Safe modification: Wrap new multi-write paths that must stay consistent (deploy state, version tracking) in `db.transaction()`; do not wrap purely historical audit logs unless divergence is unacceptable.
- Test coverage: `server-actions.test.ts` mocks transactions; telegram deploy transaction tested in `server/telegram.test.ts`.

**Lazy auth initialization:**
- Files: `server/auth.ts`, `src/lib/auth-client.ts`
- Why fragile: Eager `getAuth()` at module scope crashes pages when `DATABASE_URL` is unset.
- Safe modification: Keep lazy `getAuth()` singleton; use `hasDatabaseUrl()` guards on auth routes.
- Test coverage: `server/app.test.ts` covers 503 when DB unavailable; `src/lib/session.test.ts` covers `requireSession` redirect.

## Scaling Limits

**Single-instance in-memory state (documented constraint):**
- Current capacity: Designed for single-process self-hosted deployment (per `CONTEXT.md`).
- Limit: Horizontal scaling breaks install SSE claims, session credentials, dashboard/metrics caches, SSH web-ui pool, deploy locks, and rate limiting.
- Scaling path: Externalize state (Redis for credentials TTL, rate limits, install pub/sub), sticky sessions for SSE, or move to DB-backed event streaming.

**In-memory Maps and Sets:**
- Files: `server/install/sse-stream.ts` (`installStreams`), `server/credentials.ts`, `server/dashboard.ts`, `server/dashboard/metrics.ts`, `server/web-ui/ssh-pool.ts`, `server/web-ui/deploy-lock.ts`, `server/app.ts` (rate limiter)
- Current capacity: One Node process, one user/session workload typical.
- Limit: Process restart evicts all ephemeral state; second instance sees empty maps.
- Scaling path: Document single-instance requirement in ops runbooks; add Redis/DB adapters per subsystem.

**PostgreSQL connection pool:**
- Files: `server/db/index.ts`
- Current capacity: Default `max: 5` connections (`DB_POOL_MAX` override).
- Limit: Concurrent SSH-heavy dashboard refreshes + install SSE + auth can contend for connections.
- Scaling path: Tune `DB_POOL_MAX`; ensure long-running work does not hold connections (current handlers release after await).

**Install SSE idle timeout:**
- Files: `server/install/sse-stream.ts`, `server/install.ts`
- Current capacity: 90s idle (`IDLE_TIMEOUT_MS`), 30s heartbeat (`HEARTBEAT_INTERVAL_MS`).
- Limit: Long silent SSH steps rely on heartbeat to stay alive; client must reopen stream after timeout.
- Scaling path: Client-side reconnect with replay (DB-backed `hydrateInstallEvents` already supports replay).

## Dependencies at Risk

**`node-ssh` / `ssh2` / `cpu-features`:**
- Risk: Native `.node` addons complicate Vite dev bundling and cross-platform builds.
- Impact: Dev server crashes if SSH imports leak into client graph.
- Migration plan: Keep `optimizeDeps.exclude` in `vite.config.ts`; strict server/client boundary.

**`rate-limiter-flexible` (in-memory store):**
- Risk: No distributed rate limiting.
- Impact: Magic-link abuse possible across instances or after restart (counter reset).
- Migration plan: Switch to `RateLimiterRedis` or similar before multi-instance deploy.

**TanStack Start + Vite 8 (bleeding-edge stack):**
- Risk: Rapid API changes in `@tanstack/react-start`, `@tanstack/react-router`, `vite@8`.
- Impact: Build/plugin breakage on upgrades.
- Migration plan: Pin versions in `package.json`; run full CI (`biome`, `typecheck`, `test`, `build`) on upgrades.

## Missing Critical Features

**Multi-instance / HA deployment:**
- Problem: No shared state layer for SSE, credentials, caches, or locks.
- Blocks: Running multiple HermesHub replicas behind a load balancer.

**Install SSE client auto-reconnect:**
- Problem: UI messaging promises reconnect; implementation does not retry EventSource.
- Blocks: Resilient install UX on flaky networks without manual refresh.

**Unified version tracking:**
- Problem: Install flow, rollback, and audit history use overlapping but inconsistent version fields.
- Blocks: Reliable one-click rollback to the actual running image tag.

## Test Coverage Gaps

**Auth module (`server/auth.ts`):**
- What's not tested: `createAuth()` production vs development branches, `getAuth()` singleton behavior, magic-link plugin wiring.
- Files: `server/auth.ts`
- Risk: Production misconfiguration (missing secrets) or dev fallback leaking into prod build.
- Priority: Medium

**Crypto helpers (`server/crypto.ts`):**
- What's not tested: `encryptSecret`/`decryptSecret` round-trip, legacy plaintext fallback in `decryptApiServerKey`.
- Files: `server/crypto.ts`
- Risk: Encryption regressions or silent legacy plaintext reads.
- Priority: High

**Server records / credential resolution (`server/server-records.ts`):**
- What's not tested: `resolveServerCredential`, `resolveServerSshConfigOrError` edge cases (expired session cred, missing encrypted blob).
- Files: `server/server-records.ts`
- Risk: SSH operations fail opaquely or with wrong error messages.
- Priority: High

**Request guards (`server/request-guards.ts`):**
- What's not tested: `requireOwnedServer`, `requireOwnedServerSsh` helper paths.
- Files: `server/request-guards.ts`
- Risk: Authorization gaps on new routes that skip guards.
- Priority: Medium

**Route files (`src/routes/`):**
- What's not tested: No `*.test.ts` under `src/routes/`; loaders and `beforeLoad` auth redirects untested at route level.
- Files: `src/routes/*.tsx`
- Risk: Route wiring regressions (e.g. missing `requireSession`).
- Priority: Medium

**Server detail page client fetch (`server-detail-page.tsx`):**
- What's not tested: Mount fetch, error states, loading skeleton integration.
- Files: `src/features/servers/server-detail-page.tsx`
- Risk: Broken server detail UX without test signal (component tests cover `server-detail.tsx` but not the page wrapper).
- Priority: Medium

**Install log card polling (`install-log-card.tsx`):**
- What's not tested: 3s polling lifecycle, expand/collapse fetch behavior.
- Files: `src/features/servers/install-log-card.tsx`
- Risk: Poll leaks or duplicate fetch storms during running installs.
- Priority: Low

**Rollback full fallback chain integration:**
- What's not tested: End-to-end `param → audit history → installs.version → "latest"` in `runServerAction` (CONTEXT.md notes this gap).
- Files: `server/server-actions.ts`, `server/server-actions.test.ts`
- Risk: Wrong image rolled back when intermediate sources disagree.
- Priority: High

**E2E / browser tests:**
- What's not tested: No Playwright/Cypress suite; SSE and cookie auth flows only partially covered by unit/component tests.
- Files: N/A (gap)
- Risk: Integration failures between TanStack Start SSR, Hono API, and browser cookies.
- Priority: Medium

---

*Concerns audit: 2026-06-06*
