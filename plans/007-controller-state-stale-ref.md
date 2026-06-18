# Plan 007: Extract `useStaleRef` helper

| Field | Value |
|---|---|
| Status | pending |
| Category | tech-debt |
| Audit finding | #7 (priority) |
| Audit SHA | `8ff4b72` |
| Depends on | none |

## Why

The audit reported "two controllers share a `stateRef.current = state`
pattern" but the working-tree reality is closer to one. `useModelAccessController`
(`src/features/telegram/use-model-access-controller.ts:54-57`) is the
confirmed consumer:

```ts
const stateRef = useRef(state);
stateRef.current = state;
```

`useProviderSettingsController` (`src/features/providers/use-provider-settings-controller.ts`)
does **not** use this pattern — it dispatches directly inside async
handlers and reads from React-rendered state. Brutal honesty: the
audit finding over-indexed on the spec; the actual duplication today is
**one call site**.

Even so: the pattern is tricky. New joiners and auditors will read it
as `useState` semantics. Getting it wrong (e.g., reading the ref AFTER
capture, capturing per-render) silently breaks `handleSwitch`-style
async handlers that must read the *latest* committed state at the
moment they execute.

This plan extracts a small `useStaleRef` hook under
`src/lib/useMountEffect-adjacent.ts` (sibling of `useMountEffect`,
which is also a documented escape hatch). For now only one caller
moves; the rule is "if anyone reaches for the pattern, they import
the helper."

## Recon (do not re-derive)

- `src/lib/useMountEffect.ts` is the documented escape hatch (per
  AGENTS.md). Same file npair makes sense here.
- biome.json disables `useExhaustiveDependencies` on
  `src/lib/useMountEffect.ts`. Plan 003 should have left that
  override in place. This plan does NOT need a similar override —
  a helper hook with `[state]` dep is exhaustive enough that
  biome's default is correct.
- React 19 stable hook API.

Build commands:
- `bun run typecheck`
- `bun run test -- src/features/telegram/`

## Files in scope

- `src/lib/use-stale-ref.ts` (new helper, tiny).
- `src/features/telegram/use-model-access-controller.ts` (use the
  helper).

## Files explicitly out of scope

- `useProviderSettingsController` — does not use the pattern; leave
  it alone.
- New tests for `useProviderSettingsController` (out of scope).
- Refactoring other async handlers across the codebase — not part of
  this plan; the helper is a foundation for them.

## Current state at `8ff4b72`

`src/features/telegram/use-model-access-controller.ts:54-57`:

```ts
const stateRef = useRef<FormState>(state);
stateRef.current = state;
```

Used by `handleSwitch` and `handleTrustAndRetrySwitch` to read latest
state inside async handlers that started on an older commit.

## Plan

Run in order; each step has a verification command.

1. **Create `src/lib/use-stale-ref.ts`.**

   Tiny typed hook. Body:

   ```ts
   import { useRef } from "react";

   /**
    * Returns a ref that always points at the latest committed value of `state`.
    * Useful when an async handler captures `state` in a closure but must read
    * the *latest* state at the moment it executes, not the state at dispatch
    * time. Common case: useReducer handlers started by user action.
    */
   export function useStaleRef<T>(state: T) {
     const ref = useRef(state);
     ref.current = state;
     return ref;
   }
   ```

   Verify: `bun run typecheck`.

2. **Adopt in `use-model-access-controller.ts`.**

   In `src/features/telegram/use-model-access-controller.ts`:

   - Add `import { useStaleRef } from "#/lib/use-stale-ref";` near
     the other `react` imports.
   - Remove `import { useRef } from "react";` if no other useRef
     exists in the file. Verify by reading the file once more after
     the swap.
   - Replace `const stateRef = useRef(state); stateRef.current =
     state;` with `const stateRef = useStaleRef(state);`.

   The `stateRef.current` reads in `handleSwitch` and
   `handleTrustAndRetrySwitch` are unchanged.

   Verify: `bun run typecheck`.

3. **Confirm tests still pass.**

   `bun run test -- src/features/telegram/`. Especially verify the
   regression tests for `model-switch` (plan 002/003 follow-ups) are
   unchanged in behavior.

   Verify: all tests green.

4. **Final pass.**

   `bunx @biomejs/biome check . src/lib/use-stale-ref.ts src/features/telegram/use-model-access-controller.ts && bun run typecheck && bun run test`.

   Verify: clean.

## Tests

No new tests required. The existing controller regression tests
(`telegram-settings.test.tsx`) exercise the path through the ref.

If the executor wants a unit-level test of the helper itself: a
single `it(…)` in `src/lib/use-stale-ref.test.ts` that:
- Renders a component with `useStaleRef` and a state setter.
- Calls the setter via `act(...)`.
- Asserts `ref.current` reflects the new state after the next render.

This file is optional. Match the style of `src/lib/*.test.ts`.

## Done criteria

- `useStaleRef` exported from `src/lib/use-stale-ref.ts`.
- `use-model-access-controller.ts` imports and uses the helper.
- Typecheck and biome clean.
- Existing tests pass.

## Maintenance note

When a new controller needs the "read latest state inside an async
handler" pattern, import `useStaleRef` rather than rolling a local
`useRef`. Document this rule in CONTEXT.md or AGENTS.md under the
existing "React patterns" section.

## Escape hatches

- If the executor finds a second call site already using
  `stateRef.current = state` (it shouldn't, but verify with grep),
  convert it too as part of this same PR. Don't land a partial
  extraction.
- If `biome.json` ever adds a lint for "you probably meant to use
  React state" on the helper, add an override like the
  `useMountEffect.ts` one. For now, biome is fine with the helper.
