# Plan 005: Drop plaintext fallback in decryptApiServerKey

| Field | Value |
|---|---|
| Status | pending |
| Category | security / tech-debt |
| Audit finding | #5 (priority) |
| Audit SHA | `8ff4b72` |
| Depends on | none |

## Why

`server/crypto.ts:46-54` `decryptApiServerKey` returns the raw input
unchanged when it contains no `.`. The pattern is intended for legacy
plaintext keys (when the column held unencrypted strings before the
AES-256-GCM refactor landed), and it works for that case. But it also
silently "decrypts" to plaintext any garbage input that happens to be
free of dots — including:

- Corrupted bytes that should have errored but instead return
  nonsense as a "key".
- Misclassified input from a future column migration where someone
  stored a placeholder string by accident.
- A row where encryption silently failed but wrote something to the
  column anyway.

The fallback also means an attacker who can manipulate
`aiProviders.encryptedApiKey` (via internal tooling, a SQL injection
bug, a future migration that mis-binds a column) sees their crafted
plaintext treated as the API key material — versus the safer decrypt
that throws.

This plan removes the silent fallback and surfaces plaintext reads as
auditable warning events, so existing operators running legacy
credentials see a clear signal to migrate before the next step
(which would outright reject the plaintext).

## Recon (do not re-derive)

- `decryptApiServerKey` is the only caller-facing decrypt wrapper
  with the legacy fallback. `decryptSecret` does not have it.
- Callers of `decryptApiServerKey`: `server/providers/records.ts:62`
  (returns `""` on failure — used in `server/telegram.ts:testTelegramBot`
  and `server/deploy.ts:deployProviderToHermes`), `server/telegram.ts` via
  `decryptApiServerKey(record.apiServerKey)`.
- Audit log helper: `server/lib/insert-audit-log.ts` already exists.
- This is a SECURITY-adjacent change. Coordinate with operators
  before merging — running legacy unencrypted keys should fail loud
  but not brick a production deploy.

Build commands:
- `bun run typecheck`
- `bun run test -- server/crypto.test.ts server/telegram.test.ts server/deploy.test.ts`

## Files in scope

- `server/crypto.ts` — remove the silent plaintext fallback in
  `decryptApiServerKey`. Replace with: try `decryptSecret`; on
  failure, log a structured warning (use `server/lib/logger.ts`,
  pino); if the input contains no `.` AND the audit-log is wired,
  also insert an `audit_logs` row recording the legacy plain read.
- `server/lib/insert-audit-log.ts` will be reused. No schema change.
- `server/crypto.test.ts` — replace the existing test that asserts
  the legacy plaintext round-trips. Add a test that asserts the
  fallback now throws (or otherwise returns a non-plaintext signal).

## Files explicitly out of scope

- `server/providers/records.ts` — does not need changes; the result
  `ok: false` from `decryptStoredApiKey` is already what callers
  branch on.
- Anything in `client/`.
- The wire format (no change to `decryptSecret` / `encryptSecret`).

## Current state at `8ff4b72`

`server/crypto.ts:46-54`:

```ts
export function decryptApiServerKey(payload: string): string {
  if (!payload) {
    return "";
  }
  try {
    return decryptSecret(payload);
  } catch {
    // Legacy unencrypted keys don't have the AES-GCM iv:tag:cipher structure
    if (!payload.includes(".")) {
      return payload;
    }
    throw new Error("API server key could not be decrypted.");
  }
}
```

The `try { return decryptSecret(payload); } catch { … }` swallows
the original error and substitutes a plain `return`. The catch is
the entire problem.

## Plan

Run in order; each step has a verification command.

1. **Add a structured warning for legacy plaintext reads.**

   In `server/crypto.ts`, import the project logger
   (`server/lib/logger.ts`) and the audit-log helper
   (`server/lib/insert-audit-log.ts`). Add a helper that, on a
   payload without `.`, logs a single warning and inserts one
   audit-log row keyed off the user record if a userId is in
   scope. Note: `decryptApiServerKey` does not currently know the
   userId. The minimum-invasion form is: log to the project logger
   only. The `userId` plumbing is a separate plan.

   Verify: `bun run typecheck`.

2. **Replace the silent return with a structured failure.**

   New behavior:

   ```ts
   export function decryptApiServerKey(payload: string): string {
     if (!payload) return "";
     try { return decryptSecret(payload); }
     catch (err) {
       if (!payload.includes(".")) {
         logger.warn(
           { kind: "decrypt", payloadLength: payload.length },
           "decryptApiServerKey received a legacy plaintext API server key — refusing to use as credential",
         );
         throw new Error(
           "API server key is in legacy plaintext format and cannot be decrypted; the operator must re-save it via /api/providers.",
         );
       }
       throw err;
     }
   }
   ```

   This changes error semantics from "return plaintext" to "throw".
   Callers already treated decryption failure as a failure path
   (`server/providers/records.ts:53` returns `ok: false` →
   `server/telegram.ts:testTelegramBot` and `server/deploy.ts`
   respond 5xx on `""`).

   Verify: typecheck.

3. **Update `server/crypto.test.ts`.**

   Replace any test that exercised the legacy-plaintext return-as-
   same value. The new test should assert:

   - `decryptApiServerKey("")` → `""`.
   - `decryptApiServerKey("not.a.valid.aes.payload")` → throws
     (`expect(() => decryptApiServerKey("…")).toThrowError(/could not be decrypted/)` or whatever
     the lifted error reads).
   - `decryptApiServerKey("legacy-plaintext-without-dot")` → throws
     a **different** error matching the new "legacy plaintext" message.
   - `decryptApiServerKey(validIv.Tag.Cipher)` → returns the
     plaintext.

   Verify: `bun run test -- server/crypto.test.ts` passes with the
   new test cases.

4. **Audit the callers' error paths handle the new throw.**

   `server/providers/records.ts:62` `decryptApiKey` calls
   `decryptStoredApiKey` which calls `decryptApiServerKey`. If the
   latter now throws on legacy plaintext, the existing try/catch in
   `decryptStoredApiKey` (line 55-69) catches and returns
   `{ ok: false }`. `decryptApiKey` (line 71) then returns `""`,
   which callers branch on.

   Verify this by reading `server/telegram.ts:testTelegramBot`
   (line ~248) where the empty-string branch is already handled.
   No code change needed.

   If a caller does NOT handle `""`, the audit returns a finding
   the executor must surface — STOP and report rather than
   silently swallowing.

   Verify: typecheck + targeted tests.

5. **Final pass.**

   `bunx @biomejs/biome check . && bun run typecheck && bun run test`.

   Verify: clean.

## Tests

`server/crypto.test.ts` already has the round-trip shape. Add:

- An empty input → `""` case.
- A valid AES-GCM payload round-trip (preserve existing).
- A non-dot input → throws with the **new** error message about
  legacy plaintext.
- A dot-but-not-base64 input → throws (preserve the existing
  behavior; just confirm the new code throws the same type of
  error).

## Done criteria

- `server/crypto.ts:46-54` no longer silently returns plaintext.
- `server/crypto.test.ts` updated; targeted tests green.
- Typecheck and lint clean.
- A short note added to the operator runbook (CONTEXT.md is fine —
  add a "Legacy plaintext API server key" subsection) so deployers
  know what to expect.

## Maintenance note

Operators running with legacy plaintext keys will see an HTTP 500
on "Test" or model deploy until they re-save the provider. This is
correct — silent acceptance was the bug. Track the right way to
re-save in CONTEXT.md or a follow-up UI change.

The next step after this plan is to **remove the warning entirely**
and just throw without logging — making the legacy path an explicit
error and not even distinguishable from a corrupted ciphertext. That
can land in a follow-up release once operators have had at least one
release cycle to re-save.

## Escape hatches

- If the existing `decryptApiServerKey` signature is depended on by
  callers that expect a string return (never throw) — STOP and
  surface. The change from "return plaintext" to "throw" is a
  semantic break; callers should already handle thrown errors via
  the surrounding try/catches. Verify with `bun run test --
  server/` — any new failure indicates a caller that needs
  fixing.
- If the logger import is awkward (cyclic import with
  `server/deploy.ts` etc.): import lazily inside the function
  (`const { logger } = await import("./lib/logger")`) — last
  resort.
