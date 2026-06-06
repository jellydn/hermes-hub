# Technical Concerns

Generated: 2026-06-06

## Known Bugs & Issues

### Production Hydration Errors (React #418)
**Severity:** Medium | **File:** `src/components/ThemeToggle.tsx`

React 19 hydration mismatch when browser extensions inject DOM elements or when theme state differs between server (always "Auto") and client (localStorage preference). Mitigated with `suppressHydrationWarning` on the ThemeToggle button, but extensions can still cause hydration failures elsewhere.

### Concurrent Deploy Race Condition
**Severity:** Low | **File:** `server/web-ui/deploy.ts:66-80`

Two simultaneous POSTs can both pass the stale-deploy guard and start duplicate background deploys. `tryAcquireWebUiDeployLock` serializes same-process deploys, but two HermesHub instances (violating ADR 0009) could still race. `onConflictDoUpdate` keeps one DB row, but the VPS may see concurrent work. `SELECT ... FOR UPDATE` would need raw SQL to harden further.

### Stale Deploy Resolution Side Effect on Read
**Severity:** Low | **File:** `server/web-ui/records.ts:125-140`

`getResolvedServerWebUiRecord` calls `resolveServerWebUiRecord`, which writes a `failed` status to the DB when a `deploying` record is past `STALE_DEPLOY_THRESHOLD_MS`. Any status read can mutate state. This is intentional (self-healing stuck deploys) but means read paths are not pure — tests and callers must account for the write.

### Legacy deployStartedAt NULL handling
**Severity:** Low (fixed) | **File:** `server/web-ui/snapshot.ts`

Fixed in `5ba8aa0`: `isStaleDeploy(null)` now returns `true` instead of `false`, so legacy rows created before the `deploy_started_at` migration are treated as stale instead of permanently stuck in "deploying".

## Technical Debt

### Large Files

| File | Lines | Concern |
|------|-------|---------|
| `server/servers.ts` | 564 | Core VPS connection logic — could be split into connect, disconnect, detail modules |
| `server/telegram.ts` | 462 | Mixes connect/disconnect, deploy, pairing — could be split by concern |
| `src/features/servers/connection-wizard.tsx` | ~200+ | Multi-step wizard — recently decomposed into step components (partial improvement) |

### Untested Security Module
**Severity:** High | **File:** `server/crypto.ts` (51 lines, 0 tests)

AES-256-GCM encrypt/decrypt has **no direct tests**. A regression here means credential leaks or data loss. Roundtrip encrypt/decrypt and error paths (invalid payload, missing key) should be tested.

### Untested Pure Logic
**Severity:** Medium | **File:** `src/lib/ai-providers.ts` (69 lines, 0 tests)

Pure functions like `isAiProviderId`, `isValidAiModel`, `getDefaultAiModel`, `formatAiProviderLabel` have no test coverage. Low effort, high value — no mocking needed.

### Test Coverage Gaps
See `docs/test-coverage-review.md` for full analysis. Key areas:
- `server/dashboard.ts`: `getDashboardStatusSnapshot`, `getVpsSummary` (live SSH metrics)
- `server/server-actions.ts`: Update and rollback commands
- `server/ssh.ts`: Error classification, `withSshConnection`
- `src/routes/*`: Route rendering and edge cases (zero test files for routes)

## Security

### Credential Encryption
**Status:** Adequate

- AES-256-GCM encryption for stored credentials
- Ephemeral (in-memory only) option for password/keys
- `requireHttps()` guard on credential-bearing endpoints in production

**Risk:** The `crypto.ts` module has zero tests. A bug in encryption could silently corrupt or expose credentials.

### Environment Variables
**Status:** Adequate

Sensitive values (`DATABASE_URL`, `ENCRYPTION_KEY`, `BETTER_AUTH_SECRET`, API keys) configured via env vars. No hardcoded secrets found.

### Request Guards
**Status:** Adequate

- `requireSession` for auth
- `requireOwnedServer` for ownership verification
- `requireHttps` for production HTTPS enforcement

**Risk:** No rate limiting on auth endpoints. Magic-link email sending has no abuse prevention.

## Performance

### SSH Connection Pooling
**Status:** Good

SSH connections are pooled (`server/web-ui/ssh-pool.ts`) for Web UI proxy traffic. `invalidatePooledSsh` used before deploys to avoid stale connections.

### Parallel Operations
**Status:** Good

- `verifyServerConnection` uses `Promise.all` for concurrent OS info queries
- Route `beforeLoad` uses `Promise.all` for parallel data fetching
- Dashboard polls at 30s intervals, backs off to 120s on failure, pauses after 3 failures

### SSE Replay
**Status:** Good

Reconnecting SSE clients receive past install events before new ones, avoiding redundant DB queries.

### Build
**Status:** Good

- Vite with `optimizeDeps.exclude` for `node-ssh`, `ssh2`, `cpu-features` (native binaries)
- Multi-stage Docker build: Bun for deps/build, Node.js for runtime
- Docker Compose with health checks for Postgres + Mailpit dependencies

## Dependencies

### Removed
- `@tanstack/react-router-ssr-query` — no longer needed
- `@tanstack/router-plugin` — no longer needed

### Added
- `react-doctor` — React quality checks (pre-commit + CI)
- `@sentry/node` — error monitoring
- Various `@opentelemetry/*` and `@oxc-*` transitive deps from build tooling

## Fragile Areas

### Browser Extension Interference
The app depends on clean DOM hydration. Browser extensions (MetaMask, Firefox containers, password managers) inject elements that cause React 19 hydration errors in production. `suppressHydrationWarning` on `<html>` and ThemeToggle mitigates some cases, but no comprehensive solution exists for arbitrary extension injection.

### VPS State Assumptions
Install and deploy workflows assume the VPS is in a clean or predictable state. Edge cases like partially-installed Docker, disk space exhaustion, or conflicting containers are not fully handled.

### Single-Instance Boundary
Per ADR 0009, the app assumes a single instance boundary for operational state (SSE streams, in-memory credential cache). Running multiple instances would break SSE subscriptions and credential sharing.
