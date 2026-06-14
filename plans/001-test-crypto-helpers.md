# Plan 001: AES-256-GCM credential crypto helpers have direct unit tests

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in "STOP conditions" occurs, stop and report — do not improvise.
> When done, update the status row for plan 001 in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 29c3b46..HEAD -- server/crypto.ts`
> If `server/crypto.ts` changed since this plan was written, compare the
> "Current state" excerpt against the live file before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests (security-critical)
- **Planned at**: commit `29c3b46`, 2026-06-14

## Why this matters

`server/crypto.ts` is the AES-256-GCM encryption used for all stored SSH
credentials and API server keys (per ADR 0005). It has **zero direct test
coverage**. A regression here means either silent credential leakage (e.g. a
broken auth-tag check accepting tampered ciphertext) or data loss (a broken
round-trip locking users out of every stored server). It is the single
highest-value untested module in the repo. These tests pin the round-trip, the
tamper-rejection, and the deliberate legacy-plaintext fallback so future edits
can't quietly weaken them.

## Current state

`server/crypto.ts` (full module, unchanged at `29c3b46`):

```ts
// server/crypto.ts
const algorithm = "aes-256-gcm";
const ivLength = 12;

function getEncryptionKey() {
  const rawKey = process.env.ENCRYPTION_KEY;
  if (!rawKey) {
    throw new Error("ENCRYPTION_KEY is required");
  }
  return createHash("sha256").update(rawKey).digest();
}

export function encryptSecret(value: string) {
  // returns `${iv}.${authTag}.${ciphertext}` (each base64url)
}

export function decryptSecret(payload: string) {
  const [ivEncoded, authTagEncoded, encryptedEncoded] = payload.split(".");
  if (!ivEncoded || !authTagEncoded || !encryptedEncoded) {
    throw new Error("Encrypted payload is invalid");
  }
  // ... setAuthTag + decipher.final() (throws on tamper)
}

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

Key facts the tests rely on:
- `getEncryptionKey()` reads `process.env.ENCRYPTION_KEY` lazily on **every**
  call (not cached at import) and SHA-256-hashes it to 32 bytes — so a test can
  set/unset `process.env.ENCRYPTION_KEY` per case.
- `encryptSecret` output is three base64url parts joined by `.`.
- `decryptSecret` throws `"Encrypted payload is invalid"` when fewer than 3
  parts; throws (from `decipher.final()`) on a tampered auth tag.
- `decryptApiServerKey("")` returns `""`; a legacy value with **no `.`** is
  returned verbatim; a malformed value **with a `.`** throws
  `"API server key could not be decrypted."`.

### Conventions to follow

- Tests are co-located: create `server/crypto.test.ts`.
- Vitest, `environment: "node"` (no DOM). Import from `vitest`.
- Use real `node:crypto` — **do not mock it**; this is the rare module where
  testing the real implementation is the point.
- Exemplar test structure (imports, `describe`/`it`, `expect`): see
  `server/settings/mcp/secrets.test.ts`. Match its style (but that file mocks
  `../../crypto`; here we test the real thing, so do NOT add a `vi.mock`).
- Manage `process.env.ENCRYPTION_KEY` with `beforeEach`/`afterEach` so cases
  don't leak env state.

## Commands you will need

| Purpose   | Command                                  | Expected on success |
|-----------|------------------------------------------|---------------------|
| Run test  | `bun run test server/crypto.test.ts`     | all pass            |
| Full test | `bun run test`                           | all pass            |
| Typecheck | `bun run typecheck`                      | exit 0, no errors   |
| Lint      | `bunx @biomejs/biome check server/crypto.test.ts` | exit 0     |

## Scope

**In scope** (only file you create):
- `server/crypto.test.ts`

**Out of scope** (do NOT modify):
- `server/crypto.ts` — this plan only adds tests; changing the implementation
  is a separate concern. If a test reveals a real bug, STOP and report.
- Any other file.

## Git workflow

- Branch: `advisor/001-test-crypto-helpers`
- One commit; message style is conventional commits (see `git log`), e.g.
  `test(crypto): add unit tests for AES-256-GCM secret helpers`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Create `server/crypto.test.ts`

Create the file with these cases. Set a deterministic key in `beforeEach`
(e.g. `process.env.ENCRYPTION_KEY = "test-encryption-key"`), restore in
`afterEach`.

Cases (each its own `it`):
1. **round-trip**: `decryptSecret(encryptSecret("hunter2")) === "hunter2"`.
2. **round-trip with unicode / long value**: e.g. a 1KB string and a string
   with multibyte characters round-trips unchanged.
3. **ciphertext shape**: `encryptSecret("x")` splits on `.` into exactly 3
   non-empty parts.
4. **distinct IV**: `encryptSecret("x") !== encryptSecret("x")` (random IV per
   call).
5. **tamper rejection**: take a valid payload, flip a character in the auth-tag
   segment (middle part), expect `decryptSecret(tampered)` to throw.
6. **malformed payload**: `decryptSecret("only.two")` throws
   `/Encrypted payload is invalid/`.
7. **missing key on encrypt**: with `delete process.env.ENCRYPTION_KEY`,
   `encryptSecret("x")` throws `/ENCRYPTION_KEY is required/`.
8. **`decryptApiServerKey("")`** returns `""`.
9. **`decryptApiServerKey` legacy plaintext** (no `.`): a raw string like
   `"legacy-plaintext-key"` is returned verbatim.
10. **`decryptApiServerKey` round-trip**: `decryptApiServerKey(encryptSecret("k"))`
    returns `"k"`.
11. **`decryptApiServerKey` malformed-with-dot**: a value containing `.` that is
    not valid ciphertext (e.g. `"a.b.c"` with garbage base64) throws
    `/could not be decrypted/`.

**Verify**: `bun run test server/crypto.test.ts` → all pass (≥11 tests).

### Step 2: Run the full gate

**Verify**:
- `bun run typecheck` → exit 0
- `bunx @biomejs/biome check server/crypto.test.ts` → exit 0
- `bun run test` → all pass

## Test plan

- New file `server/crypto.test.ts` with the ~11 cases above.
- Structural pattern: `server/settings/mcp/secrets.test.ts` (minus its
  `vi.mock("../../crypto", ...)` — we exercise the real implementation here).
- Verification: `bun run test server/crypto.test.ts` → all green.

## Done criteria

ALL must hold:

- [ ] `server/crypto.test.ts` exists and covers round-trip, tamper rejection,
      malformed payload, missing key, and all three `decryptApiServerKey` branches
- [ ] `bun run test server/crypto.test.ts` passes
- [ ] `bun run typecheck` exits 0
- [ ] `bunx @biomejs/biome check server/crypto.test.ts` exits 0
- [ ] `bun run test` passes (no regressions)
- [ ] `git status` shows only `server/crypto.test.ts` added
- [ ] `plans/README.md` status row for 001 updated to DONE

## STOP conditions

Stop and report (do not improvise) if:

- `server/crypto.ts` no longer matches the "Current state" excerpt (drift).
- A test for the documented behavior **fails** — that means the implementation
  changed or has a real bug; report it rather than rewriting the test to pass.
- The tamper case does NOT throw (would be a real security defect — report it).
- Tests require touching any file other than `server/crypto.test.ts`.

## Maintenance notes

- If `encryptSecret`'s output format changes (e.g. different separator or key
  derivation), these tests must be updated in lockstep — and any change to key
  derivation invalidates all stored credentials (rotation required).
- A reviewer should confirm no real secret values were committed (use obvious
  test fixtures like `"hunter2"`).
- Follow-up deferred: tests for the legacy-plaintext **removal** path once a
  re-encryption migration exists (tracked separately in CONCERNS.md).
