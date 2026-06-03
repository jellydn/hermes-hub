# Testing Patterns

**Analysis Date:** 2026-06-02

## Test Framework

**Runner:**
- Vitest 4.1.5 (`package.json` devDependencies).
- Config: `vite.config.ts` — the same Vite config exports a Vitest `test` block. The config gates Tanstack/React/Tailwind plugins behind `process.env.VITEST !== "true"` so they don't load during tests.
- Per `vite.config.ts` `test`:
  - `environment: "node"` is the default.
  - `include: ["src/**/*.{test,spec}.{js,ts,jsx,tsx}", "server/**/*.{test,spec}.{js,ts,jsx,tsx}"]`.
  - React/DOM tests opt into jsdom per-file with the `// @vitest-environment jsdom` pragma (see `src/features/dashboard/status-overview.test.tsx:1`, `src/features/servers/server-list.test.tsx:1`). `jsdom` is in devDependencies.
- Server-only modules (`node-ssh`, `ssh2`, `cpu-features`) are excluded from Vite's `optimizeDeps` — do not import them in client tests.

**Assertion Library:**
- Vitest's built-in `expect` (`import { expect } from "vitest"`).
- React Testing Library (`@testing-library/react` 16, `@testing-library/dom` 10) for component assertions: `screen.getByRole`, `screen.getByText`, `.toBeTruthy()`, `.toHaveLength(n)`. The repo intentionally uses `.toBeTruthy()` rather than `@testing-library/jest-dom` matchers (no `jest-dom` dependency is installed).

**Run Commands:**
```bash
bun run test           # vitest run --passWithNoTests (single pass; CI default)
just test              # thin wrapper around `bun run test`
just check             # parallel typecheck + test
bunx vitest            # watch mode (not wired into a script; invoke directly)
bunx vitest --coverage # coverage (no coverage tool is configured; see below)
```

> Per `AGENTS.md`: **do not** run `bun test` — that invokes Bun's built-in runner, which is not the configured one. Always use `bun run test`. CI order is `bunx @biomejs/biome check .` → `bun run typecheck` → `bun run test` → `bun run build`.

## Test File Organization

**Location:**
- Co-located with the module under test. Examples: `server/install/sse-stream.ts` ↔ `server/install/sse-stream.test.ts`, `src/lib/session.ts` ↔ `src/lib/session.test.ts`, `src/features/servers/server-list.tsx` ↔ `src/features/servers/server-list.test.tsx`.
- Snapshot artifacts live in a sibling `__snapshots__/` folder (`server/__snapshots__/compose.test.ts.snap`) — Vitest's default layout.
- No separate `__tests__/` directories or top-level `tests/` folder.

**Naming:**
- `<module>.test.ts` or `<module>.test.tsx`. The `vite.config.ts` include glob also accepts `.spec.*` but nothing in the repo uses it.

**Structure:**
```
server/
  install/
    sse-stream.ts
    sse-stream.test.ts
    workflow.ts
    workflow.test.ts
  __snapshots__/
    compose.test.ts.snap
  compose.ts
  compose.test.ts
src/
  features/
    dashboard/
      status-overview.tsx
      status-overview.test.tsx
  lib/
    session.ts
    session.test.ts
```

## Test Structure

**Suite Organization (from `server/install/sse-stream.test.ts`):**
```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

import { installEvents, installs } from "../db/schema";

const selectLimit = vi.fn();
// ... shared mock handles declared at module top ...

vi.mock("../db", () => ({
  getDb: () => ({ select: dbSelect, insert: dbInsert, update: dbUpdate, transaction: dbTransaction }),
}));

describe("install SSE stream helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    // ...wire up mock implementations fresh per test...
  });

  it("normalizes install status values", async () => {
    const { normalizeInstallStatus } = await import("./sse-stream");
    expect(normalizeInstallStatus("pending")).toBe("pending");
    expect(normalizeInstallStatus(null)).toBe("pending");
  });
});
```

**Patterns:**
- Setup uses `beforeEach(() => { vi.clearAllMocks(); vi.useRealTimers(); ... })` to keep tests independent.
- The module under test is often `await import("./module")` *inside* each `it` so `vi.mock` calls earlier in the file take effect before the import (see `src/lib/session.test.ts:14`).
- Teardown for DOM tests uses `afterEach(() => { cleanup(); vi.clearAllMocks(); vi.useRealTimers(); })` from `@testing-library/react` (see `src/features/dashboard/status-overview.test.tsx:18`).
- Assertions favor explicit, behavioral checks: `expect(state.events).toHaveLength(1)`, `expect(state.events[0]).toMatchObject({ ... })`, `expect(fetchMock).toHaveBeenCalledTimes(3)`.

## Mocking

**Framework:** Vitest's built-in `vi` (`vi.fn`, `vi.mock`, `vi.stubGlobal`, `vi.useFakeTimers`, `vi.setSystemTime`).

**Patterns:**

Module mocking with hoisted `vi.mock` and shared `vi.fn()` handles re-wired per test (`server/install/sse-stream.test.ts`):
```typescript
const dbSelect = vi.fn();
const dbInsert = vi.fn();
const dbTransaction = vi.fn();

vi.mock("../db", () => ({
  getDb: () => ({ select: dbSelect, insert: dbInsert, transaction: dbTransaction }),
}));

beforeEach(() => {
  dbSelect.mockImplementation(() => ({ from: (table) => { /* ... */ } }));
  dbTransaction.mockImplementation(async (cb) => cb({ insert: txInsert, update: txUpdate }));
});
```

Router mocking for component tests that render `<Link>` without a real router (`src/features/servers/server-list.test.tsx`):
```typescript
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, params, to, ...props }: MockLinkProps) => (
    <a href={resolveTo(to, params)} {...props}>{children}</a>
  ),
}));
```

Global `fetch` stubbing with response factories (`src/features/dashboard/status-overview.test.tsx`):
```typescript
const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);
fetchMock.mockResolvedValueOnce(createStatusResponse(createSnapshot()));
```

Fake timers for polling/backoff logic — driven by helpers that wrap `vi.advanceTimersByTime` in `act` (`src/features/dashboard/status-overview.test.tsx`):
```typescript
async function advancePollingTime(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
    await Promise.resolve();
    await Promise.resolve();
  });
}
```

**What to Mock:**
- The database layer (`vi.mock("../db", ...)`) so server tests stay hermetic and don't need `DATABASE_URL`.
- External transports: `fetch` (via `vi.stubGlobal`), SSH (`node-ssh`), email senders.
- TanStack Router primitives (`Link`, `redirect`) when testing isolated components or loaders without a router instance (`src/lib/session.test.ts`, `src/features/servers/server-list.test.tsx`).
- Time and timers when exercising polling, backoff, or heartbeat logic.

**What NOT to Mock:**
- Drizzle schema objects — tests import the real `installEvents`, `installs` tables and use them as discriminators inside mock implementations (`server/install/sse-stream.test.ts:3`). Don't replace the schema with stubs.
- Pure helpers under test (e.g. `buildHermesComposeContent`, `normalizeInstallStatus`) — call the real implementation and assert on output / snapshots.
- React Testing Library queries / `screen` — use them directly, no wrappers.

## Fixtures and Factories

**Test Data:**
- Local factory functions defined at the bottom of each test file, returning fully-typed objects with sensible defaults and an `overrides?: Partial<T>` spread (`src/features/servers/server-list.test.tsx`):
```typescript
function createServer(overrides?: Partial<ServerListSummary>): ServerListSummary {
  return {
    id: "server_123",
    label: "Production VPS",
    host: "203.0.113.10",
    status: "connected",
    osName: "Ubuntu",
    osVersion: "24.04",
    supportLevel: "supported",
    installStatus: "succeeded",
    installUpdatedAt: "2026-05-26T04:00:00.000Z",
    lastActionAt: "2026-05-26T05:00:00.000Z",
    lastActivityAt: "2026-05-26T05:00:00.000Z",
    ...overrides,
  };
}
```
- Response helpers wrap the global `Response` for fetch mocks (`createStatusResponse`, `createErrorResponse` in `src/features/dashboard/status-overview.test.tsx`).
- IDs in fixtures follow the same `entity_xxx` shape used by `gen_random_uuid()::text` columns (`server_123`, `install_123`, `session_123`, `user_123`) so tests read like real data.

**Location:**
- In-file. There is no shared `tests/fixtures/` or `test-utils/` directory. If a factory is reused across files, copy it locally rather than introducing a shared module — that matches the current convention.

## Coverage

**Requirements:** None enforced. There is no `coverage` block in `vite.config.ts`, no `@vitest/coverage-*` package in `package.json`, and CI does not gate on coverage.

**View Coverage:**
```bash
# Not configured. To experiment locally, install a provider first:
bun add -d @vitest/coverage-v8
bunx vitest run --coverage
```

## Test Types

**Unit Tests:**
- Cover pure helpers and small modules: `server/compose.test.ts` (template rendering with snapshots), `server/lib/insert-audit-log.test.ts`, `src/lib/ai-providers.test.ts`, `src/lib/session.test.ts`. They mock external dependencies and assert exact outputs.

**Integration Tests:**
- "Integration" in this repo means exercising a module against mocked I/O boundaries — DB calls mocked at the `getDb()` seam, SSH mocked, but the real Hono handler / workflow runs end-to-end. Examples: `server/app.test.ts`, `server/install.test.ts`, `server/dashboard.test.ts`, `server/server-actions.test.ts`, `server/telegram.test.ts`, `server/install/workflow.test.ts`.
- Component "integration" tests render a real React feature with mocked router/fetch: `src/features/dashboard/status-overview.test.tsx`, `src/features/servers/connection-wizard.test.tsx`, `src/features/servers/install-progress.test.tsx`.

**E2E Tests:** Not used. No Playwright/Cypress/Puppeteer dependency. Browser-level verification is manual against `bun run dev` (port 3000 per `AGENTS.md`).

## Common Patterns

**Async Testing:**
```typescript
// Promise-returning helpers: assert on the resolved/rejected value directly.
await expect(
  requireSession("/dashboard", async () => null as never),
).rejects.toEqual({ to: "/login", search: { redirect: "/dashboard" } });

await expect(
  requireSession(undefined, async () => session as never),
).resolves.toEqual(session);
```

For React polling/SSE flows, drive time with fake timers wrapped in `act` (see `advancePollingTime` / `flushAsyncWork` in `src/features/dashboard/status-overview.test.tsx`).

**Error Testing:**
- For HTTP handlers, exercise the handler with a stub `Context`, then assert the `Response` status and JSON body returned by `context.json({ error: "..." }, status)` — e.g. unauthorized (401), conflict (409), validation (400).
- For helpers that throw, use `await expect(fn()).rejects.toThrow(...)` or `.rejects.toEqual(...)` when matching a structured payload (as in `src/lib/session.test.ts`).
- For UI error states, assert the rendered message and retry affordance: `expect(screen.getAllByText(/unable to load/i)).toHaveLength(5)`, `expect(screen.getAllByRole("button", { name: /retry/i })).toHaveLength(5)`.

**Snapshot Testing:**
- Used for stable text artifacts only — currently `buildHermesComposeContent` in `server/compose.test.ts` with snapshots stored in `server/__snapshots__/compose.test.ts.snap`. Pair each `toMatchSnapshot()` with structural assertions (e.g. `parse(result)` then `.toEqual(expect.arrayContaining([...]))`) so a snapshot drift still surfaces the meaningful diff.

---

*Testing analysis: 2026-06-02*
