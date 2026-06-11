# Testing Patterns

**Analysis Date:** 2026-06-06

## Test Framework

**Runner:**

- **Vitest** ^4.1.5
- Config: `vite.config.ts` (`test` block inside `defineConfig`)
- Default environment: **`node`** (`vite.config.ts` → `test.environment: "node"`)
- React/component tests opt into **`happy-dom`** via file comment: `// @vitest-environment happy-dom`
- `happy-dom` ^20.10.1 and `jsdom` ^28.1.0 are installed; repo consistently uses `happy-dom` for UI tests.

**Assertion Library:**

- Vitest built-in `expect` (Chai-compatible API)
- No separate assertion library (no Jest, no `@testing-library/jest-dom` matchers beyond DOM queries)

**Run Commands:**

```bash
bun run test                              # Run all tests once (CI default)
VITEST=true vitest                        # Watch mode (not a package.json script)
bunx vitest run --coverage                # Coverage (not configured/enforced in repo)
just test                                 # Wrapper → bun run test
just check                                # Parallel typecheck + test (local only)
just ci                                   # lint → typecheck → test → build
```

**Test script** (`package.json`):

```bash
vitest run --passWithNoTests --reporter=dot
```

- Use `bun run test`, **not** `bun test` (`AGENTS.md`).
- CI runs tests after Biome and typecheck (`.github/workflows/ci.yml`).

## Test File Organization

**Location:**

- **Co-located** with source: tests sit beside the module under test in `src/` and `server/`.
- 65 test files total: ~19 under `src/`, ~46 under `server/`.
- No separate `__tests__/` directories or top-level `tests/` folder.

**Naming:**

- `*.test.ts` for logic/server modules
- `*.test.tsx` for React components and hooks
- No `*.spec.ts` / `*.spec.tsx` files in this repo
- Integration tests named explicitly: `server/web-ui/proxy-http.integration.test.ts`

**Structure:**

```
src/
  lib/
    session.ts
    session.test.ts
  features/
    servers/
      server-detail.tsx
      server-detail.test.tsx
      install-progress.tsx
      install-progress.test.tsx
server/
  app.ts
  app.test.ts
  install/
    sse-stream.ts
    sse-stream.test.ts
  web-ui/
    proxy-http.ts
    proxy-http.test.ts
    proxy-http.integration.test.ts
```

**Include globs** (`vite.config.ts`):

```typescript
include: [
  "src/**/*.{test,spec}.{js,ts,jsx,tsx}",
  "server/**/*.{test,spec}.{js,ts,jsx,tsx}",
],
```

## Test Structure

**Suite Organization:**

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("requireSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to /login when there is no active session", async () => {
    await expect(
      requireSession("/dashboard", async () => null as never)
    ).rejects.toEqual({
      to: "/login",
      search: { redirect: "/dashboard" },
    });
  });
});
```

(Source: `src/lib/session.test.ts`)

**React component pattern:**

```typescript
// @vitest-environment happy-dom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("DashboardStatusOverview", () => {
  it("renders the dashboard cards from the initial snapshot", () => {
    render(<DashboardStatusOverview initialStatus={createSnapshot()} />);
    expect(screen.getByRole("heading", { name: /^online$/i })).toBeTruthy();
  });
});
```

(Source: `src/features/dashboard/status-overview.test.tsx`)

**Patterns:**

- **Setup:** `beforeEach` with `vi.clearAllMocks()`; DB mock chains configured per test in server tests.
- **Teardown:** `afterEach` with `cleanup()` (RTL), `vi.clearAllMocks()`, `vi.useRealTimers()` in component tests.
- **Assertion:** `expect(...).toBe()`, `.toEqual()`, `.toHaveLength()`, `.rejects.toEqual()`, `.rejects.toBeInstanceOf()`; role/text queries via Testing Library (`getByRole`, `getByText`).

## Mocking

**Framework:** Vitest `vi` (`vi.mock`, `vi.fn`, `vi.hoisted`, `vi.stubGlobal`, `vi.spyOn`, `vi.useFakeTimers`)

**Patterns:**

**Hoisted mocks** (required when mocks are referenced inside `vi.mock` factories):

```typescript
const { redirect } = vi.hoisted(() => ({
  redirect: vi.fn((options: unknown) => options),
}));

vi.mock("@tanstack/react-router", () => ({
  redirect,
}));
```

(Source: `src/lib/session.test.ts`)

**Module mocking** (server DB layer):

```typescript
const { dbSelect, dbInsert, dbTransaction } = vi.hoisted(() => ({
  dbSelect: vi.fn(),
  dbInsert: vi.fn(),
  dbTransaction: vi.fn(),
}));

vi.mock("../db", () => ({
  getDb: () => ({
    select: dbSelect,
    insert: dbInsert,
    transaction: dbTransaction,
  }),
}));
```

(Source: `server/install/sse-stream.test.ts`)

**Hono app integration** (`server/app.test.ts`):

- Large `vi.hoisted()` block defining mock fns for every route dependency.
- `vi.mock("./servers", () => ({ connectServer, listServers, ... }))` etc.
- Tests import `apiApp` after mocks and call `apiApp.request(...)`.

**React mocks:**

- `vi.mock("@tanstack/react-router", () => ({ Link: ... }))` — stub `Link` as `<a href={to}>`.
- `vi.mock("lucide-react", () => ({ IconName: MockIcon }))` — SVG stubs for icon-only components.
- `vi.mock("@/components/ui/button", () => ({ Button: ... }))` — lightweight button stub.
- Child component mocks to isolate unit under test: `vi.mock("./server-detail-aside", () => ...)` in `server-detail.test.tsx`.

**Global stubs:**

```typescript
const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);
```

Used in `server-detail.test.tsx`, `status-overview.test.tsx`, and similar client-fetch tests.

**SSH/runtime local mocks** (no `vi.mock`):

```typescript
function mockSsh(
  execImpl?: (cmd: string) => { code: number; stdout: string; stderr: string }
) {
  const execCommand = vi.fn(
    async (cmd: string) =>
      execImpl?.(cmd) ?? { code: 0, stdout: "", stderr: "" }
  );
  return { execCommand };
}
```

(Source: `server/hermes/runtime.test.ts`)

**What to Mock:**

- Database (`getDb`, Drizzle query chains) in server unit tests.
- Auth (`getAuthSession`) and external I/O (SSH, crypto, credentials).
- Router/navigation (`redirect`, `Link`) in frontend tests.
- Heavy UI children and icon libraries when testing layout/behavior.
- `fetch` for components that poll or load via REST (`servers.$id` pattern).

**What NOT to Mock:**

- Pure helpers under test (e.g. `mergeInstallSnapshot`, `quantizeInstallProgress` in `install-progress.test.tsx`).
- Integration paths that validate real protocol behavior — `proxy-http.integration.test.ts` uses a real `Duplex` stream mock, not HTTP client mocks.
- Validation/formatting functions tested directly (`server/hermes/diagnostics-formatting` via `runtime.test.ts`).

## Fixtures and Factories

**Test Data:**

- Inline factory functions at bottom of test files:

```typescript
function emptyForm() {
  const preset = getMcpServerPreset("memory");
  if (!preset) throw new Error("memory preset is required for tests");
  return formStateFromPreset(preset);
}
```

(Source: `src/features/settings/mcp-form-state.test.ts`)

- Snapshot builders in component tests: `createSnapshot()` in `status-overview.test.tsx`.
- Typed fixture objects inline in `it` blocks: `InstallEvent` in `install-progress.test.tsx`.
- Cryptographic fixtures with real hashes in `server/servers.test.ts` (`createHash` for host-key fingerprints).

**Location:**

- No shared `fixtures/` or `test-utils/` directory.
- Helpers are **local to the test file** (`createSnapshot`, `emptyForm`, `mockSsh`).
- Occasionally shared types imported from production code: `ServerDetailSnapshot`, `DashboardStatusSnapshot`.

## Coverage

**Requirements:** None enforced — no `coverage` config in `vite.config.ts`, no `@vitest/coverage-v8` in `package.json`, no CI coverage gate.

**View Coverage:**

```bash
bunx vitest run --coverage   # Would require adding @vitest/coverage-v8 (not present today)
```

## Test Types

**Unit Tests:**

- **Server:** Handler logic, parsing, crypto, Drizzle record mapping, SSH error normalization, install SSE helpers, Hermes CLI command builders (`server/*.test.ts`, `server/hermes/*.test.ts`, `server/install/*.test.ts`).
- **Frontend logic:** Session redirect, form state, install snapshot merging, brand graphics (`src/lib/*.test.ts`, `src/features/**/**.test.ts`).
- Default **node** environment; fast, heavily mocked.

**Integration Tests:**

- Narrow scope: `server/web-ui/proxy-http.integration.test.ts` exercises `proxyHttpOverStream` over a mock TCP `Duplex` with real HTTP framing.
- `server/app.test.ts` tests full Hono routing with mocked backends (route-level integration, not live DB/SSH).
- Named `*.integration.test.ts` only for `proxy-http`; other `app.test.ts`-style tests are integration-ish but not suffix-named.

**E2E Tests:**

- **Not used** — no Playwright, Cypress, or similar in `package.json` or workflows.

## Common Patterns

**Async Testing:**

```typescript
it("proxies a GET response over a forwarded stream", async () => {
  const response = await proxyHttpOverStream({
    request,
    stream,
    upstreamPath: "/app",
  });
  expect(response.status).toBe(200);
  expect(await response.text()).toBe("hello");
});
```

(Source: `server/web-ui/proxy-http.integration.test.ts`)

```typescript
await expect(
  requireSession("/dashboard", async () => null as never)
).rejects.toEqual({ to: "/login", search: { redirect: "/dashboard" } });
```

**Error Testing:**

```typescript
await expect(
  proxyHttpOverStream({ request, stream, upstreamPath: "/" })
).rejects.toBeInstanceOf(WebUiProxyError);
```

(Source: `server/web-ui/proxy-http.integration.test.ts`)

```typescript
expect(getFormValidationError({ ...emptyForm(), timeout: "0" })).toBe(
  "Timeout must be a positive integer."
);
```

(Source: `src/features/settings/mcp-form-state.test.ts`)

**Injectable dependencies for testability:**

```typescript
requireSession("/dashboard", async () => null as never); // inject loadSession
```

(Source: `src/lib/session.test.ts`)

**Drizzle mock chaining:**

- Server tests mock fluent Drizzle API (`select().from().where().orderBy().limit()`) with `vi.fn()` returning `this` or nested objects.
- `server/servers.test.ts` patches `Promise.prototype.limit` via `@ts-expect-error` for legacy chain compatibility.

**Timers:**

- `vi.useRealTimers()` in `afterEach` where fake timers may be used (`status-overview.test.tsx`, `sse-stream.test.ts`).
- `vi.useFakeTimers()` used selectively in time-dependent server tests (`server/install-idle-timeout.test.ts`).

**React Testing Library:**

- `@testing-library/react` ^16.3.0 with `@testing-library/dom` ^10.4.1.
- Queries prefer **roles** and accessible names: `getByRole("heading", { name: /^online$/i })`.
- `act()` wraps async state updates after `fireEvent` or fetch resolution.
- `cleanup()` after each test in component suites.

**Vitest vs Vite plugins:**

- `vite.config.ts` disables TanStack/Tailwind/React plugins when `process.env.VITEST === "true"` so tests run without full app bundling.

## Test Count by Area

| Area                                               | Examples              | Environment |
| -------------------------------------------------- | --------------------- | ----------- |
| `server/app.test.ts`                               | Full API route matrix | node        |
| `server/servers.test.ts`, `server-actions.test.ts` | SSH + DB handlers     | node        |
| `server/install/sse-stream.test.ts`                | Transactions + SSE    | node        |
| `src/features/**/*.test.tsx`                       | UI components         | happy-dom   |
| `src/lib/session.test.ts`                          | Auth redirect         | node        |
| `server/web-ui/proxy-http.integration.test.ts`     | Stream proxy          | node        |

---

_Testing analysis: 2026-06-06_
