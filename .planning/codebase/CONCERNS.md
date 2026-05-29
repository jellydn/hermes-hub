# Codebase Concerns

**Analysis Date:** 2026-05-29

## Tech Debt

**Inconsistent server-detail data loading:**
- Issue: Every other authenticated page loads its snapshot through a route-level `createServerFn` loader; `/servers/$id` instead fetches `/api/servers/:id` from the component via `useMountEffect` (AGENTS.md flags this as the deliberate exception).
- Files: `src/routes/servers.$id.tsx`, `src/lib/use-mount-effect.ts`, `src/routes/dashboard.tsx`, `src/routes/logs.tsx`
- Impact: Server detail page renders a loading spinner on first paint, has no SSR data, and bypasses the conventional auth/data-loading pipeline. Easy to regress when the route is refactored.
- Fix approach: Migrate to a `createServerFn` loader that reuses `getServerDetailSnapshot` (already exported from `server/server-actions.ts`) and remove the manual fetch path.

**Duplicate install-progress state stores:**
- Issue: Install events are written to both an in-process `installStreams` Map *and* persisted as newline-delimited text in `installs.log`. `hydrateInstallEvents` reconstructs SSE events from log lines on reconnect.
- Files: `server/install.ts`, `server/install/sse-stream.ts`
- Impact: Schemas drift trivially — changing the log line format silently breaks SSE replay; `emitInstallEvent` overwrites the full log column on every step, so a crash mid-install yields a partial log and a "succeeded" SSE history that no longer matches the DB.
- Fix approach: Either persist structured events (jsonb column per step) and stream from the DB, or treat the log column as a write-only artifact and stream entirely from memory plus a replay-after-DB-status check.

**Duplicated Better Auth configuration:**
- Issue: `createAuth()` builds the same `betterAuth({...})` object twice (once for the dev fallback, once for production) instead of branching only on `baseURL`/`secret`.
- Files: `server/auth.ts`
- Impact: Any plugin or option change must be made in two places; trivial drift will produce different dev vs prod behavior.
- Fix approach: Compute `baseURL` and `secret` once with the dev fallbacks, then call `betterAuth(...)` once.

**README references a non-existent script:**
- Issue: `README.md` quick-start instructs `bun run db:migrate`, but `package.json` only defines `db:generate`. AGENTS.md explicitly calls this out.
- Files: `README.md`, `package.json`, `app.json`, `.github/workflows/deploy.yml`
- Impact: New developers and agents get a script-not-found error on first setup.
- Fix approach: Add a `db:migrate` script wrapping `drizzle-kit migrate` or update the README to use `bunx drizzle-kit migrate`.

**Hard-coded remote workspace and image registry:**
- Issue: Install steps and action commands assume `~/hermes/docker-compose.yml` and the image `ghcr.io/hermes-agent/hermes:<tag>` with no configurability.
- Files: `server/install.ts` (`installSteps`, `buildComposeWriteCommand`, `defaultHermesImage`), `server/server-actions.ts` (`actionCommands.rollback`)
- Impact: Self-hosted images, alternate registries, or custom install paths require code changes; rollback `sed` regex is tied to the literal `ghcr.io/hermes-agent/hermes:` prefix and silently no-ops if the user edits the compose file.
- Fix approach: Read the workspace path and registry from server-level config or env, and use `yq`/structured rewriting instead of in-place `sed`.

**Large feature modules:**
- Issue: Several components/services have grown past 500 lines mixing form state, fetch logic, and presentation.
- Files: `src/features/servers/connection-wizard.tsx` (623 lines), `src/features/dashboard/status-overview.tsx` (558), `server/server-actions.ts` (555), `server/dashboard.ts` (531), `server/install.ts` (505), `src/features/servers/server-detail.tsx` (426), `src/features/servers/install-progress.tsx` (404)
- Impact: Higher merge-conflict risk, harder to test cohesively, easy to mix concerns.
- Fix approach: Extract step-form components from the wizard, split dashboard polling into a hook, and lift install-step definitions/`getInstallCredential` out of the install module.

**Dead/odd fallback code:**
- Issue: `getSessionKey` falls back to `randomUUID()` when the session id is empty, but the only caller always passes a real session id (the auth gate ensures it), so credentials would otherwise be stored under a key that no later call could reconstruct.
- Files: `server/servers.ts:112,219`
- Impact: Misleading — implies ephemeral creds can be stored without a session, but they cannot be retrieved.
- Fix approach: Remove the fallback and type the argument as non-nullable.

## Known Bugs

**Agent summary `updatedAt` is always truthy:**
- Symptoms: When no install record exists, the fallback returns `serverRecord.status ? new Date().toISOString() : null` — `serverRecord.status` is a non-empty `text NOT NULL` column, so the ternary is dead and the timestamp is always "now".
- Files: `server/dashboard.ts` (`toAgentSummary`, final return branch)
- Trigger: Connect a server, do not run an install, load the dashboard. The agent card claims a fresh `updatedAt` even though nothing happened.
- Workaround: Treat the timestamp as advisory.

**Install slot is never explicitly released after completion:**
- Symptoms: After `runInstallWorkflow` finishes, `releaseInstallStream` is not called; the slot is only "free" because the next `tryClaimInstallStream` checks for `running`/`pending` and the final emit sets `succeeded`/`failed`. If the final `emitInstallEvent` is ever skipped (e.g. exception in the audit-log insert), `installStreams` keeps a `running`/`pending` state forever and the user can never re-trigger an install for that server.
- Files: `server/install.ts` (`runInstallWorkflow` catch block, end of try), `server/install/sse-stream.ts` (`tryClaimInstallStream`)
- Trigger: Force the post-success `auditLogs.insert` to throw (DB transient error) — slot leaks.
- Workaround: Restart the process to clear `installStreams`.

**SSE replay re-derives progress and status from the log line index:**
- Symptoms: `hydrateInstallEvents` synthesizes progress as `(index+1)/lines.length` and stamps every replayed event with the *current* install status, so a reconnecting client sees fabricated progress values and may see "succeeded" status on intermediate steps.
- Files: `server/install/sse-stream.ts` (`hydrateInstallEvents`)
- Trigger: Disconnect during an install, then reconnect.
- Workaround: None client-side; UI is tolerant but progress jumps are visible.

**Magic-link rate limiter rests on a single-process assumption:**
- Symptoms: `RateLimiterMemory` is per-process; behind multiple replicas the 3-per-5-minutes guarantee becomes "3 per replica per 5 minutes". A process restart also resets the budget.
- Files: `server/app.ts` (`magicLinkRateLimiter`)
- Trigger: Scale beyond one replica or restart the server.
- Workaround: Deploy as a single replica (matches the current Docker Compose / Dokku setup but is not documented).

## Security Considerations

**No SSH host-key verification:**
- Risk: `node-ssh`/`ssh2` default behavior accepts any host key; without an explicit `hostVerifier`/`hostHash` callback HermesHub is vulnerable to MITM on first connect and on subsequent reconnects.
- Files: `server/ssh.ts` (`withSshConnection` — `ssh.connect` call lacks `hostVerifier`, `hostHash`, or `algorithms`)
- Current mitigation: None. `requireHttps` only protects HermesHub's own ingress, not the egress SSH tunnel.
- Recommendations: Capture and pin the host fingerprint on first verify (store in `servers.osInfo` or a dedicated column), then enforce it on every subsequent connection.

**Trust boundary of `x-forwarded-proto` / `x-forwarded-for`:**
- Risk: `requireHttps` accepts the request when `x-forwarded-proto: https` is present, and `getClientIp` skips `TRUSTED_PROXY_COUNT` (default 1) rightmost hops. If the app is exposed without the assumed single TLS-terminating proxy, an attacker can forge both headers to bypass the HTTPS guard and spoof audit-log IPs.
- Files: `server/app.ts` (`requireHttps`), `server/lib/get-client-ip.ts`
- Current mitigation: Header-level doc comment in `server/app.ts` warns of pass-through CDN risk.
- Recommendations: Add a startup check or env-driven allowlist of accepted forwarded protos/IPs; reject when `NODE_ENV=production` and `TRUSTED_PROXY_COUNT` is unset.

**Weak encryption-key derivation and no rotation path:**
- Risk: `getEncryptionKey()` derives the AES-256-GCM key with a single SHA-256 over `process.env.ENCRYPTION_KEY` (no salt, no HKDF/PBKDF2). Re-keying requires re-encrypting every `encryptedCredential`, `encryptedApiKey`, and `botToken`, but no rotation tool exists.
- Files: `server/crypto.ts`
- Current mitigation: 32-byte hex key is documented; AES-256-GCM with random IV per encryption.
- Recommendations: Switch to HKDF with a stored salt per record, version the ciphertext payload (e.g. `v1.iv.tag.ct`) to enable rotation, and provide a `scripts/rotate-encryption-key.ts`.

**`disconnectTelegram` and `getServerDetail`/`getLogs` are not behind `requireHttps`:**
- Risk: Only mutating credential-bearing endpoints (`/servers/connect`, `/servers/:id/install`, `/servers/:id/actions`, `/providers`, `/providers/test`, `/telegram/connect`) call `requireHttps`. Authenticated read endpoints can still be hit over plaintext in production, leaking session cookies if the proxy mis-routes.
- Files: `server/app.ts` (route table)
- Current mitigation: Production deployments are documented to run behind HTTPS-only proxies.
- Recommendations: Apply `requireHttps` as global middleware (with explicit opt-outs for `/api/health`) rather than per-route.

**`audit_logs.details` accepts unbounded jsonb:**
- Risk: `runServerAction` and `emitInstallEvent` write arbitrary remote stdout into `audit_logs.details.output` and `installs.log`. A misbehaving or compromised VPS can return very large or malicious payloads, bloating the DB and rendering as plain text in the UI.
- Files: `server/server-actions.ts` (audit row with `output: commandOutput || null`), `server/install/sse-stream.ts` (`emitInstallEvent` updates `installs.log`), `server/install.ts` (`runInstallWorkflow` appends to `logLines`)
- Current mitigation: None.
- Recommendations: Truncate stdout/stderr (e.g. 8 KiB) before persisting and reject obviously non-UTF8 binary payloads.

**Magic-link URL logged in development:**
- Risk: `sendMagicLinkEmail` logs the URL to `console.log` when `NODE_ENV !== "production"` and `RESEND_API_KEY` is unset. If a staging deployment forgets to set both, the magic link leaks to whatever captures stdout (Docker logs, CI artifacts).
- Files: `server/lib/send-magic-link-email.ts`
- Current mitigation: Production throws when `RESEND_API_KEY` is missing.
- Recommendations: Also throw when `NODE_ENV` is anything other than `development`/`test`.

**Remote commands assume passwordless sudo:**
- Risk: All install/action commands prefix with `sudo`; if the configured SSH user lacks `NOPASSWD` sudo, commands hang or fail with a generic stderr that surfaces as "Install failed" with no actionable detail.
- Files: `server/install.ts` (`installSteps`), `server/server-actions.ts` (`actionCommands`)
- Current mitigation: None.
- Recommendations: Probe for sudo capability during `verifyServerConnection` and surface a precise error.

## Performance Bottlenecks

**Cold-cache dashboard load triggers a full SSH round-trip:**
- Problem: When `metricsCache` is empty/expired, `getVpsSummary` opens a fresh SSH connection (with `readyTimeout: 15_000`) and runs four `execCommand` calls in parallel before responding.
- Files: `server/dashboard.ts` (`getVpsSummary`, `readServerMetrics`), `server/ssh.ts` (`withSshConnection`)
- Cause: No persistent SSH session; every cache miss pays connect + auth latency.
- Improvement path: Maintain a short-lived pooled SSH connection per server, or move metrics collection to a background scheduler that refreshes the cache asynchronously.

**Audit-log filtering by `details ->> 'serverId'`:**
- Problem: `getServerActionHistory` filters via `${auditLogs.details} ->> 'serverId' = ${serverId}` with no functional or expression index on `details->>'serverId'`.
- Files: `server/server-actions.ts` (`getServerActionHistory`), `server/db/schema.ts` (`audit_logs` table — only has `audit_logs_user_id_idx`)
- Cause: JSONB key extraction defaults to a sequential scan within the user's rows.
- Improvement path: Add an expression index `CREATE INDEX ON audit_logs ((details->>'serverId'))` or denormalize `server_id` into a dedicated column.

**Whole-log rewrite on every install event:**
- Problem: `emitInstallEvent` calls `installs.update({ log: input.logLines.join("\n") })` after appending one line, rewriting the entire text column for every step.
- Files: `server/install/sse-stream.ts` (`emitInstallEvent`)
- Cause: `installs.log` is a single `text` column instead of an append-only child table.
- Improvement path: Use `installs.log = installs.log || $line` via raw SQL, or move log lines into an `install_events` table.

**`installStreams` / `sessionCredentials` Maps are unbounded:**
- Problem: `installStreams` is never pruned after a run completes (`tryClaimInstallStream` checks the status but old entries stay forever). `sessionCredentials` is only swept every 5 minutes.
- Files: `server/install/sse-stream.ts` (`installStreams`), `server/credentials.ts` (`sessionCredentials`)
- Cause: No TTL or LRU eviction on `installStreams`; per-server entries accumulate as servers are added/removed.
- Improvement path: Drop completed `installStreams` entries after a grace period (e.g. 10 minutes idle) and bound the Map size.

## Fragile Areas

**Install workflow + SSE stream coupling:**
- Files: `server/install.ts`, `server/install/sse-stream.ts`
- Why fragile: `runInstallWorkflow` mutates `state.installId` post-claim, relies on `runId` gating in `emitInstallEvent`, and shares the `logLines` array between persistence and SSE. Any reordering of the claim/upsert/emit sequence silently breaks single-flight or replay.
- Safe modification: Run the full install flow end-to-end (success + DB failure paths) under `server/install.test.ts` and `server/install/sse-stream.test.ts` before refactoring; do not move awaits across the `tryClaimInstallStream` boundary.
- Test coverage: Good for success/idle-timeout cases (`server/install.test.ts`, `server/install-idle-timeout.test.ts`, `server/install/sse-stream.test.ts`); no test exercises the audit-log-failure-after-success path or the slot-leak scenario.

**Vite optimizeDeps SSH exclusion:**
- Files: `vite.config.ts`
- Why fragile: `optimizeDeps.exclude: ["node-ssh", "ssh2", "cpu-features"]` is the only thing preventing native `.node` binaries from being scanned into the client bundle (per AGENTS.md). Importing `node-ssh` from anywhere reachable by `src/` will reintroduce the crash.
- Safe modification: Keep all SSH imports under `server/`; if a frontend file needs SSH-related types, copy them into `src/lib/` rather than importing from `server/ssh.ts`.
- Test coverage: None — failure manifests only at `bun run dev` startup.

**OS detection assumes Linux + os-release:**
- Files: `server/ssh.ts` (`parseAndValidateOs`)
- Why fragile: Any distro without `/etc/os-release`, BSDs, or hardened minimal images throw `UnsupportedOsError` immediately; the "untested" warn-and-proceed branch only fires for Linux distros older than Ubuntu 22 / Debian 12.
- Safe modification: Extend `parseAndValidateOs` with explicit test fixtures for new distros; do not narrow the regex.
- Test coverage: `server/ssh.test.ts` covers Ubuntu, Debian, non-Linux throw, but not the warn-and-proceed branch for unknown Linux distros.

**Rollback command depends on `sed` matching the literal image prefix:**
- Files: `server/server-actions.ts` (`actionCommands.rollback`)
- Why fragile: The `sed -i.bak 's|image: ghcr.io/hermes-agent/hermes:.*|...|'` regex silently does nothing if the operator edits the compose file to use a different registry/path, and Docker keeps running the old tag.
- Safe modification: Validate that the substitution actually changed the file (`grep` the new tag after `sed`) before declaring success.
- Test coverage: `server/server-actions.test.ts` mocks SSH and verifies the command string, not the remote effect.

**SSE idle timeout assumes a working heartbeat:**
- Files: `server/install.ts` (`streamServerInstallEvents`), `server/install/sse-stream.ts` (`IDLE_TIMEOUT_MS`, `HEARTBEAT_INTERVAL_MS`)
- Why fragile: 90s idle timeout is only safe because the 30s heartbeat resets it. If the heartbeat write succeeds but the client is gone, the stream stays alive for up to 90s before tearing down — and if the heartbeat ever throws asynchronously (e.g. backpressure), the cleanup path runs before the next install event lands.
- Safe modification: Tweaks to `HEARTBEAT_INTERVAL_MS`/`IDLE_TIMEOUT_MS` must keep heartbeat strictly less than idle/2 and be exercised against `server/install-idle-timeout.test.ts`.

## Scaling Limits

**Single-process in-memory state:**
- Current capacity: One Node/Bun process. `installStreams`, `sessionCredentials`, `magicLinkRateLimiter`, `staticCache`, `metricsCache` are all `Map`s scoped to the process.
- Limit: Horizontal scaling is impossible without losing install replay, ephemeral creds, rate-limit budgets, and dashboard caching. Sticky sessions would not fix install SSE because the install workflow runs on whichever replica received the POST.
- Files: `server/install/sse-stream.ts`, `server/credentials.ts`, `server/app.ts`, `server/dashboard.ts`
- Scaling path: Move install events to Postgres `LISTEN/NOTIFY` (or Redis Streams), move rate limiting to `RateLimiterPostgres`/`RateLimiterRedis`, and either drop ephemeral credentials or back them with an encrypted Redis store.

**Dashboard aggregates a single server per user:**
- Current capacity: `getLatestServer` returns only the most recently created server (`limit(1)`), and the dashboard schema (`DashboardServerSummary`) is singular.
- Limit: Users with multiple managed VPS see only one card; install/action audit history per other servers is invisible from the dashboard.
- Files: `server/dashboard.ts` (`getLatestServer`, `getDashboardStatusSnapshot`), `src/lib/dashboard-status.ts`
- Scaling path: Return an array of servers and render a grid; align metric polling with the number of connected servers.

**`audit_logs` and `installs.log` have no retention:**
- Current capacity: Unbounded — every install event rewrites the log column, every server action writes ≥3 audit rows (`started`, `succeeded|failed`, plus DB updates).
- Limit: A long-running deployment with active operators will accumulate jsonb rows indefinitely; the `LIMIT 5`/`LIMIT 20`/`LIMIT 10` reads stay fast, but table size grows without bound.
- Files: `server/db/schema.ts` (`audit_logs`, `installs`), `server/install/sse-stream.ts`, `server/server-actions.ts`, `server/logs.ts`
- Scaling path: Add a `audit_logs_created_at_idx` + a retention job (e.g. delete rows older than N days), and split install logs into a child table.

## Dependencies at Risk

**Suspicious pre-release / non-existent major versions:**
- Risk: `package.json` pins several majors that are ahead of their public stable releases — `typescript ^6.0.2`, `vite ^8.0.0`, `vitest ^4.1.5`, `lucide-react ^1.16.0`, `jsdom ^28.1.0`. These either resolve to canary builds or were typoed; a fresh `bun install` on another machine may surface very different versions than `bun.lock` resolves.
- Files: `package.json`
- Impact: CI flakiness if registry contents change; broken types/build on developer onboarding; security advisories may not apply cleanly.
- Migration plan: Audit each major against npm, downgrade or pin exact versions, and add a `engines`/`packageManager` field to lock the toolchain.

**No SDKs for AI providers — bare `fetch`:**
- Risk: `verifyProviderConnection` hits `/v1/models` directly on OpenAI, Anthropic, and OpenRouter with hand-rolled headers. API changes (e.g. Anthropic version bump from `2023-06-01`) silently break test/save flows.
- Files: `server/providers.ts` (`createProviderTestRequest`)
- Impact: Provider connectivity tests become false negatives without warning.
- Migration plan: Adopt the official SDKs (or vendor-published `fetch` wrappers) and version-pin them, or centralize the version constants and add an integration smoke test.

**Better Auth + Drizzle adapter on early-1.x major:**
- Risk: `better-auth@^1.6.11` and `@better-auth/drizzle-adapter@^1.6.11` are still pre-2.0 with a moving plugin API (`magicLink`, `tanstackStartCookies`). Caret ranges admit potentially-breaking minor bumps.
- Files: `package.json`, `server/auth.ts`
- Impact: Auth handler shape (`getAuth().handler`, `api.getSession`) is library-internal; a minor upgrade may change session payload structure used by `getAuthSession` and `requireSession`.
- Migration plan: Pin both packages to exact versions and add a smoke test that exercises `/api/auth/sign-in/magic-link` end-to-end.

**`postgres` (postgres.js) with `prepare: false`:**
- Risk: `getDb()` disables prepared statements to play nicely with pgbouncer/transaction-mode pools, but this also disables postgres.js query plan caching and forces re-parsing on every call.
- Files: `server/db/index.ts`
- Impact: Modest per-query overhead; cannot use server-side prepared statements for the hot dashboard/audit queries.
- Migration plan: If the deployment uses session-mode pooling, flip `prepare: true`; otherwise document the trade-off.

## Missing Critical Features

**No multi-server management UI/API:**
- Problem: There is no endpoint to list, edit, or delete servers (the schema supports many per user, but only `/api/servers/connect`, `/api/servers/:id`, `/api/servers/:id/install`, `/api/servers/:id/install/events`, `/api/servers/:id/actions` exist). The dashboard and logs implicitly assume a single "latest" server.
- Blocks: Operators with more than one VPS, decommissioning a server, renaming/relabeling, rotating SSH credentials without re-connecting from scratch.

**No encryption-key rotation tooling:**
- Problem: `server/crypto.ts` derives the AES key from `ENCRYPTION_KEY`; rotating the env var instantly breaks every stored credential, API key, and Telegram token (decryption throws "Encrypted payload is invalid").
- Blocks: Routine secret rotation, incident response after suspected key compromise.

**No structured logging / error tracking:**
- Problem: Only `console.log`/`console.error` are used (and only inside `server/lib/send-magic-link-email.ts`). Hono request logs are not wired up, and there is no Sentry/OpenTelemetry integration.
- Blocks: Production diagnosis of install/SSH failures beyond the user-facing error string, latency tracking, alerting.

**No automated database migration in local dev:**
- Problem: `package.json` ships `db:generate` but no `db:migrate`, while `README.md` instructs `bun run db:migrate` and deploy workflows shell out to `drizzle-kit migrate` directly.
- Blocks: First-time setup, CI test runs against a clean database, contributor onboarding.

**No server-removal / credential-rotation API:**
- Problem: `connectServer` only inserts; there is no `DELETE /api/servers/:id` or `PATCH` to update the credential. Operators must edit the DB by hand.
- Blocks: Off-boarding a VPS, rotating a leaked SSH key, swapping password→key auth.

**No CSRF protection on Hono routes beyond cookie-based auth:**
- Problem: Mutating endpoints rely solely on the session cookie; there is no double-submit token or `Origin` check. Better Auth handles its own endpoints, but `/api/servers/*`, `/api/providers/*`, `/api/telegram/*` do not.
- Blocks: Defense against cross-site cookie-driven POSTs from a logged-in user's browser context.

## Test Coverage Gaps

**Encryption (`server/crypto.ts`):**
- What's not tested: `encryptSecret` round-trip, behavior when `ENCRYPTION_KEY` is missing, behavior on malformed/corrupted ciphertext.
- Files: `server/crypto.ts` (no co-located `crypto.test.ts`)
- Risk: Silent regression in the encryption format (e.g. moving from `iv.authTag.ciphertext` base64url to a different layout) would render every stored credential unreadable.
- Priority: High.

**Auth bootstrap (`server/auth.ts`):**
- What's not tested: Lazy initialization (`hasDatabaseUrl`, `getAuth` returning the same instance), dev-fallback secret/baseURL behavior, throw-on-missing env in production.
- Files: `server/auth.ts`
- Risk: A regression that moves auth init to module scope (explicitly warned against in AGENTS.md) crashes routes with no `DATABASE_URL`; nothing catches it before CI passes.
- Priority: High.

**Client IP extraction (`server/lib/get-client-ip.ts`):**
- What's not tested: `x-forwarded-for` chain parsing, `TRUSTED_PROXY_COUNT` behavior, `x-real-ip` fallback, empty/whitespace handling.
- Files: `server/lib/get-client-ip.ts`
- Risk: Security-sensitive (audit-log IP attribution). A subtle off-by-one in `clientIndex` would log the wrong client or a proxy IP.
- Priority: High.

**Magic-link email delivery (`server/lib/send-magic-link-email.ts`):**
- What's not tested: Production throw when `RESEND_API_KEY` is missing, Resend HTTP error bubbling, dev console-log fallback.
- Files: `server/lib/send-magic-link-email.ts`
- Risk: A regression that swallows Resend errors would tell the user "check your inbox" for a message that never arrived.
- Priority: Medium.

**Database health and connection (`server/db/`):**
- What's not tested: `getDb` singleton behavior, `checkDatabaseConnection` success/failure paths, pool sizing from `DB_POOL_MAX`.
- Files: `server/db/index.ts`, `server/db/health.ts`
- Risk: `/api/health` is the only liveness signal used by Dokku/Docker; a regression that returns `200 ok` while the DB is down would mask outages.
- Priority: Medium.

**Frontend routes and shared components:**
- What's not tested: No tests for `src/routes/*.tsx` page wiring (`servers.$id.tsx`'s `useMountEffect` fetch path, `__root.tsx` layout), `src/components/Header.tsx`, `src/components/Footer.tsx`, `src/components/ThemeToggle.tsx`, `src/lib/auth-client.ts`.
- Files: `src/routes/__root.tsx`, `src/routes/servers.$id.tsx`, `src/routes/login.tsx`, `src/components/Header.tsx`, `src/components/Footer.tsx`, `src/components/ThemeToggle.tsx`, `src/lib/auth-client.ts`
- Risk: Layout, navigation auth-aware links, and the `/servers/:id` loading/error states regress without notice; feature components alone cannot catch a broken route tree.
- Priority: Medium.

**SSE replay / hydrate corner cases:**
- What's not tested: `hydrateInstallEvents` against malformed log lines (missing `[step]` brackets, empty file, partial timestamps).
- Files: `server/install/sse-stream.ts` (`hydrateInstallEvents`), `server/install/sse-stream.test.ts`
- Risk: Reconnects after an aborted install can throw or render nonsense progress.
- Priority: Low.

---

*Concerns audit: 2026-05-29*
