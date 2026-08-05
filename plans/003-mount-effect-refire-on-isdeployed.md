# Plan 003: useMountEffect re-fire on isDeployed flip

| Field | Value |
|---|---|
| Status | in-progress |
| Category | correctness |
| Audit finding | #3 (priority) |
| Audit SHA | `8ff4b72` |
| Depends on | none |

## Why

`src/lib/use-mount-effect.ts` is a documented one-shot mount escaper
(biome.json disables `useExhaustiveDependencies` for that file).
`useModelAccessController.ts:78` uses it as:

```ts
useMountEffect(() => {
  if (!isDeployed) return;
  void fetchOptions();
});
```

The intent reads as: "fetch the model-access options the first time
`isDeployed` becomes true." But `useMountEffect` fires **exactly once**
on mount, capturing `isDeployed` at that moment. If `isDeployed` is
`false` on initial mount (the typical Telegram page case — user
arrives without an active deployed Tg bot), the function returns
early and `fetchOptions` is never called.

When the user *subsequently* connects, deploys, and the page re-renders
with `isDeployed = true`, the one-shot hook does not re-fire. The
`<TelegramModelAccessSection>` renders but its dropdown is empty,
`<ModelAccessForm>` falls back to the "Loading saved options…"
state, and the user has to click **Refresh** to populate the dropdown.

This is a real UX regression, not theoretical.

## Recon (do not re-derive)

Per AGENTS.md: "`src/lib/use-mount-effect.ts` is the deliberate
mount-only escape hatch. Keep that override in place if you add more
files in that pattern." So the **helper** stays; this plan changes a
**specific call site** that misuses it.

Build commands:
- `bun run typecheck`
- `bun run test -- src/features/telegram/`

The `useMountEffect` helper is fine and used elsewhere — it stays.

## Files in scope

- `src/features/telegram/use-model-access-controller.ts`
  (replace the `useMountEffect` call with a `useEffect` keyed on
  `[isDeployed, fetchOptions]`)

## Files explicitly out of scope

- `src/lib/use-mount-effect.ts` — don't change it; other consumers
  rely on one-shot semantics.
- `src/features/providers/provider-settings.tsx` — uses a different
  pattern (no `useMountEffect` here); leave it.
- Other controllers — not affected.

## Current state at `8ff4b72`

`src/features/telegram/use-model-access-controller.ts:74-82`:

```ts
useMountEffect(() => {
  if (!isDeployed) {
    return;
  }
  void fetchOptions();
});
```

`fetchOptions` is a stable `useCallback` declared earlier in the
same file (deps `[]`).

## Plan

Run in order; each step has a verification command.

1. **Replace the `useMountEffect` call with `useEffect` on
   `[isDeployed]`.**

   At the import line near the top of the file, swap
   `import { useCallback, useReducer, useRef } from "react";`
   to also include `useEffect`:
   `import { useCallback, useEffect, useReducer, useRef } from "react";`

   Replace:

   ```ts
   useMountEffect(() => {
     if (!isDeployed) {
       return;
     }
     void fetchOptions();
   });
   ```

   With:

   ```ts
   useEffect(() => {
     if (!isDeployed) {
       return;
     }
     void fetchOptions();
   }, [isDeployed]);
   ```

   Note: do not include `fetchOptions` in the deps. Reason: it is a
   stable `useCallback([])`, and including it would trigger an extra
   effect call if its identity changes (it doesn't), but a stable ref
   is also acceptable to include. Pick one convention and stick to
   the simpler "only `isDeployed`" form here.

   Verify: `bun run typecheck` exits 0.

2. **Drop the now-unused `useMountEffect` import.**

   Remove `import { useMountEffect } from "#/lib/use-mount-effect";`
   if no other code in the same file uses it. (Read the file once more
   after the swap to confirm.)

   Verify: typecheck still exits 0.

3. **Add a regression test.**

   Use `react-doctor` lint to confirm the file gets a green light
   (this is part of CI per AGENTS.md; no extra work needed for
   conformance unless biome-format nukes the file — in that case
   run `bunx biome check --write .` and re-run typecheck).

   In `telegram-settings.test.tsx`, add a new `it(…)` that:
   - Renders `<TelegramSettings initialAccess={null}
     initialConfig={{...deployedServerHost: null, isActive: true,
     ...}}>`.
   - Asserts no `model-access-options` fetch has happened yet
     (`fetchMock` not called with that URL).
   - Re-renders with `deployedServerHost: "1.2.3.4"` via `rerender`.
     (Requires lifting `initialConfig` to a state variable OR using
     a wrapper component that updates its prop. The wrapper-component
     pattern is cleaner.)
   - `await flushAsyncWork()`.
   - Asserts `fetchMock` was called with `/api/telegram/model-access-options`.
   - Verify: the new test case passes; existing tests still pass.

   Verify: `bun run test -- src/features/telegram/` shows the new
   case passing.

4. **Run lint + typecheck + test.**
   `bunx @biomejs/biome check . && bun run typecheck && bun run test -- src/features/telegram/`.

   Verify: clean.

## Tests

The new regression test in `telegram-settings.test.tsx` follows the
mount-effect → toggle-isDeployed → fetch-fires shape. It tests the
controller indirectly through `<TelegramSettings>`, matching the
existing regression test pattern (suite uses `vi.stubGlobal("fetch", ...)`
plus `flushAsyncWork`).

If a unit-style direct test of the controller is preferred, the same
flow can be implemented with `renderHook` from `@testing-library/react`,
passing an `isDeployed` prop and asserting `fetchOptions` was called.

## Done criteria

- `useEffect([isDeployed])` replaces `useMountEffect` in the
  controller.
- `useMountEffect` import is removed from `use-model-access-controller.ts`.
- A new test asserts that flipping `isDeployed` from false to true
  triggers `fetchOptions`.
- All telegram tests pass; typecheck and biome clean.

## Maintenance note

`useMountEffect` remains a valid escape hatch for the cases called
out in AGENTS.md (SSE / external subscriptions). Don't refactor
those call sites. This plan's change is *call site*-specific.

If another consumer wants the same "fetch on is* flip" behavior,
copy the pattern here rather than generalizing `useMountEffect`
into something more powerful — keep the escape hatch minimal.

## Escape hatches

- If the regression test needs `rerender` and React Testing Library
  complains about `TelegramSettings` taking a single static
  `initialConfig`: fall back to a tiny wrapper component
  `function Harness({ isDeployed }) { return
  <TelegramSettings initialConfig={isDeployed ? {...deployed} :
  {...notDeployed}} initialAccess={null} /> }` and call
  `rerender(<Harness isDeployed />)`. Same effect; works without
  refactoring `TelegramSettings`.
- If `react-doctor` (via pre-commit) flags the `useEffect` deps
  because `fetchOptions` is omitted: add it to deps
  `[isDeployed, fetchOptions]`. The lint rule is correct — and
  `fetchOptions` being stable means the effect won't re-fire
  unnecessarily.
