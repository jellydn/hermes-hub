# Plan 008: Negative model-switch test

| Field | Value |
|---|---|
| Status | in-progress |
| Category | test-gap |
| Audit finding | #8 (priority) |
| Audit SHA | `8ff4b72` |
| Depends on | none |

## Why

The regression test added at `src/features/telegram/telegram-settings.test.tsx`
during commit `7859750` covers the **happy path** — a successful
`/api/telegram/model-switch` followed by `router.invalidate()`. It does
NOT cover the failure branch.

The controller's `useModelAccessController.handleSwitch` only calls
`onSwitched?.()` after a successful switch (`switchSucceeded`). But
this contract is enforced only by the human eye reading the source.
Without a regression test, a future refactor that calls
`onSwitched?.()` unconditionally — or that dispatches
`switchSucceeded` on every code path — would silently invalidate the
route loader when the switch failed.

This is the kind of regression test where writing it now is cheap
(5-10 minutes) and saves the maintenance burden of asking "did
breaking change *X* accidentally re-invalidate on failure?" every
time the controller is touched.

## Recon (do not re-derive)

- Existing regression test is at `src/features/telegram/telegram-settings.test.tsx`
  end of `describe("TelegramSettings", …)`.
- It already mocks `useRouter` via the spy hoisted at the top of
  the file.
- `bun.run test -- src/features/telegram` is the targeted test
  command.

## Files in scope

- `src/features/telegram/telegram-settings.test.tsx` (add one new
  `it(…)` case at the end of the existing describe block).

## Files explicitly out of scope

- `src/features/telegram/use-model-access-controller.ts` — no source
  change; the test asserts existing behavior.
- Plan 002/003's changes — independent.

## Current state at `8ff4b72`

The existing regression test (named "refetches the route loader after
a successful model switch") ends with `});` followed by the closing
`});` of the `describe`. The new test goes immediately after it,
before the closing `});`.

The spy is set up via:

```ts
const routerSpies = vi.hoisted(() => ({ invalidate: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ invalidate: routerSpies.invalidate }),
}));
```

Reuse `routerSpies.invalidate.mockClear()` at the start of the new
test to isolate from prior calls.

## Plan

Run in order; each step has a verification command.

1. **Add the negative-case `it(…)`.**

   After the existing "refetches the route loader…" test, append:

   ```ts
   it("does not invalidate the route loader when model switch fails", async () => {
     fetchMock.mockResolvedValueOnce(
       new Response(JSON.stringify({ error: "Server unreachable" }), {
         status: 502,
         headers: { "content-type": "application/json" },
       }),
     );

     routerSpies.invalidate.mockClear();

     render(
       <TelegramSettings
         initialAccess={null}
         initialConfig={{
           botUsername: "hermes_helper_bot",
           botTokenLast4: "1234",
           isActive: true,
           deployedServerHost: "95.111.232.131",
         }}
       />,
     );

     await flushAsyncWork();

     fireEvent.change(screen.getByLabelText(/provider \/ subscription/i), {
       target: { value: "opt-openai" },
     });
     fireEvent.click(screen.getByRole("button", { name: /^switch$/i }));
     await flushAsyncWork();

     // Failure paths must NOT trigger the route-loader invalidation.
     // A successful switch would; a 502 (above) must not.
     expect(routerSpies.invalidate).not.toHaveBeenCalled();
     expect(screen.queryByText(/model access switched successfully/i)).toBeNull();
     expect(fetchMock).toHaveBeenCalledWith(
       "/api/telegram/model-switch",
       expect.objectContaining({ method: "POST" }),
     );
   });
   ```

   Verify: typecheck.

2. **Run targeted test.**

   `bun run test -- src/features/telegram/telegram-settings.test.tsx`.

   Verify: both tests in this file pass; specifically the new
   "does not invalidate the route loader when model switch fails"
   passes.

3. **Final pass.**

   `bunx @biomejs/biome check . && bun run typecheck && bun run test`.

   Verify: clean.

## Tests

This plan **is** a test plan. Listed as a separate item because the
file is the deliverable.

## Done criteria

- New `it(…)` case exists in `telegram-settings.test.tsx`.
- Asserts `routerSpies.invalidate` was not called.
- Asserts the success-banner text is not visible.
- Asserts the fetch to `/api/telegram/model-switch` happened.
- Targeted test pass; full test command clean.

## Maintenance note

If the audit eventually promotes a "every reducer action also fires
`router.invalidate`" architecture, this test becomes obsolete —
update it to assert the new contract explicitly. Until that
architectural change, the "only-on-success" contract is the one to
guard.

## Escape hatches

- If the model's `useRouter` reset leaves prior spies still
  asserting incorrectly between tests (test pollution): wrap the
  assertion body in `expect(routerSpies.invalidate).toHaveBeenCalledTimes(0)`
  rather than `.not.toHaveBeenCalled()`.
- If a future refactor routes the failure case through an
  optimistic update path that does invalidate-on-failure:
  change the assertion to `.toHaveBeenCalledTimes(0)` (intentional,
  contract flipped) and update the contract docs. Do not delete
  this test.
