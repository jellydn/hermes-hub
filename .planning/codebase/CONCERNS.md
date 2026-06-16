# Concerns & Technical Debt

## Active Issues

### 1. Large Files (Complexity Hotspots)
Several files exceed healthy size thresholds, indicating they may benefit from refactoring:

| File | Lines | Concern |
|------|-------|---------|
| `server/hermes/runtime.test.ts` | 768 | Largest test file — may indicate untested production code or over-testing |
| `server/web-ui/proxy.ts` | 464 | SSH proxy logic — complex, hard to test |
| `server/telegram/model-access.ts` | 448 | Model access logic — feature creeping |
| `server/settings/mcp.test.ts` | 399 | Large test file |
| `server/hermes/runtime.ts` | 398 | Runtime management — core logic |
| `server/db/schema.ts` | 397 | Schema definitions — low cognitive complexity, file is mainly table definitions |
| `server/web-ui/handlers.test.ts` | 393 | Large test file |
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
- **`server/web-ui/proxy.ts`**: Complex proxy logic with limited test coverage
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

## Closed Items

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
|------|----------|--------|
| Large files (400+ lines) | Low-Medium | Maintainability, readability |
| Single-instance boundaries | Medium | No horizontal scaling |
| Test coverage gaps (features/proxy) | Medium | Regression risk |
| TanStack mock fragility | Low | Route tests break on TanStack version bumps |
| Proxy complexity (464 lines) | Medium | Bug-prone, hard to test |
| No CI coverage threshold | Low | Coverage can regress unnoticed |

## Recommendations

1. **Refactor large files** — split `server/web-ui/proxy.ts` and `server/hermes/runtime.ts` by concern
2. **Implement re-encryption** for credential rotation (rotate `ENCRYPTION_KEY` without data loss)
3. **Add CI coverage threshold** — start with a reasonable floor (e.g., 40-50%) and trend upward
4. **Consider externalizing SSE/rate-limiter state** for future horizontal scaling
5. **Add remaining route tests** — `servers.$id.install`, `servers.new`, `__root`, `index`, `login`
