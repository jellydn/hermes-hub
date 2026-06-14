# Plan 005: Credential resolution in `server-records.ts` has direct unit tests

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in "STOP conditions" occurs, stop and report — do not improvise.
> When done, update the status row for plan 005 in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 29c3b46..HEAD -- server/server-records.ts`
> If it changed since this plan was written, compare the "Current state" excerpt
> against the live file before proceeding; on a mismatch, treat it as a STOP
> condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `29c3b46`, 2026-06-14

## Why this matters

`resolveServerCredential` in `server/server-records.ts` is the single chokepoint
that decides, for every SSH operation, whether to **decrypt a stored credential**
or **fetch an ephemeral session credential** — and which "credential
missing/expired" error to surface. It and its wrappers (`resolveServerSshConfig`,
`resolveServerSshConfigOrError`, `normalizeAuthMethod`) are exercised only
indirectly (and mostly mocked) by other tests. A regression here silently breaks
every SSH path (metrics, actions, deploy) or, worse, resolves the wrong
credential. These are pure, easily-tested functions; this plan pins their branches.

## Current state

Relevant functions in `server/server-records.ts` (unchanged at `29c3b46`):

```ts
import { getSessionCredential } from "./credentials";
import { decryptSecret } from "./crypto";

export function resolveServerCredential(
  serverRecord: Pick<OwnedServerRecord, "id" | "encryptedCredential" | "storeCredential">,
  sessionId?: string | null,
) {
  if (serverRecord.storeCredential) {
    if (!serverRecord.encryptedCredential) {
      throw new Error("Stored credential is missing.");
    }
    return decryptSecret(serverRecord.encryptedCredential);
  }
  if (!sessionId) {
    throw new Error("Temporary credential expired. Reconnect the server first.");
  }
  const ephemeralCredential = getSessionCredential(serverRecord.id, sessionId);
  if (!ephemeralCredential) {
    throw new Error("Temporary credential expired. Reconnect the server first.");
  }
  return ephemeralCredential.credential;
}

export function normalizeAuthMethod(authMethod: string): SshAuthMethod | null {
  if (authMethod === "password" || authMethod === "ssh-key") return authMethod;
  return null;
}

export function resolveServerSshConfig(serverRecord, sessionId?) {
  const authMethod = normalizeAuthMethod(serverRecord.authMethod);
  if (!authMethod) throw new Error("Unsupported authentication method.");
  const credential = resolveServerCredential(serverRecord, sessionId);
  return { authMethod, credential };
}

export function resolveServerSshConfigOrError(serverRecord, sessionId):
  | { ok: true; authMethod: SshAuthMethod; credential: string }
  | { ok: false; error: string } {
  try {
    const config = resolveServerSshConfig(serverRecord, sessionId);
    return { ok: true, ...config };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Credential unavailable";
    return { ok: false, error: message };
  }
}
```

Key facts for the tests:
- Mock `decryptSecret` (from `./crypto`) and `getSessionCredential` (from
  `./credentials`). Do NOT hit a real DB or real crypto.
- `getSessionCredential(serverId, sessionId)` returns either `undefined` or an
  object with a `.credential` string.
- `getOwnedServerRecord` and `getServerById` (same file) call `getDb()` and are
  **DB-bound** — they are OUT of scope for this plan (would require a live
  database). Test only the pure resolver functions above.

### Conventions to follow

- Co-locate as `server/server-records.test.ts`.
- Vitest, node env. Hoisted-mock idiom: see `server/settings/mcp/secrets.test.ts`
  (it mocks `../../crypto` the same way you'll mock `./crypto` and `./credentials`).
- Provide minimal record objects matching the `Pick<...>` shape (id,
  encryptedCredential, storeCredential, plus authMethod/host/port/username for
  the `resolveServerSshConfig` cases).

## Commands you will need

| Purpose   | Command | Expected on success |
|-----------|---------|---------------------|
| Run test  | `bun run test server/server-records.test.ts` | all pass |
| Typecheck | `bun run typecheck` | exit 0 |
| Lint      | `bunx @biomejs/biome check server/server-records.test.ts` | exit 0 |
| Full test | `bun run test` | all pass |

## Scope

**In scope** (only file you create):
- `server/server-records.test.ts`

**Out of scope** (do NOT modify, and do NOT attempt to test the DB functions):
- `server/server-records.ts` — tests only. If a test reveals a real bug, STOP
  and report.
- `getOwnedServerRecord` / `getServerById` — DB-bound, out of scope.
- `server/crypto.ts`, `server/credentials.ts` — mocked, not modified.

## Git workflow

- Branch: `advisor/005-test-server-records`
- One commit; conventional commits, e.g.
  `test(server-records): cover credential resolution branches`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Create `server/server-records.test.ts`

Mock `./crypto` (`decryptSecret`) and `./credentials` (`getSessionCredential`).
Cases:

`resolveServerCredential`:
1. `storeCredential: true` + `encryptedCredential` present → returns
   `decryptSecret(...)` output; assert `decryptSecret` called with the blob.
2. `storeCredential: true` + `encryptedCredential` null → throws
   `/Stored credential is missing/`.
3. `storeCredential: false` + no `sessionId` → throws
   `/Temporary credential expired/`.
4. `storeCredential: false` + `sessionId` but `getSessionCredential` returns
   `undefined` (expired) → throws `/Temporary credential expired/`.
5. `storeCredential: false` + valid session credential → returns
   `ephemeral.credential`; assert `getSessionCredential` called with
   `(record.id, sessionId)`.

`normalizeAuthMethod`:
6. `"password"` → `"password"`; `"ssh-key"` → `"ssh-key"`; `"x"` → `null`.

`resolveServerSshConfig`:
7. Unsupported `authMethod` → throws `/Unsupported authentication method/`.
8. Valid stored password cred → `{ authMethod: "password", credential }`.

`resolveServerSshConfigOrError`:
9. Success path → `{ ok: true, authMethod, credential }`.
10. Failure path (e.g. missing stored credential) →
    `{ ok: false, error: "Stored credential is missing." }`.

**Verify**: `bun run test server/server-records.test.ts` → all pass (≥10 tests).

### Step 2: Run the full gate

**Verify**:
- `bun run typecheck` → exit 0
- `bunx @biomejs/biome check server/server-records.test.ts` → exit 0
- `bun run test` → all pass

## Test plan

- New file `server/server-records.test.ts` covering all branches of
  `resolveServerCredential`, plus `normalizeAuthMethod`, `resolveServerSshConfig`,
  and `resolveServerSshConfigOrError` (ok + error).
- Structural pattern: `server/settings/mcp/secrets.test.ts`.
- Verification: `bun run test server/server-records.test.ts` → all green.

## Done criteria

ALL must hold:

- [ ] `server/server-records.test.ts` exists and covers stored-present,
      stored-missing, session-missing-id, session-expired, session-valid,
      `normalizeAuthMethod` (all 3), unsupported-method, and both
      `resolveServerSshConfigOrError` branches
- [ ] Tests assert `getSessionCredential` is called with `(record.id, sessionId)`
- [ ] `bun run test server/server-records.test.ts` passes
- [ ] `bun run typecheck` exits 0
- [ ] `bunx @biomejs/biome check server/server-records.test.ts` exits 0
- [ ] `bun run test` passes
- [ ] `git status` shows only `server/server-records.test.ts` added
- [ ] `plans/README.md` status row for 005 updated to DONE

## STOP conditions

Stop and report (do not improvise) if:

- `server/server-records.ts` no longer matches the "Current state" excerpt.
- A test for the documented behavior fails — report it rather than rewriting the
  assertion to pass.
- A case appears to require the DB-bound functions — those are out of scope;
  don't add a DB harness here.

## Maintenance notes

- If the credential model changes (e.g. a third credential source, or a new
  error message), these tests must track it; the error strings are user-facing
  ("Reconnect the server first").
- A reviewer should confirm no real secret values are used as fixtures (use
  obvious placeholders) and that the DB functions were correctly left untested.
- Follow-up deferred: integration tests for `getOwnedServerRecord` /
  `getServerById` once a DB test harness exists.
