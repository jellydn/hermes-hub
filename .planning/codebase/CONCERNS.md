# Codebase Concerns

**Analysis Date:** 2026-05-26
**Last Updated:** 2026-05-27 — Second-round implementation complete

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

These concerns have been implemented:

- **No rate limiting on magic link sending** → `rate-limiter-flexible` with in-memory store, 3 requests per 5 minutes per email (`server/app.ts`)
- **SSH private keys transmitted in plaintext JSON** → Server-side HTTPS enforcement in production; reject credential-bearing endpoints over plain HTTP by checking `x-forwarded-proto` (`server/app.ts`)
- **No caching for dashboard status polling** → Two-tier in-memory cache: static data (server/provider/telegram/install) 60s TTL, live metrics (SSH) 15s TTL (`server/dashboard.ts`)
- **OS validation rejects non-Ubuntu/Debian** → Warn-and-proceed: Ubuntu/Debian get `supportLevel: "supported"`, other Linux distros get `supportLevel: "untested"` with a dashboard warning (`server/ssh.ts`, `server/dashboard.ts`, `src/`)
- **Install workflow monolith (647 lines)** → SSE infrastructure extracted into `server/install/sse-stream.ts` (`server/install.ts` imports from it)
- **Auth base URL defaults to localhost during SSR** → Read `BETTER_AUTH_URL` from env vars during SSR (`src/lib/auth-client.ts`)

---

## Open Concerns

### Dependencies at Risk

**`better-auth` (^1.6.11):** Risk: Relatively new auth library (v1.x) with evolving API. Breaking changes in minor releases possible. The project uses both `@better-auth/drizzle-adapter` and `tanstackStartCookies()`. Action: Pin version, monitor changelogs. No ADR needed (not hard to reverse, just painful to swap).

**`node-ssh` (^13.2.1):** Risk: May have compatibility issues with newer SSH configs or key formats (ED25519, FIDO/U2F). Key-based auth assumes private key content as string. No fallback to `ssh2` directly. Action: Test with ED25519 keys when adding SSH test coverage. No ADR needed.

### Test Coverage Gaps (Priority Order)

**1. Session credential lifecycle (High)** — `server/credentials.ts` has zero tests. No coverage for `storeSessionCredential`, `getSessionCredential`, or TTL eviction. Highest priority because we just rewrote this module. Files: `server/credentials.ts`

**2. Full SSH connection flow (High)** — End-to-end SSH with real credential resolution, OS validation (including new `supportLevel` field), network failures, timeouts, concurrent execution. Files: `server/servers.ts`, `server/ssh.ts`, `server/server-actions.ts`, `server/dashboard.ts`

**3. SSE reconnection and timeout behavior (Medium)** — EventSource reconnection, closeStream/openStream cycle, malformed SSE data, idle timeout + heartbeat. Must be tested before refactoring into `sse-stream.ts`. Files: `src/features/servers/install-progress.tsx`, `server/install.ts`

**4. Dashboard error states (Medium)** — API returns 401/500/malformed JSON, retry/refresh behavior on polling failure. Files: `src/features/dashboard/status-overview.tsx`, `server/dashboard.ts`

**5. Auth callback and route rewrite behavior (Medium)** — `/api/auth/*` catch-all logic, `requireSession` redirect. Simpler now after removing duplicate routes. Files: `server/app.ts`, `src/lib/session.ts`, `src/routes/login.tsx`

**6. Rollback target resolution (Low)** — Fallback chain: `targetVersion` param → `installs.version` → `"latest"`. `getRollbackTargetFromHistory` function. Files: `server/server-actions.ts`