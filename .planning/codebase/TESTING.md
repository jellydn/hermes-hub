# Testing Patterns

**Analysis Date:** 2026-05-26

## Test Framework

**Runner:** Vitest v4.1.5, configured in `vite.config.ts` via `defineConfig` from `vitest/config`. The `test` object in config sets `environment: "jsdom"`. Run with `bun run test` which executes `vitest run --passWithNoTests` (not `bun test`, which uses Bun's native runner and skips jsdom setup).

**Packages:**
- `@testing-library/react` v16.3.0
- `@testing-library/dom` v10.4.1
- `jsdom` v28.1.0

**Config file:** `vite.config.ts` (shared with Vite build config via `defineConfig`)

## Test File Organization

**Location:** Co-located with source files. Every feature component has a sibling test file in the same directory:

```
src/features/servers/server-detail.tsx
src/features/servers/server-detail.test.tsx
src/features/dashboard/status-overview.tsx
src/features/dashboard/status-overview.test.tsx
src/features/logs/logs-viewer.tsx
src/features/logs/logs-viewer.test.tsx
src/features/providers/provider-settings.tsx
src/features/providers/provider-settings.test.tsx
src/features/telegram/telegram-settings.tsx
src/features/telegram/telegram-settings.test.tsx
```

**Structure:** Feature-based directory grouping under `src/features/<area>/`. No separate `__tests__` directories. No spec files in `lib/`, `components/ui/`, or `routes/`.

## Test Structure

**Suite Organization:** Tests follow a consistent pattern:

```ts
// @vitest-environment jsdom

import { cleanup, render, screen, ... } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SomeType } from "@/lib/some-module";
import { SomeComponent } from "./some-component";

// Mock setup at module scope
const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ ... }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
});

describe("ComponentName", () => {
  it("renders initial state with expected elements", () => { ... });
  it("performs action X and shows result Y", async () => { ... });
  it("handles error state when API returns error", async () => { ... });
});
```

**Key patterns:**
1. `// @vitest-environment jsdom` comment on first line (only in test files, not in config)
2. All imports from `vitest` explicitly listed (`describe`, `expect`, `it`, `vi`, `afterEach`, `beforeEach`)
3. Test doubles/factories at bottom or in separate helper function: `createDetail()`, `createSnapshot()`, `createLogs()`, `fillStepOne()`
4. `it()` descriptions written as present-tense sentences ("renders", "shows", "confirms")

## Mocking

**Framework:** Manual mocking with `vi.fn()` and `vi.stubGlobal()`. No `vi.mock()` for module-level mocking.

**Patterns:**
1. **Fetch mock** — created at module scope and globally stubbed:
   ```ts
   const fetchMock = vi.fn();
   vi.stubGlobal("fetch", fetchMock);
   ```

2. **Default response** — set in `beforeEach` with `mockResolvedValue`:
   ```ts
   fetchMock.mockResolvedValue(
     new Response(JSON.stringify({ status: "connected" }), {
       status: 200,
       headers: { "content-type": "application/json" },
     }),
   );
   ```

3. **Scenario-specific response** — override with `mockResolvedValueOnce` inside individual tests:
   ```ts
   fetchMock.mockResolvedValueOnce(
     new Response(JSON.stringify({ error: "Action failed" }), {
       status: 400,
       headers: { "content-type": "application/json" },
     }),
   );
   ```

4. **Sequential mocks** — chain `mockResolvedValueOnce` calls for tests that need multiple API calls.

5. **Navigator mock** — for clipboard testing:
   ```ts
   const writeText = vi.fn();
   Object.defineProperty(navigator, "clipboard", {
     value: { writeText },
     configurable: true,
   });
   ```

6. **Cleanup** — `vi.clearAllMocks()` in `afterEach` resets all mocks between tests. `cleanup()` from Testing Library unmounts React trees.

**What is NOT mocked:** No MSW, no nock, no `vi.mock()` module-level mocking. No mock service worker. All API interactions go through the stubbed global `fetch`.

## Coverage

**Requirements:** No coverage target configured. No `coverage` section in `vitest.config`. No `--coverage` flag in the `test` script. No `istanbul` or `c8` dependency.

## Test Types

**Unit Tests:** All 7 test files follow the same approach — render a component, simulate user interaction, assert DOM changes and API call verification:

1. **Component rendering tests** — render with props/initial data, assert expected elements are visible:
   - `expect(screen.getByRole("heading", { name: /online/i })).toBeTruthy()`
   - `expect(screen.getByText(/restart agent/i)).toBeTruthy()`
   - `expect(screen.queryByText(/no provider connected/i)).toBeNull()`

2. **User interaction tests** — fire events, assert state transitions:
   - `fireEvent.click(screen.getByRole("button", { name: /restart agent/i }))`
   - `fireEvent.change(screen.getByLabelText(/api key/i), { target: { value: "..." } })`

3. **Async API tests** — wait for async updates with `waitFor`:
   - `await waitFor(() => { expect(screen.getByText(/provider connected/i)).toBeTruthy() })`
   - Verify fetch was called with expected URL and options: `expect(fetchMock).toHaveBeenCalledWith("/api/providers/test", expect.objectContaining({ method: "POST" }))`

4. **Error state tests** — mock API to return error, assert error UI appears:
   - Mock `status: 400` or `status: 502` response
   - Assert error message or retry button is shown
   - Assert specific error recovery flows (retry, dismiss confirmation)

5. **Pure function tests** — only in `install-progress.test.tsx`:
   - Test `mergeInstallSnapshot` for deduplication logic
   - Test `quantizeInstallProgress` for percentage rounding
   - No DOM rendering, no mocking needed

6. **Confirmation dialog tests** — verify inline `ConfirmationCard` flow:
   - Assert confirmation text appears after clicking action button
   - Assert API call only happens after "Confirm" click
   - Assert "Cancel" dismisses dialog without API call

**No snapshot tests, no E2E tests, no integration tests, no storybooks.** Tests focus exclusively on component behavior and state transitions, not visual appearance.
