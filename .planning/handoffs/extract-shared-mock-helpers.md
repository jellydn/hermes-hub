# Follow-up: Extract shared test mock helpers

## Problem
11 route test files under `src/routes/` share near-identical patterns:
- `vi.mock("@tanstack/react-router")` with the same `MockLink` and `createFileRoute` setup
- `vi.mock("#/lib/session")` with the same `requireSession` mock
- `(Route as unknown as { component?: { name: string } })` type assertions
- `vi.mocked(getAuthSession).mockResolvedValue(...)` with `as unknown as NonNullable<...>`

These patterns were unified in the `as never` → typed replacement cleanup, but each file still carries a full copy of the boilerplate.

## Proposed solution
Create `src/test-helpers/route-mocks.ts` with factory functions:
- `createMockLink()` — returns a properly-typed `MockLink` component
- `createMockFileRoute()` — returns a route with `options`, `component`, `validateSearch`, etc.
- `createMockSessionResolver()` — returns a `requireSession`/`getCurrentSession` mock
- `mockRouteComponentName(route, expectedName)` — replaces the verbose `(Route as unknown as ...)` pattern

This would:
1. Delete the `as never` / `NonNullable<Awaited<...>>` type assertions from all 11 files
2. Make mock contracts explicit and testable in one place
3. Reduce ~200 lines of repeated boilerplate across the test suite

## Scope
- 11 route test files: `ai-provider.test.tsx`, `dashboard.test.tsx`, `index.test.tsx`, `login.test.tsx`, `logs.test.tsx`, `servers.$id.install.test.tsx`, `servers.$id.test.tsx`, `servers.index.test.tsx`, `servers.new.test.tsx`, `settings.test.tsx`, `telegram.test.tsx`
- New file: `src/test-helpers/route-mocks.ts`
- New test file: `src/test-helpers/route-mocks.test.ts`

## Priority
Medium — no regression risk, but cleans up the biggest remaining code smell from the `noExplicitAny` cleanup.
