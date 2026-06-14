# Plan 003: Host-key pinning fails closed on credential-bearing SSH operations

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in "STOP conditions" occurs, stop and report — do not improvise.
> When done, update the status row for plan 003 in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 29c3b46..HEAD -- server/ssh/connection.ts server/ssh/connection.test.ts`
> If either file changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch, treat
> it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: MED
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `29c3b46`, 2026-06-14

## Why this matters

Every SSH operation that runs **after** a server is first registered (deploy,
server actions, web-ui proxy, Telegram model switch, dashboard metrics)
transmits decrypted credentials and bot tokens to the remote host. These
sessions are meant to be protected by host-key pinning. But the verifier
**fails open**: when the expected fingerprint is absent it accepts *any*
presented host key. Callers pass `expectedFingerprint: record.hostKeyFingerprint ?? undefined`,
and `host_key_fingerprint` is a nullable column — so any row with a null
fingerprint silently disables MITM protection on credential-bearing sessions.
The intended design (per the code comment) is: tolerate missing pin only on the
*first* connect, enforce on update/deploy/action paths. This plan makes the
non-initial paths fail closed.

## Current state

`server/ssh/connection.ts` — the verifier (lines ~72–87) returns `true` for any
key when `expectedFingerprint` is falsy:

```ts
// server/ssh/connection.ts  (inside establishSshConnection)
hostVerifier: (rawKey: Buffer) => {
  const observed = fingerprintFromKeyBuffer(rawKey);
  capturedHostKey = observed;
  if (
    input.expectedFingerprint &&
    !fingerprintsMatch(observed.fingerprint, input.expectedFingerprint)
  ) {
    throw new SshConnectError("host key mismatch", "host_key_mismatch", observed);
  }
  return true; // <-- fail-open when expectedFingerprint is undefined
},
```

`SshConnectionInput` (lines ~14–21) — `expectedFingerprint` is optional, and
there is **no flag distinguishing first-connect from a pinned operation**:

```ts
export type SshConnectionInput = {
  host: string;
  port: number;
  username: string;
  authMethod: SshAuthMethod;
  credential: string;
  expectedFingerprint?: string;
};
```

The module already exports two entry points:
- `establishSshConnection(input)` / `verifyServerConnection(...)` — used by the
  **first-connect** flow (`server/servers.ts` connect/accept-host-key), where no
  pin exists yet. These MUST keep tolerating a missing fingerprint.
- `withSshConnection(input, run)` — used by **post-registration** operations.
  Confirmed callers passing `?? undefined`:
  - `server/server-actions.ts:231` (restart/update/rollback)
  - `server/telegram.ts:232` and `server/telegram.ts:369` (deploy / model switch)
  - `server/web-ui/handlers.ts:123` (web-ui proxy)
  - `server/dashboard/metrics.ts` (live metrics)

The DB column is nullable: `server/db/schema.ts` (~line 124)
`host_key_fingerprint` is `text(...)` with no `.notNull()`.

### Design intent (from the existing comment in `connection.ts`)

> "...tolerate first-time connects to store the fingerprint, and enforce pinning
> on update/deploy/action paths."

The fix should encode that intent explicitly rather than relying on whether a
caller happened to pass a fingerprint.

### Conventions to follow

- `SshConnectError` (from `./errors`) is the established error type with a
  string `code` (e.g. `"host_key_mismatch"`). Reuse it; add a new code like
  `"host_key_missing"` for the fail-closed case.
- Tests live in `server/ssh/connection.test.ts` (already exists and mocks
  `node-ssh`). Match its harness: it stubs `NodeSSH` and drives
  `config.hostVerifier?.(hostKeyBuffer)`. Use `buildEd25519WireKey()` from
  `./__tests__/build-ed25519-wire-key` to produce a real wire key.

## Commands you will need

| Purpose   | Command | Expected on success |
|-----------|---------|---------------------|
| Run test  | `bun run test server/ssh/connection.test.ts` | all pass |
| Typecheck | `bun run typecheck` | exit 0 |
| Lint      | `bunx @biomejs/biome check server/ssh/` | exit 0 |
| Find callers | `grep -rn "hostKeyFingerprint ?? undefined" server/` | lists the call sites |
| Full test | `bun run test` | all pass |

## Scope

**In scope**:
- `server/ssh/connection.ts` — add an explicit "require pin" mode to the
  verifier / input and make `withSshConnection` callers enforce it.
- `server/ssh/connection.test.ts` — add fail-closed coverage.
- The `withSshConnection` call sites listed above — pass the new "pinning
  required" intent (see Step 2).

**Out of scope** (do NOT change behavior):
- First-connect / accept-host-key flow in `server/servers.ts` — must still allow
  a missing fingerprint (that's how the pin gets stored). Do not make
  `verifyServerConnection` fail closed.
- DB schema / migrations — backfilling + `NOT NULL` on the column is a separate,
  larger change (see Maintenance notes). Do NOT add a migration in this plan.

## Git workflow

- Branch: `advisor/003-host-key-fail-closed`
- Commit per logical unit (verifier change, then caller updates) or one commit;
  conventional commits, e.g.
  `fix(ssh): fail closed when host-key pin missing on credential ops`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Add an explicit "require pin" mode to the verifier

In `server/ssh/connection.ts`, add an optional field to `SshConnectionInput`,
e.g. `requireHostKeyPin?: boolean` (default falsy = current first-connect
behavior). Update the `hostVerifier` so that when `requireHostKeyPin` is true and
`expectedFingerprint` is missing/empty, it throws instead of returning `true`:

```ts
hostVerifier: (rawKey: Buffer) => {
  const observed = fingerprintFromKeyBuffer(rawKey);
  capturedHostKey = observed;
  if (input.requireHostKeyPin && !input.expectedFingerprint) {
    throw new SshConnectError(
      "host key pin required but not stored",
      "host_key_missing",
      observed,
    );
  }
  if (
    input.expectedFingerprint &&
    !fingerprintsMatch(observed.fingerprint, input.expectedFingerprint)
  ) {
    throw new SshConnectError("host key mismatch", "host_key_mismatch", observed);
  }
  return true;
},
```

Keep the existing `capturedHostKey` re-throw logic in the `catch` block intact.

**Verify**: `bun run typecheck` → exit 0.

### Step 2: Make post-registration callers require the pin

For each `withSshConnection` caller that passes
`expectedFingerprint: record.hostKeyFingerprint ?? undefined`, add
`requireHostKeyPin: true` to the same input object. Locate them with:
`grep -rn "hostKeyFingerprint ?? undefined" server/`

Expected sites: `server/server-actions.ts`, `server/telegram.ts` (two),
`server/web-ui/handlers.ts`, `server/dashboard/metrics.ts`. For each, the
session now fails closed if the stored fingerprint is null.

**Important**: Do NOT add `requireHostKeyPin: true` to the first-connect path
(`verifyServerConnection` / `server/servers.ts`). If a caller is ambiguous
(unclear whether it's first-connect or a pinned op), STOP and report rather than
guessing.

**Verify**: `grep -rn "requireHostKeyPin: true" server/` lists the post-connect
call sites and NOT the first-connect flow.

### Step 3: Add fail-closed tests

In `server/ssh/connection.test.ts`, add cases:
1. With `requireHostKeyPin: true` and **no** `expectedFingerprint`,
   `withSshConnection(...)` rejects with `code: "host_key_missing"`.
2. With `requireHostKeyPin: true` and a **matching** `expectedFingerprint`,
   the connection succeeds (run callback executes).
3. Without `requireHostKeyPin` (default) and no fingerprint, the connection
   still succeeds (first-connect behavior preserved — regression guard).

**Verify**: `bun run test server/ssh/connection.test.ts` → all pass.

### Step 4: Run the full gate

**Verify**:
- `bun run typecheck` → exit 0
- `bunx @biomejs/biome check server/ssh/` → exit 0
- `bun run test` → all pass

## Test plan

- New cases in `server/ssh/connection.test.ts` (existing file): fail-closed on
  missing pin, success on matching pin with `requireHostKeyPin`, and the
  preserved default-allow first-connect path.
- Structural pattern: the existing `describe("withSshConnection host key
  fingerprint", ...)` block in the same file.
- Verification: `bun run test server/ssh/connection.test.ts` → all green.

## Done criteria

ALL must hold:

- [ ] `establishSshConnection`'s verifier throws (`host_key_missing`) when
      `requireHostKeyPin` is set and no fingerprint is stored
- [ ] Every `withSshConnection` post-registration caller passes
      `requireHostKeyPin: true`; the first-connect flow does NOT
- [ ] `grep -rn "requireHostKeyPin: true" server/` shows exactly the
      post-connect call sites
- [ ] New tests cover fail-closed, matched-pin success, and first-connect
      default-allow; all pass
- [ ] `bun run typecheck` exits 0
- [ ] `bunx @biomejs/biome check server/ssh/` exits 0
- [ ] `bun run test` passes (no regressions, including existing
      `server/servers.test.ts`)
- [ ] `plans/README.md` status row for 003 updated to DONE

## STOP conditions

Stop and report (do not improvise) if:

- `server/ssh/connection.ts` no longer matches the "Current state" excerpt
  (drift).
- A `withSshConnection` caller is ambiguous about first-connect vs. pinned
  operation — report it instead of guessing.
- Enabling fail-closed makes an **existing** test fail in a way that implies live
  data has null fingerprints on operational rows (this would mean real servers
  break — report so the operator can backfill before enforcing).
- The change appears to require a DB migration to be correct — that's out of
  scope; report it.

## Maintenance notes

- This is a code-level fail-closed at the call sites. The durable fix is to
  **backfill** `host_key_fingerprint` for all existing rows and add `.notNull()`
  to the column (separate migration plan) so a null is unrepresentable. Until
  then, a row with a null fingerprint will now error on operations — that's the
  intended safer behavior, but operators may need to re-run connect to store the
  pin.
- A reviewer should confirm the first-connect path is untouched (otherwise users
  can never register a new server) and that no credential is logged in the new
  error path.
- If a future caller of `withSshConnection` is added for a credential-bearing
  op, it must set `requireHostKeyPin: true`.
