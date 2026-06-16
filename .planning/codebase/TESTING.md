# Testing

## Framework & Configuration

- **Runner**: Vitest ^4.1.5 (configured in `vite.config.ts`)
- **Environment**: `node` (not DOM/browser) — configured globally in `vite.config.ts`
- **DOM Support**: `happy-dom` ^20.10.1 (fast) and `jsdom` ^28.1.0 (comprehensive) available
- **Command**: `bun run test` → `vitest run --passWithNoTests --reporter=dot`
- **Just wrapper**: `just test`

## Test Structure

- **Co-located**: Tests sit next to their source files (`foo.ts` ↔ `foo.test.ts`, `foo.tsx` ↔ `foo.test.tsx`)
- **Extension**: `*.test.{ts,tsx}` (neither `*.spec.*` nor `__tests__/` directories are used)
- **Glob pattern**: `src/**` and `server/**` for `*.{test,spec}.{js,ts,jsx,tsx}` files

## Test Distribution

| Area | Count | Coverage Focus |
|------|-------|---------------|
| **server/** | 62 files | Backend logic (auth, SSH, deploy, install, telegram, providers, hermes, web-ui, health-check) |
| **src/lib/** | ~8 files | Utility functions (session, brand-mark-graphic, ai-providers, user-subscriptions, parse-theme-css, wcag-contrast, dark-mode) |
| **src/features/** | ~5 files | Feature component tests (dashboard/status-overview, logs/logs-viewer, install-progress, servers/connection-wizard) |
| **shared/contracts/** | 1 file | Agent skills types |

**Total**: ~87 test files across the project.

## Testing Patterns

### Mocking

- **`vi.mock()`** is used for module-level mocking:
  - `node-ssh` — mocked in `server/ssh/connection.test.ts` and `server/web-ui/ssh-pool.test.ts`
  - `hono/streaming` — mocked in `server/install-idle-timeout.test.ts`
- **Factory functions** are common for creating test fixtures

### Vitest Globals

Vitest globals (`vi`, `describe`, `it`, `expect`) are available without explicit imports. The project convention uses these globals throughout.

### No DOM Assumption

Tests run with `environment: "node"`. Do not assume a DOM is available unless a specific test file configures a DOM environment.

## Coverage Gaps (per `docs/test-coverage-review.md`)

- **`server/db/schema.ts`** — 397 lines, untested (schema definition, low risk)
- **`server/web-ui/proxy.ts`** — 464 lines, complex SSH proxy, limited test coverage
- **`src/routes/`** — No tests for route components
- **`src/features/`** — Growing coverage but many feature components lack tests
- **SSR rendering** — Not tested in Vitest (requires integration/E2E testing)

## Recommended Test Improvements

1. Add tests for uncovered API handlers (`server/` modules)
2. Add component tests for main routes (`src/routes/`)
3. Expand `src/features/` test coverage
4. Consider integration/E2E tests for critical flows (install, deploy, SSH proxy)
5. Snapshot tests for complex Drizzle queries (one snapshot file exists for `compose.test.ts`)

## CI Integration

- **CI workflow**: `bun run test` runs as part of every push/PR (after Biome check, before build)
- **Pre-commit**: React Doctor runs on staged changes to catch regressions before commit
- **No test coverage threshold** enforced in CI at this time
