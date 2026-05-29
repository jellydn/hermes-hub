# Codebase Concerns

**Analysis Date:** 2026-05-26
**Last Updated:** 2026-05-29 — Remaining behavior fix + coverage gaps implemented

---

## ✅ Resolved (Quick-Win Pass — commit `be43efd`)

- **Magic-link email transport is a no-op** → Resend integration via `server/lib/send-magic-link-email.ts`; `console.log` fallback in dev
- **Hardcoded dev fallback for Better Auth secret and URL** → Lazy failure: throws in production, falls back in dev only
- **Duplicate migration files with skipped index** → Regenerated as single clean `0000_swift_luckman.sql`
- **Auth callback route overlaps verify route** → Both explicit routes removed; catch-all `/api/auth/*` handles all
- **Telegram dashboard summary displays chat ID instead of bot username** → Renamed `chatId`/`chat_id` to `botUsername`/`bot_username`
- **In-memory ephemeral credentials never expire** → Renamed to session credentials; 30-min TTL with periodic cleanup + read-time check
- **SSE stream has no connection timeout** → 90s idle timeout + 30s heartbeat comments
- **Trusted `x-forwarded-for` header without validation** → `getClientIp()` helper with `TRUSTED_PROXY_COUNT` env var
- **BETTER_AUTH_SECRET hardcoded development fallback** → Lazy failure at request time
- **Single database connection pool** → `max` changed to `parseInt(process.env.DB_POOL_MAX ?? "5")`
- **Multiple sequential DB queries in dashboard status** → Independent queries parallelized with `Promise.all`
- **All TanStack libraries at `"latest"`** → Pinned to resolved versions

---

## ✅ Resolved (Second-Round Implementation)

- **No rate limiting on magic link sending** → `rate-limiter-flexible` with in-memory store, 3 requests per 5 minutes per email
- **SSH private keys transmitted in plaintext JSON** → Server-side HTTPS enforcement in production; reject credential-bearing endpoints over plain HTTP
- **No caching for dashboard status polling** → Two-tier in-memory cache: static data 60s TTL, live metrics 15s TTL
- **OS validation rejects non-Ubuntu/Debian** → Warn-and-proceed: `supportLevel: "supported" | "untested"` with dashboard warning
- **Install workflow monolith** → SSE infrastructure extracted into `server/install/sse-stream.ts`
- **Auth base URL defaults to localhost during SSR** → Read `BETTER_AUTH_URL` from env vars during SSR

---

## ✅ Resolved (Final Pass — behavior + test coverage)

- **Dashboard polling never backs off on error** → Implemented exponential backoff (30s → 60s → 120s), hard cap at 3 consecutive failures, connection-lost state, and manual retry in `src/features/dashboard/status-overview.tsx`; covered in `src/features/dashboard/status-overview.test.tsx`
- **Session credential lifecycle coverage** → Added focused tests for store/get, read-time TTL expiry, and periodic cleanup in `server/credentials.test.ts`
- **SSH normalization coverage** → Added `normalizeSshError` unit tests while preserving `parseAndValidateOs` coverage in `server/ssh.test.ts`; caller integration coverage already exists in `server/server-actions.test.ts`, `server/dashboard.test.ts`, and `server/servers.test.ts`
- **SSE reconnection/timeout coverage** → Added pure helper coverage in `server/install/sse-stream.test.ts` and focused idle-timeout coverage in `server/install-idle-timeout.test.ts`
- **Auth route behavior coverage** → Added `hasDatabaseUrl() === false` 503 coverage in `server/app.test.ts` and redirect coverage in `src/lib/session.test.ts`
- **Rollback target resolution coverage** → Added `getRollbackTargetFromHistory` unit coverage in `server/server-actions.test.ts`

---

## Open Concerns

### Dependencies at Risk

**`better-auth` (^1.6.11):** Risk: Relatively new auth library (v1.x) with evolving API. Breaking changes in minor releases possible. Action: Pin version, monitor changelogs. No ADR needed.

**`node-ssh` (^13.2.1):** Risk: May have compatibility issues with newer SSH configs or key formats (ED25519, FIDO/U2F). Action: Test with ED25519 keys when adding SSH test coverage. No ADR needed.

### Test Coverage Gaps

All previously identified coverage gaps from the 2026-05-29 review are now covered.

---

### Completed — No Further Action

All original codebase concerns from the initial analysis have either been implemented, covered by tests, or remain watch-only dependency risks.
