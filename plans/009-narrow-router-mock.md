# Plan 009: Narrow `@tanstack/react-router` test mock

| Field | Value |
|---|---|
| Status | in-progress |
| Category | tech-debt |
| Audit finding | #9 (priority) |
| Audit SHA | `8ff4b72` |
| Depends on | none |

## Why

`src/features/telegram/telegram-settings.test.tsx` mocks the entire
`@tanstack/react-router` module:

```ts
vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ invalidate: routerSpies.invalidate }),
}));
```

That's fine today because `TelegramSettings` is the only consumer of
the router in its dependency tree, and the only export it uses is
`useRouter`. The risk is silent breaks: if `TelegramSettings`,
`TelegramModelAccessSection`, or any transitive import starts using
another export (`Link`, `Outlet`, `createFileRoute`, `useNavigate`,
etc.), Vitest will resolve them to `undefined` and the failure mode
is a runtime `TypeError` in a deferred test path — not a useful
diagnostic at the call site.

`vi.mock(name, async () => { const actual = await vi.importActual(name);
return { ...actual, useRouter: vi.fn(...) } })` is the canonical
Vitest pattern for "stub one export, leave the rest real." This
plan applies that pattern.

## Recon (do not re-derive)

- Vitest 3+ uses `vi.importActual` for partial mocks.
- `vi.hoisted` is the right place for shared state used between
  the mock factory and the test body.
- Existing regression tests at `src/features/telegram/telegram-settings.test.tsx`
  (top and bottom of the file) use the current broad mock. Both
  must continue to pass after this change.

Build commands:
- `bun run typecheck`
- `bun run test -- src/features/telegram/`

## Files in scope

- `src/features/telegram/telegram-settings.test.tsx` (modify the
  mock factory and the spy hoisting).

## Files explicitly out of scope

- Any other file in the codebase. This is a single-file mock scope
  fix.
- The router mock logic inside `useTelegramConnect` or other test
  files — those have their own patterns (or no mock, if not relevant).

## Current state at `8ff4b72`

`src/features/telegram/telegram-settings.test.tsx` first lines:

```ts
const routerSpies = vi.hoisted(() => ({
  invalidate: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ invalidate: routerSpies.invalidate }),
}));
```

## Plan

Run in order; each step has a verification command.

1. **Switch to `vi.importActual` partial mock.**

   Replace:

   ```ts
   vi.mock("@tanstack/react-router", () => ({
     useRouter: () => ({ invalidate: routerSpies.invalidate }),
   }));
   ```

   With:

   ```ts
   vi.mock("@tanstack/react-router", async () => {
     const actual = await vi.importActual<typeof import("@tanstack/react-router")>(
       "@tanstack/react-router",
     );
     return {
       ...actual,
       useRouter: () => ({ invalidate: routerSpies.invalidate }),
     };
   });
   ```

   The spy hoisting at the top of the file is unchanged.

   Verify: `bun run typecheck`.

2. **Run targeted tests to confirm no behavior change.**

   `bun run test -- src/features/telegram/telegram-settings.test.tsx`.

   Verify: existing regression test (invalidate IS called on
   success) and new negative test (invalidate NOT called on
   failure, per plan 008) both pass.

3. **Final pass.**

   `bunx @biomejs/biome check . src/features/telegram/telegram-settings.test.tsx && bun run typecheck && bun run test`.

   Verify: clean.

## Tests

This plan converts the mock; existing tests assert correctness.
Specifically, the broad-mock test (anti-regression: spy still
captures the call) and the new negative-case test (plan 008) both
must pass under the new mock form.

If the executor wants belt-and-suspenders coverage: add one extra
`it(…)` that imports `Link` (or `Outlet`) from `@tanstack/react-router`
using a small test wrapper, and asserts the import resolves to the
real implementation not `undefined`. Skippable; the executor can
decide whether the meta-test is worth its weight.

## Done criteria

- Mock factory uses `vi.importActual` partial.
- Spy setup is unchanged.
- All telegram tests pass; existing broad-mock tests pass under the
  partial-mock form.
- Typecheck and biome clean.

## Maintenance note

If a future test file mounts a `<RouterProvider>` and renders the
real router, that file should NOT use `vi.mock("@tanstack/react-router")`
at all. Document this in `src/test-helpers/` if and when that pattern
appears.

If the codebase adds another test file that needs to mock
`useRouter`, copy the partial-mock form from this file, not the
broad-mock shape.

## Escape hatches

- If `vi.importActual` is unavailable (older Vitest): fallback is to
  enumerate the real exports manually:

  ```ts
  vi.mock("@tanstack/react-router", async () => {
    const actual = await vi.importActual("@tanstack/react-router");
    return { ...actual, useRouter: () => ({ invalidate: ... }) };
  });
  ```

  This form is the canonical where supported. If `vi.importActual`
  is *not* exported (unusual), STOP and report — don't silently
  drop the partial-mock requirement.
- If the broad-mock test currently passes but the partial mock
  breaks it with "real router throws because no provider": STOP.
  The bug is in the test, not the mock. Read the failure carefully
  before "fixing" the mock back to the broad form.
