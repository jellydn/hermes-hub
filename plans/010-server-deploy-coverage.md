# Plan 010: Server deploy handler coverage

| Field | Value |
|---|---|
| Status | in-progress |
| Category | coverage |
| Audit finding | #10 (priority) |
| Audit SHA | `8ff4b72` |
| Depends on | none |

## Why

The audit reported that critical Hono handlers — `deployProviderToHermes`,
`deployTelegramToServer`, `switchModelProvider`, `connectTelegram`,
`disconnectTelegram`, `testTelegramBot` — lacked direct unit tests.
Reality check (from the README on `server/deploy.test.ts` /
`server/telegram.test.ts` reading the file headers) shows:

- `server/deploy.test.ts` covers HTTP-level check (401 / 400 / 404 /
  500 / 502 paths) on `deployProviderToHermes` (with the actual
  underlying functions mocked).
- `server/telegram.test.ts` likely has shallow tests — 3 describe
  blocks for deploy + connect + switch behaviors.

`server/hermes/runtime/*` has its own rich test suite (`agent-sync.test.ts`,
`container-status.test.ts`, `deploy.test.ts`, `errors.test.ts`,
`gateway.test.ts`). So the audit's claim "server/hermes/runtime/*
lacks tests" was over-broad.

The genuine uncovered gaps are:

1. **`switchModelProvider` host-key recovery branch** — when SSH
   returns a recoverable host-key error, the handler must respond
   with the typed `hostKeyErrorResponse` shape, not a 502 plain
   error. Most existing tests cover happy paths.

2. **`switchModelProvider` transaction-like consistency** —
   `executeModelSwitch` is exercised; the audit_log writes around
   it are not.

3. **`connectTelegram` concurrent connections** — the existing
   `persistTelegramConnection` flips `isActive: false` on the
   previous record, then inserts a fresh row, then writes an
   audit log inside a transaction. A test asserting the chain
   behavior under failure (e.g., insert fails, audit log never
   written) is missing.

This plan adds **targeted** unit tests for these three gaps.
Existing tests are not removed.

## Recon (do not re-derive)

- `server/deploy.test.ts` and `server/telegram.test.ts` exist; read
  before writing.
- `server/hermes/runtime/*` already tested; skip.
- Mock helpers live near each *handler module* — `server/hermes/runtime/test-helpers.ts`
  has `mockSsh`. Use that.
- AGENTS.md notes ADR 0009 single-instance in-memory state — mocks
  for `RateLimiterMemory`, `setInterval` may already exist; check
  if `vi.useFakeTimers` is needed.

Build commands:
- `bun run typecheck`
- `bun run test -- server/deploy.test.ts server/telegram.test.ts`

## Files in scope

- `server/deploy.test.ts` (extend).
- `server/telegram.test.ts` (extend).

## Files explicitly out of scope

- `server/hermes/runtime/*.test.ts` (already comprehensive).
- The handler modules themselves — no source change.
- Integration tests via `src/test-helpers/` — out of scope; that's
  a separate concern.

## Current state at `8ff4b72`

`server/telegram.test.ts` has 3 `describe` blocks (per the bash
grep). `server/deploy.test.ts` has 2. Both focus on HTTP-side
status codes; neither tests the "transaction completeness"
guarantees documented in AGENTS.md:

> **When to use transactions:** When a secondary write
> (e.g., audit log) is coupled to a primary write (e.g., config
> update), and the primary write being committed without the
> secondary would cause an inconsistent or unrecoverable state.

## Plan

Run in order; each step has a verification command.

1. **Read existing tests and pick new cases that extend, not duplicate.**

   Open `server/telegram.test.ts` and `server/deploy.test.ts`. Note
   existing mocks and assertion patterns. Pick three new cases
   total — one per gap above:

   - **Gap 1 (`switchModelProvider` host-key error):** mock the
     SSH path to throw something `isRecoverableHostKeyError`
     recognizes; assert the response is the typed host-key error
     shape (not a 502 with plain `{error: "..."}`).
   - **Gap 2 (`switchModelProvider` audit log on failure):** mock
     the SSH to throw a non-recoverable error; assert
     `insertAuditLog` was called with action
     `telegram.model.switch.failed` and the userId, error captured
     correctly.
   - **Gap 3 (`connectTelegram` transaction integrity):** mock
     `db.transaction` to throw after `persistTelegramConnection`
     has started (e.g. by making `writer.insert` reject); assert
     the prior `update(isActive: false)` was rolled back, i.e.,
     the previous record is still active. Use a real Drizzle
     mock or wrap with `db.transaction` behavior assertion.

   Each case must follow the mock style already in the file.
   If the existing style is high-context (e.g. `vi.mock(...)`
   blocks), copy the exact same shapes.

   Verify: typecheck.

2. **Run targeted tests.**

   `bun run test -- server/deploy.test.ts server/telegram.test.ts`.

   Verify: existing tests still pass; new cases pass.

3. **Coverage check.**

   `bun run test:coverage -- server/telegram.ts server/deploy.ts` (or
   whatever shape matches the coverage setup in `vite.config.ts`).
   Verify: line coverage on those two files rises. The audit
   ceiling was 45%; this plan probably doesn't need to push it
   higher, but the new cases should measurably improve the
   per-file coverage. If coverage drops, STOP.

4. **Final pass.**

   `bun run coverage` (or `bun run test:coverage`) + `bun run typecheck`.

   Verify: clean. Coverage threshold at 45% met.

## Tests

This plan **is** a test addition. Per the gaps above, three new
`it(…)` cases are added. Place them in the same `describe` block as
the existing handler-level tests so failures point to the right
gap.

## Done criteria

- Three new test cases added across `server/telegram.test.ts`
  (host-key error path) and `server/deploy.test.ts` (audit log
  path, transaction rollback path).
- All targeted tests pass.
- Coverage on the two files visibly rises. If not, STOP and
  surface.
- Typecheck clean.

## Maintenance note

If a handler is added or refactored in `server/telegram.ts` (new
connection modes, OAuth for telegram, etc.), extend the test in the
same PR. The shape is "every handler that mutates DB state has at
least one happy-path and one failure-path test."

## Escape hatches

- If existing mocks in `server/telegram.test.ts` /
  `server/deploy.test.ts` cannot be re-used for the new cases
  without major refactoring: STOP and surface. Do not silently
  rewrite the existing mocks; the audit is about adding coverage,
  not restructuring tests.
- If the SSH / Drizzle / Better Auth mocks for these tests are
  non-trivial to instantiate: a simpler, end-to-end style
  integration test (via `src/test-helpers/`) may achieve higher
  coverage for less code. The executor can flag this and pivot.
  Either way, the goal is line coverage on `server/telegram.ts`
  and `server/deploy.ts`, not the specific test path.
