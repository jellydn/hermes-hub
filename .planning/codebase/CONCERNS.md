# Concerns & Technical Debt

## Active Issues

### 1. Large Files (Complexity Hotspots)
Several files exceed healthy size thresholds, indicating they may benefit from refactoring:

| File | Lines | Concern |
|------|-------|---------|
| `server/hermes/runtime.test.ts` | 768 | Largest test file — may indicate untested production code or over-testing |
| `server/db/schema.ts` | 397 | Schema definitions — low cognitive complexity, file is mainly table definitions |
| `server/settings/agent-skills.ts` | 331 | Settings logic |
| `server/settings/mcp.ts` | 300 | MCP server manager |

### 2. In-Memory State (Single-Instance Boundary)
The following are module-level in-memory state and are **not shared** across nodes:
- Install SSE event streams (`server/install/sse-stream.ts`)
- Session credentials (`server/credentials.ts`)
- Magic-link rate limiter (`server/app.ts`)
- Dashboard metric caches (`server/dashboard/metrics.ts`)

This means horizontal scaling would break critical functionality (install progress streaming, rate limiting, credential storage). Documented in ADR 0009.

### 3. Test Coverage Gaps
- **`src/features/`**: Growing but many feature components untested
- **`server/web-ui/proxy-http.ts` and `server/web-ui/proxy-ssh.ts`**: Complex proxy transport logic with limited test coverage (464-line monolith split into 6 focused modules in June 2026)
- **SSR rendering**: Not tested (requires integration/E2E setup)
- **No coverage threshold** enforced in CI

### 4. TanStack Framework Mock Complexity
Testing route-level orchestration (``createFileRoute``, ``createServerFn`` handlers, ``beforeLoad``) requires extensive mocking of TanStack Router and TanStack Start internals:
- `@tanstack/react-router` must provide `createFileRoute`, `getRouteApi`, `Link`, `useNavigate`, and `redirect`
- `@tanstack/react-start` must unwrap `createServerFn` to return raw handlers (since Vitest's `happy-dom` environment lacks SSR context)
- `@tanstack/react-start/server` must provide `getRequestHeaders`
- These mocks are fragile and may break when TanStack releases API changes

### 5. `node-ssh` Native Dependencies
- `node-ssh` pulls in `ssh2` and `cpu-features` which bundle native `.node` binaries
- Requires special handling in `vite.config.ts` (excluded from `optimizeDeps`)
- Adds complexity to the dev build pipeline

## Security Considerations

### Addressed
- ✅ **HTTPS enforcement** via `requireHttps()` middleware on mutating routes in production
- ✅ **AES-256-GCM encryption** for all stored SSH credentials (`server/crypto.ts`)
- ✅ **Rate limiting** on magic-link authentication (3/5min per email)
- ✅ **Host key trust** management for SSH connections

### Watch Items
- ⚠️ `ENCRYPTION_KEY` rotation invalidates all stored SSH credentials — no re-encryption mechanism
- ⚠️ Magic-link rate limiter is in-memory (reset on restart)
- ⚠️ No audit trail for credential access (only for server actions)
- ⚠️ SSRF risk potential in SSH proxy and web UI features — data flows to arbitrary hosts

## Performance Considerations

- **Dashboard metrics** are cached in-memory (module-level state)
- **SSH connections** use a managed pool in `server/web-ui/ssh-pool.ts`
- **SSE streaming** for install progress — single-instance limitation
- No apparent caching layer for database queries beyond Drizzle query optimization
- No CDN or edge caching configured

## Conventions

### Failure Observability — operational failures must be log-observable (since June 2026)

Operational failures — SSH reconnects, deploy errors, upstream-unreachable, network timeouts, background-workflow errors — must be diagnosable from the structured log stream alone, without re-running the request or querying DB rows.

**Convention.** Every Hono `catch` block that returns a **502 / 500 for an operational cause** calls `logHandlerFailure` from [`server/lib/handler-error-log.ts`](../../server/lib/handler-error-log.ts) BEFORE the `audit_logs` insert + response. Skip the convention for **400-class** responses (`Unauthorized`, `Not found`, JSON parse failures, validation) — those are already surfaced to the client and would just be log noise.

**Audit-log is separate, not a substitute.** `audit_logs` is best-effort (the catch's `insertAuditLog` call may itself fail), aimed at user-visible history, and stores rows that operators cannot easily grep against. Always emit BOTH the audit row AND the structured log line for operational paths; never substitute one for the other.

**Event-name schema** (the `event` field on the pino structured line):

| Property | Rule |
|---|---|
| Format | `snake_case`, ASCII-only, no punctuation beyond `_` |
| Subject | what failed; terse, domain-scoped (e.g. `web_ui_proxy`, not `web_ui_proxy_request`) |
| Verb | implicit; only `_failed` is allowed because this helper only emits failures |
| Suffix | `_failed` — mandatory |

The helper does NOT auto-add `_failed`. Pass it explicitly. `web_ui_proxy_failed` (in production since June 2026) is the canonical example. The shape-check regex (in `server/lib/handler-error-log.ts`) is `/^[a-z][a-z0-9_]*_failed$/` — confirmed by five parametrised test cases (camelCase, missing suffix, uppercase, digit-first).

**Always-typed fields** (carried by every emit):

- `event` — discriminator (schema above)
- `userId` — opaque session UUID; `null` for unauthenticated paths
- `ipAddress` — best-effort, no PII beyond the IP
- `method` — HTTP method of the failing request
- `err` — raw Error; pino's `stdSerializers.err` applies (`{type, message, stack}`)

**Suggested `extras` fields per failure category:**

| Category | Extras |
|---|---|
| network failures | `serverId`, `port`, `upstreamPath`, `upstreamUnreachable: boolean` |
| deploy failures  | `serverId`, `serverHost`, `intent` (the `managed-compose-deploy` intent enum) |
| server actions   | `serverId`, `action`, `imageRef?` |
| pairings         | `serverId`, `code`, `locked: boolean` |

The June 2026 web-ui proxy fix (`3fd5286`) shipped the convention's first instance; the full audit's candidate-rollout list lives in the helper JSDoc and spans `server/telegram.ts`, `server/deploy.ts`, `server/hermes/{deploy,telegram-deploy}.ts`, `server/server-actions.ts`, `server/telegram/pairings.ts`, `server/health-check/handler.ts`, `server/providers/{providers,codex-auth/handler}.ts`, and `server/servers.ts`. Wiring the helper into these is the natural follow-up.

## Closed Items

### ✅ Large File Splits (June 2026 — PR #47)
Five of the nine large files from the original CONCERNS scan were split into focused, concern-driven modules:

| Original | Lines | Split into | Modules |
|----------|-------|------------|---------|
| `server/web-ui/proxy.ts` | 464 | 6 files | auth, http, rewrite, ssh, types, barrel |
| `server/telegram/model-access.ts` | 448 | 5 files | types, builders, queries, resolvers, barrel |
| `server/hermes/runtime.ts` | 398 | 7 files | agent-sync, compose, container-status, gateway-lifecycle, pairing, webui-reachable, barrel |
| `server/settings/mcp.test.ts` | 399 | 5 modules | test-helpers, create, update, delete, deploy |
| `server/web-ui/handlers.test.ts` | 393 | 5 modules | test-helpers, deploy, status, password, proxy |

All splits preserve the original public API via barrel re-exports at the original file path. Zero consumer import changes, zero circular dependencies.

### ✅ Empty Catch Blocks in `server/deploy.ts`
The two truly silent catch blocks (audit log insert failures after deploy success/failure) were fixed in June 2026. Both now log via `console.error` with the original error message, preserving the existing behavior (audit failure does not block the main operation).

Note: `server/servers.ts` and `server/server-actions.ts` were flagged in the original scan but their `catch { }` blocks are **not empty** — they return error responses to the client for JSON parse failures. No change was needed.

### ✅ Route Test Coverage
Added 7 route-level test files covering the main authenticated pages:
- `src/routes/dashboard.test.tsx`
- `src/routes/servers.index.test.tsx`
- `src/routes/settings.test.tsx`
- `src/routes/logs.test.tsx`
- `src/routes/telegram.test.tsx`
- `src/routes/ai-provider.test.tsx`
- `src/routes/servers.$id.test.tsx`

Each tests route configuration (component, `beforeLoad`), data loading orchestration, and unauthenticated edge cases. 27 tests total.

## Technical Debt Summary

| Area | Severity | Impact |
|------|----------|--------|| Large files (400+ lines) | Low | Maintainability, readability — 5/9 split in June 2026 |
| Single-instance boundaries | Medium | No horizontal scaling |
| Test coverage gaps (features/proxy) | Medium | Regression risk |
| TanStack mock fragility | Low | Route tests break on TanStack version bumps |
| No CI coverage threshold | Low | Coverage can regress unnoticed |

## Recommendations

1. **Wire the failure-observability helper into the remaining silent-catch sites** identified in the June 2026 audit (see *Failure Observability* above)
2. **Split remaining large files** — `server/hermes/runtime.test.ts` (768 lines) and `server/settings/agent-skills.ts` (331 lines) are the next candidates
3. **Implement re-encryption** for credential rotation (rotate `ENCRYPTION_KEY` without data loss)
4. **Add CI coverage threshold** — start with a reasonable floor (e.g., 40-50%) and trend upward
5. **Consider externalizing SSE/rate-limiter state** for future horizontal scaling
6. **Add remaining route tests** — `servers.$id.install`, `servers.new`, `__root`, `index`, `login`
