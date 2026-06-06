# Codebase Concerns

**Analysis Date:** 2026-06-06

## Tech Debt

**[Legacy Install Log Fallback]:** ✅ Resolved (2026-06-06)

- Issue: `server/install/legacy-log.ts` contained fallback parsing for legacy `installs.log` column kept only for read-fallback during migration
- Files: `server/install/log-lines.ts`, `drizzle/0007_drop_installs_log.sql`
- Resolution: Backfilled legacy `installs.log` rows into `install_events`, dropped the column, and removed the dual read path

**[Generated Route Tree]:**

- Issue: `src/routeTree.gen.ts` is generated but committed; manual edits would be overwritten
- Files: `src/routeTree.gen.ts`
- Impact: Risk of accidental edits; regeneration needed on route changes
- Fix approach: Ensure CI regenerates on build; consider `.gitignore` if regeneration is reliable

**[Drizzle Config Fails at Import Time]:** ✅ Resolved (2026-06-06)

- Issue: `drizzle.config.ts` threw at import time if `DATABASE_URL` was missing
- Files: `drizzle.config.ts`, `server/db/index.ts`
- Resolution: Config imports safely with an empty fallback URL; runtime DB access still validates `DATABASE_URL` in `getDb()`

**[No Local Migration Script]:** ✅ Resolved (2026-06-06)

- Issue: `package.json` had `db:generate` but no `db:migrate`; migrations only ran during deploy
- Files: `package.json`, `justfile`, `scripts/db-migrate.mjs`
- Resolution: Added `bun run db:migrate` and `just db-migrate` with a clear `DATABASE_URL` guard

## Known Bugs

**[Auth Initialization Timing]:**

- Symptoms: Better Auth is intentionally lazy in `server/auth.ts`; moving to module scope crashes pages when `DATABASE_URL` unset
- Files: `server/auth.ts`
- Trigger: Import auth before env vars loaded
- Workaround: Keep lazy initialization; avoid top-level auth calls

**[Vite Dev Prebundling Breaks with Native Modules]:**

- Symptoms: `node-ssh`, `ssh2`, `cpu-features` excluded from `optimizeDeps` in `vite.config.ts` because server-only SSH code pulls native `.node` binaries
- Files: `vite.config.ts`
- Trigger: Adding server-only deps to client bundle
- Workaround: Keep exclusions in `vite.config.ts`; don't import SSH modules in client code

## Security Considerations

**[Credential Encryption Key Management]:**

- Risk: `ENCRYPTION_KEY` required for decrypting stored credentials (Telegram API keys, server SSH keys); if lost, credentials unrecoverable
- Files: `server/crypto.ts`, `server/credentials.ts`, `server/server-records.ts`
- Current mitigation: AES-256-GCM encryption; key from env var
- Recommendations: Document key rotation procedure; consider HSM/KMS for production

**[SSH Private Key Handling]:**

- Risk: SSH private keys stored encrypted in DB; decrypted in memory for deployments
- Files: `server/credentials.ts`, `server/server-records.ts`, `server/ssh.ts`
- Current mitigation: Encryption at rest; keys not logged
- Recommendations: Audit memory handling; consider ssh-agent integration; add key rotation

**[Production HTTPS Enforcement]:**

- Risk: Mutating API routes call `requireHttps()` in production but this depends on correct proxy headers
- Files: `server/app.ts`, `server/lib/get-client-ip.ts`
- Current mitigation: `TRUSTED_PROXY_COUNT` env var; `requireHttps()` guard
- Recommendations: Verify proxy configuration; add CSP headers; audit all mutating endpoints

**[AI Provider API Key Storage]:**

- Risk: Multiple AI provider keys stored (OpenAI, Anthropic, OpenRouter, Ollama, Custom)
- Files: `server/providers.ts`, `server/db/schema.ts` (provider tables)
- Current mitigation: Encrypted storage via `crypto.ts`
- Recommendations: Scoped keys per environment; audit provider key rotation

## Performance Bottlenecks

**[SSH Connection Reuse]:**

- Problem: New SSH connection per server action; no connection pooling visible
- Files: `server/ssh.ts`, `server/server-actions.ts`, `server/install/sse-stream.ts`
- Cause: Each `node-ssh` invocation creates new connection; SSH handshake overhead
- Improvement path: Implement connection pooling or reuse; cache connections per server

**[Dashboard Aggregation Queries]:**

- Problem: Dashboard loads server list, install status, provider configs in parallel but may N+1 on related data
- Files: `server/dashboard.ts`, `src/routes/dashboard.tsx`
- Cause: Multiple DB queries per server; potential waterfall
- Improvement path: Use Drizzle relations/joins; add composite indexes; consider materialized views

**[Install Event Replay]:**

- Problem: SSE replay reads all `install_events` rows for an install; no pagination/limit
- Files: `server/install/sse-stream.ts`, `server/install/records.ts`
- Cause: Full event history streamed on reconnect; could grow large
- Improvement path: Add pagination/cursor; implement event compaction; cap replay window

## Fragile Areas

**[Server Action Version Tracking]:**

- Files: `server/server-actions.ts`, `server/install/records.ts`
- Why fragile: Transaction wraps SSH action + audit log + version update; if version update fails, audit rolls back but SSH already executed
- Safe modification: Keep transaction boundary exactly as-is; test rollback scenarios
- Test coverage: `server/server-actions.test.ts` covers success/failure paths

**[Telegram Deploy State Consistency]:**

- Files: `server/telegram.ts`, `server/telegram/pairings.ts`
- Why fragile: SSH deploy succeeds, then config update + audit log in transaction; if transaction fails, local DB out of sync with remote Hermes container
- Safe modification: Never split deploy and config update; test partial failure
- Test coverage: `server/telegram.test.ts` covers deploy flow

**[Install SSE Stream In-Memory State]:**

- Files: `server/install/sse-stream.ts`, `server/install/records.ts`
- Why fragile: In-memory event stream + persisted DB rows must stay in sync; dual-write pattern
- Safe modification: Always use `emitInstallEvent` (transactional); never write directly to `install_events`
- Test coverage: `server/install.test.ts` covers event emission

**[Better Auth Lazy Initialization]:**

- Files: `server/auth.ts`, `src/lib/auth-client.ts`
- Why fragile: Auth not initialized until first use; breaks if `DATABASE_URL` unset at module scope
- Safe modification: Keep lazy; never import auth at top level in client code
- Test coverage: Auth tests in `server/app.test.ts`

## Scaling Limits

**[Database Connection Pool]:**

- Current capacity: `DB_POOL_MAX` default 5 (configurable)
- Limit: Pool exhaustion under concurrent install/dashboard load
- Scaling path: Increase pool; add read replicas; implement query batching

**[Concurrent SSH Operations]:**

- Current capacity: Sequential per server; no global limit
- Limit: SSH connection limits on target VPS; rate limiting by cloud provider
- Scaling path: Add semaphore/queue; implement per-server concurrency control

\*\*[SSE Connection Count]:]

- Current capacity: One SSE connection per active install view
- Limit: Browser connection limits (~6 per host); server file descriptor limits
- Scaling path: Add connection pooling; consider WebSocket fallback; implement heartbeat

## Dependencies at Risk

**[node-ssh / ssh2]:**

- Risk: Native Node.js addons (`.node` binaries); version compatibility issues with Node upgrades
- Impact: SSH deployments, server actions, install streaming all depend on this
- Migration plan: Monitor for pure-JS SSH alternatives; test Node version upgrades in CI

**[better-auth]:**

- Risk: Rapid version changes; adapter coupling to Drizzle
- Impact: Entire auth system; migration path unclear if abandoned
- Migration plan: Pin version; track upstream; have fallback auth strategy

\*\*[TanStack Start (v1 beta):]

- Risk: Framework in beta; APIs may change; router plugin coupling
- Impact: All routing, SSR, server functions
- Migration plan: Lock versions; monitor migration guides; test upgrades in isolation

## Missing Critical Features

**[Database Migration Tooling]:** ✅ Resolved (2026-06-06)

- Problem: No local `db:migrate` command; migrations only ran during deploy
- Resolution: Added `bun run db:migrate` and `just db-migrate` for local schema sync
- Files: `package.json`, `justfile`, `scripts/db-migrate.mjs`

**[Structured Logging/Observability]:**

- Problem: No structured logging framework; uses console only
- Blocks: Production debugging; audit trails; performance monitoring
- Files: All server files

**[Rate Limiting on Public Endpoints]:**

- Problem: `rate-limiter-flexible` installed but not visibly applied to all public routes
- Blocks: Abuse prevention; DoS protection
- Files: `server/app.ts`

\*\*[Automated Backup/Restore]:]

- Problem: No documented backup strategy for PostgreSQL or encrypted credentials
- Blocks: Disaster recovery; point-in-time restore
- Files: N/A

## Test Coverage Gaps

**[Integration Tests for SSH Flows]:**

- What's not tested: Real SSH connections to remote servers; Docker Compose deployments
- Files: `server/ssh.ts`, `server/managed-compose-deploy.ts`, `server/deploy.ts`
- Risk: SSH failures only caught in production
- Priority: High

**[E2E Tests for Critical User Flows]:**

- What's not tested: Full server onboarding wizard; Telegram pairing; AI provider setup
- Files: `src/features/servers/connection-wizard.tsx`, `src/features/telegram/`
- Risk: UI regressions in complex multi-step flows
- Priority: High

**[Error Boundary Coverage]:**

- What's not tested: React error boundaries; SSE reconnection; auth expiry handling
- Files: `src/routes/`, `src/lib/use-mount-effect.ts`
- Risk: Silent failures; poor UX on errors
- Priority: Medium

**[Concurrency/Transaction Edge Cases]:**

- What's not tested: Race conditions in install events; simultaneous server actions; deploy rollback
- Files: `server/install/sse-stream.ts`, `server/server-actions.ts`, `server/telegram.ts`
- Risk: Data inconsistency under load
- Priority: High

---

_Concerns audit: 2026-06-06_
