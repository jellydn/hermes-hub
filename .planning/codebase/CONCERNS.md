# Technical Concerns

**Analysis Date:** 2026-08-25

## Critical Issues

### 1. Single-Instance Boundary (ADR 0009)
**Severity:** High (architectural constraint)
**Location:** `server/credentials.ts`, `server/app.ts`, `server/install/sse-stream.ts`, `server/dashboard/metrics.ts`

**Issue:** Several critical components use in-memory module-level state that cannot be shared across multiple app instances:
- Session credentials cache
- Magic-link rate limiter (3 requests/5 min, keyed by email)
- Install SSE streams
- Dashboard metrics cache

**Impact:**
- Cannot scale horizontally without losing state
- Rolling deploys terminate active install streams
- Rate limiter resets on restart

**Status:** Accepted temporary constraint per ADR 0009

### 2. Database Migration Broken from Scratch
**Severity:** High (development blocker)
**Location:** `drizzle/0009_same_jackal.sql`

**Issue:** Migration `0009` runs `DROP INDEX "server_web_ui_server_id_idx"` but no prior migration creates that index. Fresh database migrations fail and roll back the entire chain.

**Impact:**
- Cannot set up fresh database with `bun run db:migrate`
- Must use `bunx drizzle-kit push` instead
- CI never runs migrations from scratch

**Workaround:** Use `bunx drizzle-kit push` for local development

## Security Concerns

### 1. In-Memory Rate Limiter
**Severity:** Medium
**Location:** `server/app.ts` (`magicLinkRateLimiter`)

**Issue:** Rate limiter is in-memory and keyed by email, not IP. A second app instance would have separate rate limits.

**Impact:**
- Users could bypass rate limits by hitting different instances
- Not a security risk if single-instance deployment is maintained

### 2. SSH Credential Storage
**Severity:** Low (mitigated)
**Location:** `server/db/schema.ts` (`servers.encrypted_credential`)

**Issue:** SSH credentials are encrypted with AES-256-GCM but stored in the database. If the `ENCRYPTION_KEY` is compromised, all credentials are exposed.

**Mitigation:**
- Encryption key is not stored in the database
- Key rotation support via `ENCRYPTION_KEY_V2`
- Re-encryption runner available

## Technical Debt

### 1. Path Alias Consolidation
**Status:** Partially complete
**Location:** `tsconfig.json`, `package.json`

**Issue:** Earlier `@/*` alias was consolidated into `#/*` per ADR 0012. Some internal `server/` and `shared/` modules still use relative imports (`../`) instead of aliases.

**Impact:** Inconsistent import patterns

### 2. Test Coverage Gaps
**Status:** Below thresholds
**Location:** `vite.config.ts` (coverage config)

**Issue:** Current coverage thresholds (45% lines, 40% functions) are relatively low. Many areas lack comprehensive tests:
- `src/routes/` - No route-level tests
- `src/features/` - Partial coverage
- `scripts/` - No test coverage

### 3. Missing Documentation
**Status:** Incomplete
**Location:** `docs/api-reference.md`

**Issue:** API reference documentation exists but may not reflect all recent changes (e.g., Command Code proxy, ENCRYPTION_KEY_V2).

## Performance Concerns

### 1. In-Memory Caching
**Location:** `server/dashboard/metrics.ts`

**Issue:** Dashboard metrics are cached in memory without TTL or invalidation strategy.

**Impact:**
- Stale data possible
- Memory growth over time

### 2. SSE Stream Memory
**Location:** `server/install/sse-stream.ts`

**Issue:** Active install streams are held in memory. Long-running installs could accumulate memory.

**Mitigation:** Streams are cleaned up on completion or timeout

## Fragile Areas

### 1. Install Progress Dual-Source
**Location:** `server/install/workflow.ts`, `server/install/records.ts`

**Issue:** Install progress lives in two places: persisted `install_events` rows (source of truth) and in-memory SSE stream. Keeping both in sync requires careful coordination.

### 2. Provider Credential Deployment
**Location:** `server/hermes/deploy.ts`, `server/hermes/telegram-deploy.ts`

**Issue:** Provider credentials are deployed to Hermes via SSH. If the remote Hermes config is corrupted, deployment fails with vague errors.

### 3. Telegram Pairing State
**Location:** `server/telegram.ts`

**Issue:** Telegram pairing relies on remote file ownership and Hermes container user context. Edge cases with `root` vs `hermes` user ownership can cause pairing failures.

## Dependency Risks

### 1. Router-Core Version Pin
**Location:** `package.json` (`@tanstack/router-core: 1.171.9`)

**Issue:** Router-core is pinned to 1.171.9 because newer versions break hydration (removed `matchesId` store). Must bump entire `@tanstack/react-start` family together.

**Risk:** Renovate may attempt to bump this independently

### 2. SSH Native Dependencies
**Location:** `vite.config.ts` (`optimizeDeps.exclude`)

**Issue:** `node-ssh`, `ssh2`, and `cpu-features` have native `.node` binaries that break Vite dev prebundling.

**Mitigation:** Excluded from `optimizeDeps`

## Recommendations

1. **Short-term:** Document workarounds for broken migrations more prominently
2. **Medium-term:** Add integration tests for SSH operations and provider deployment
3. **Long-term:** Evaluate externalizing in-memory state (Redis) for horizontal scaling

---

*Concerns analysis: 2026-08-25*
