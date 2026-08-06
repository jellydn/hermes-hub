# Plan 002: Model-switch success message race

| Field | Value |
|---|---|
| Status | in-progress |
| Category | correctness |
| Audit finding | #2 (priority) |
| Audit SHA | `8ff4b72` |
| Depends on | none |

## Why

After a successful `POST /api/telegram/model-switch` the controller
dispatches `switchSucceeded` which sets `state.message = { type: "success",
text: "Model access switched successfully." }`. Immediately after, the
controller now `await fetchOptions()` (commit `7859750` plus the recent
sequencing change). `fetchOptions` first dispatches `fetchStarted`,
whose reducer currently contains `message: null`. The user only sees the
success message for the milliseconds between the fetch-options dispatch
and React's next render — typically **zero frames** because React 19
batches the two dispatches into one commit.

Net effect: the post-switch feedback banner never visibly appears, even
though the reducer records success correctly.

## Recon (do not re-derive)

- React 19 with `useReducer`; dispatches from the same tick get
  batched per React's automatic batching.
- Per `src/features/providers/model-access-actions.ts:152-188`,
  `deployModelAccess` and friends do not depend on this fix.
- Per `src/features/telegram/telegram-settings.test.tsx`, the regression
  test asserts the post-switch fetch call and the
  `routerSpies.invalidate` call; it does NOT assert on the visible
  message.

Build commands:
- `bun run typecheck`
- `bun run test -- src/features/telegram/`

## Files in scope

- `src/features/telegram/use-model-access-controller.ts`
  (formReducer: change `fetchStarted`, possibly `optionSelected`,
  `modelChanged` if they conflict with this; align with the
  controller's existing message semantics)
- `src/features/telegram/telegram-settings.test.tsx` (extend the
  regression test to assert the success text after the await)

## Files explicitly out of scope

- `src/features/telegram/telegram-model-access-section.tsx` — only
  reads from the controller; no semantics changes needed.
- `src/features/telegram/telegram-settings.tsx` — `useRouter` wiring
  is unrelated.
- Anything outside `src/features/telegram/`.

## Current state at `8ff4b72`

`src/features/telegram/use-model-access-controller.ts`, `formReducer`:

```ts
case "fetchStarted":
  return { ...state, isLoading: true, message: null };       // ← clears success
…
case "optionSelected":
  return { ...state, selectedOptionId: action.optionId,
                    selectedModel: action.model, message: null };
case "modelChanged":
  return { ...state, selectedModel: action.model, message: null };
```

`handleSwitch` (after the sequencing fix):

```ts
dispatch({ type: "switchStarted" });
…
dispatch({ type: "switchSucceeded" });   // sets success message
await fetchOptions();                    // immediately clears it via fetchStarted
onSwitched?.();
```

## Plan

Run in order; each step has a verification command.

1. **Stop `fetchStarted` from clearing `message`.**

   In `formReducer`, change `case "fetchStarted"` so it does NOT touch
   `message`. Reasoning: `fetchStarted` represents the controller
   initiating a refresh of the options list — that's not a user action
   that should dismiss an existing success banner. (The user-action
   clears in `optionSelected` and `modelChanged` already remain
   unchanged; they explicitly model "user changed their mind mid-action,
   clear stale feedback.")

   Result:

   ```ts
   case "fetchStarted":
     return { ...state, isLoading: true };
   ```

   Verify: `bun run typecheck` exits 0. `bun run test --
   src/features/telegram/` should still pass; no semantic change for
   any existing test.

2. **Update the regression test to assert on the visible message.**

   In `telegram-settings.test.tsx`, after the switch click + flush:

   - Assert `screen.getByText(/model access switched successfully/i)`
     truthy.
   - Assert this is true **after** the post-switch refresh has
     resolved (so the previous-rendering bug is genuinely fixed, not
     just observed during the suspicious one-frame window). Use
     `waitFor(...)` if needed; defensive: have the test re-assert
     twice with a small tick between to confirm stability.

   Match the existing pattern in the file. The `flushAsyncWork`
   helper at the bottom of the file is what the existing case uses;
   use it.

   Verify: `bun run test --
   src/features/telegram/telegram-settings.test.tsx` reports the
   regression test passing with the new assertion.

3. **Run typecheck + lint + targeted test.**

   `bun run typecheck && bunx @biomejs/biome check . src/features/telegram/ && bun run test -- src/features/telegram/`

   Verify: clean.

## Tests

Plan adds 1 (or 2) new assertions to the existing regression test in
`telegram-settings.test.tsx`. No new test file needed. The negative
test from audit #8 (failed switch should NOT call invalidate) is a
separate plan — NOT bundled here. Keep this plan's surface minimal.

## Done criteria

- The case `"fetchStarted"` reducer no longer touches `state.message`.
- The existing regression test asserts `Model access switched successfully`
  is still visible **after** the post-switch refresh completes.
- `bun run typecheck` exits 0; `bun run test --
  src/features/telegram/` passes.

## Maintenance note

If anyone adds another reducer case that resets `message` between
operations, they need to ask themselves: "is this a user-initiated
action that should hide the prior banner?" Future feature work in
this controller should preserve that semantics. Add a brief comment
next to `fetchStarted` explaining the non-clearing rationale.

## Escape hatches

- If the regression test is flaky because React batches the dispatches
  even with two distinct awaits (improbable), use `await waitFor(...)`
  with a 500ms timeout instead of `flushAsyncWork`.
- If `optionSelected` / `modelChanged` change to NOT clear `message`
  in some future refactor and the user-facing banner is preserved
  too long: that is a separate UX decision. Do NOT include it here.
