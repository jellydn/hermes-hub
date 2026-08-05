# Plan 001: Magic-link rate limiter email normalization

| Field | Value |
|---|---|
| Status | in-progress |
| Category | security |
| Audit finding | #1 (priority) |
| Audit SHA | `8ff4b72` |
| Depends on | none |

## Why

`server/app.ts:96-114` `applyMagicLinkRateLimit` reads `body.email` from a
cloned JSON request and consumes the in-memory `magicLinkRateLimiter` with
the raw string. There is no `trim`, no `toLowerCase`, no Unicode
normalization. An attacker can submit arbitrary permutations of the same
delivery target (`A@x.com`, `a@X.com`, ` a@x.com`, normalized Unicode forms)
to get **60 magic-link emails per minute** instead of the intended 3 per
5-minute window. Each burst also fetches `sendMagicLinkEmail`, which calls
the configured SMTP transport (`server/lib/send-magic-link-email.ts`) and
therefore *costs the project outbound mail quota*.

This is a textbook email-as-cache-key antipattern. The downstream Better
Auth handler ignores the raw attacker-controlled field and uses its own
normalized form, so we are leaking our limiter without affecting the actual
send.

## Recon (do not re-derive)

Stack: Hono + Bun + Drizzle Postgres + `rate-limiter-flexible` (in-memory
single-instance per ADR 0009).

Build/typecheck/lint/test:
- `bun run typecheck`
- `bun run test -- server/app.test.ts`
- `bunx @biomejs/biome check .`

Per ADR 0009, the limiter is module-level in-memory state and is documented
as not shared across nodes — that's a deliberate constraint, NOT in scope.

`server/app.ts:31-43` defines `magicLinkRateLimiter` once at module top.
Two route handlers call `applyMagicLinkRateLimit`:
`apiApp.post("/auth/send-magic-link", ...)` at `:142` and the
`apiApp.on(["GET", "POST"], "/auth/*", ...)` POST branch at `:172`.

## Files in scope

- `server/app.ts` (modify `applyMagicLinkRateLimit`)
- `server/app.test.ts` (add bypass-cases tests)

## Files explicitly out of scope

- `server/auth.ts` — Better Auth has its own (separate) rate limiting;
changing it is a different concern.
- `server/lib/send-magic-link-email.ts` — touchpoint for the cost, not the
vulnerability.
- Anything rate-limiting-related in client code.

## Current state at `8ff4b72`

`server/app.ts:96-114`:

```ts
async function applyMagicLinkRateLimit(request: Request) {
  let email: unknown = null;
  try {
    const cloned = request.clone();
    const body = (await cloned.json().catch(() => null)) as {
      email?: unknown;
    } | null;
    email = body?.email;
  } catch {
    email = null;
  }

  if (typeof email !== "string" || email.length === 0) {
    return null;
  }

  try {
    await magicLinkRateLimiter.consume(email);
    return null;
  } catch {
    return Response.json(
      {
        error:
          "Too many requests. Please wait 5 minutes before requesting another magic link.",
      },
      { status: 429 },
    );
  }
}
```

## Plan

Run steps in order; each has a verification command.

1. **Normalize the limiter key.**
   Replace `await magicLinkRateLimiter.consume(email);` with a normalized
   key. Compute:

   ```ts
   const normalizedEmail = email.trim().toLowerCase();
   ```

   Then make `applyMagicLinkRateLimit` reject any email where length, after
   trimming, is > `320` characters — RFC 5321 hard cap. Anything beyond that
   is unambiguously hostile.

   Verify: `bun run typecheck` exits 0.

2. **Reject non-string and overlong emails before consuming.**
   Hoist the length check above `.consume(...)`. If `normalizedEmail.length
   === 0 || normalizedEmail.length > 320`, return `null` (do not consume —
   this matches current behavior; we don't want non-string bodies to
   consume and we want overlong inputs to be ignored like today, not to be
   blocked).

   Verify: `bun run test -- server/app.test.ts` should still pass; nothing
   in the existing suite exercises the bypass path.

3. **Add bypass-case tests.** In `server/app.test.ts`, find the existing
   describe block that tests `magicLinkRateLimiter` (or the
   `/api/auth/send-magic-link` POST). Add three new `it(…)` cases inside
   the same describe:

   - Three POSTs with email `A@x.com`, `a@X.COM`, ` a@x.com ` — assert
     the limiter consumed the same key for all three (use a spy on
     `magicLinkRateLimiter.consume`).
   - One POST with a 400-char email — assert `consume` was NOT called and
     the response was 4xx (or pass-through to Better Auth, whatever the
     current behavior for empty email is).
   - Three POSTs in under a minute with normalized permutation — assert
     the **fourth** POST returns 429.

   Match the mock pattern used by the existing tests in the same file
   (look for `createContext` + `vi.stubGlobal("fetch", …)`). Read the
   first ~80 lines of `server/app.test.ts` before writing.

   Verify: `bun run test -- server/app.test.ts` reports 3 new passing
   cases (or whatever the count is — read output) and 0 failures.

4. **Lint + typecheck + full test.**
   Run `bunx @biomejs/biome check . server/app.test.ts`, then
   `bun run typecheck`, then `bun run test -- src/ server/`.

   Verify: lint clean, typecheck clean, all tests pass.

## Tests

In `server/app.test.ts`. Pattern: existing tests construct a `Context`
via a helper (`createContext`); see how `expected status` is asserted.
The new cases need to spy on `magicLinkRateLimiter.consume` directly
(or on its in-memory state via a separate helper) to assert that
case/whanges consume the same key. If spying is awkward, the test
alternative is: hit the rate-limit route 4 times with raw-json bodies
that differ only by casing, and assert the 4th returns 429. That
end-to-end form is easier to write and is what's preferred for this
plan.

## Done criteria

- `bun run typecheck` exits 0.
- `bun run test -- server/app.test.ts` passes including the 3 new
  cases.
- `bunx @biomejs/biome check .` exits 0.
- A select-bit-tests run: with the same-key normalization, the third
  consume on permutations of `a@x.com` now 429s rather than allowing
  a free second slot.

## Maintenance note

If the limiter is migrated to a Redis-backed shared cache later (would
constitute its own ADR), the **same** normalization must apply at both
the client and the cache key layer. Plan should re-state: never mix
normalized/unnormalized keys across instances.

## Escape hatches

- If the existing `app.test.ts` has no helper that mocks fetch and
  you'd otherwise reach into the limiter's private state: STOP and
  take the end-to-end "4th request 429s" form. Do not refactor the
  limiter interface to expose internals just for testing.
- If a third-party caller (Better Auth client SDK or a different
  proxy) sends emails without `trim().toLowerCase()` pre-normalization
  and your tests now 429 them: STOP and surface — Better Auth itself
  should not see a 429 here because the limiter sits *before* the
  auth handler. Verify response layer, do not weaken the limiter.
