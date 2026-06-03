# Thermo-Nuclear Code Quality Review — `fix/concern` branch

**Scope:** `server/ssh/connection.ts`, `server/ssh/host-key-fingerprint.ts`, their tests, `server/install.ts`, `server/install/records.ts`, `server/install/legacy-log.ts`, `server/logs.ts`, `server/servers.ts`, `server/servers/records.ts`, plus the related `.planning/codebase/*` doc refresh.

**Net read of the diff:** the underlying bugs (double-hashed fingerprint, dead `captureHostKey` reading a non-existent `ssh.connection.hostFingerprint`, dangling `IN` clause with no separator, in-place retry losing event history) are real and the fixes are _correct_. Several spots nevertheless leak implementation detail, add ad-hoc state, or paper over a missing canonical helper. The findings below are the structural issues I would want addressed before approval.

---

## P0 — Structural findings (blockers)

### 1. `NodeSshWithHostKey` cast + monkey-patched `ssh.hostKey` is a thin wrapper around a closure that already exists

`server/ssh/connection.ts:30, 45, 59, 79`

```ts
type NodeSshWithHostKey = NodeSSH & { hostKey?: HostKeyInfo };
…
const ssh = new NodeSSH() as NodeSshWithHostKey;
let observedKey: HostKeyInfo | undefined;
…
hostVerifier: (rawKey: Buffer) => {
    const observed = fingerprintFromKeyBuffer(rawKey);
    observedKey = observed;            // ← set in outer closure
    ssh.hostKey = observed;            // ← also set on the instance
    …
},
…
const hostKey = (ssh as NodeSshWithHostKey).hostKey; // read off the instance
if (!hostKey) { throw new Error("Host key fingerprint not available"); }
```

There are now **two** parallel stores for the same value (`observedKey` _and_ `ssh.hostKey`) and **two** unsafe casts on a third-party class. Both stores exist only because the previous code expected a property on `ssh.connection` that doesn't exist; the fix is to stop pretending the third-party class has that property.

**Code-judo move:** keep the host key in the closure it is already captured in, and return it from `withSshConnection` to its caller. Concretely:

- Drop `NodeSshWithHostKey`, the two `as` casts, and the `ssh.hostKey = observed` write.
- Add a `let capturedHostKey: HostKeyInfo | undefined` in `withSshConnection`'s scope (replacing `observedKey`); assign it inside `hostVerifier`.
- Return `{ result, hostKey }` from the inner try / outer try-finally (or wrap the existing `run` callback to also yield the key), and have `verifyServerConnection` read it from the returned value rather than re-fetching it from a casted `ssh`.
- The "Host key fingerprint not available" check then becomes "the verifier was never invoked", which is unreachable in practice — that whole branch collapses.

Net effect: one storage location, no `as` casts, no monkey-patching a vendor class, and the call site in `verifyServerConnection` becomes a direct read of a value the function returned.

### 2. `fingerprintsMatch` strips `=` padding in the wrong layer

`server/ssh/connection.ts:120-130`

```ts
function fingerprintsMatch(actual: string, expected: string): boolean {
    const expectedBuf = Buffer.from(expected.replace(/=+$/, ""));
    const actualBuf = Buffer.from(actual.replace(/=+$/, ""));
    …
}
```

The codebase already has the canonical normalizer for this: `SHA256_FINGERPRINT_PATTERN` in `host-key-fingerprint.ts` (and the test now proves it accepts both forms). Stripping the padding by hand here:

- duplicates the "padded vs no-padding" logic between the regex and this function (and a third place will inevitably appear);
- means every future compare site must remember to do the same strip;
- obscures the invariant ("fingerprints are compared in a canonical, padding-free form") behind a one-off helper.

**Code-judo move:** normalize once, at the boundary where fingerprints enter the system.

- Pick one canonical form (no padding, matching OpenSSH `ssh-keygen -l`) and produce it in `fingerprintFromKeyBuffer` (drop the `=` from `digest("base64")`, e.g. `.digest("base64").replace(/=+$/, "")`).
- Make `fingerprintsMatch` a literal `timingSafeEqual(Buffer.from(a), Buffer.from(b))` with the equal-length guard — no regex.
- Update the stored-shape test in `host-key-fingerprint.test.ts` to expect the no-padding form (and stop the meta-sanity check that asserts the test key has padding, since the test is now tautological).

Bonus: `isValidSha256HostKeyFingerprint` already accepts both forms, so backward compat for stored rows is preserved by the regex without needing the manual strip in `fingerprintsMatch`.

### 3. `acceptHostKey` error string is duplicated as a literal in two places

`server/servers.ts:435` and `server/servers.test.ts:422` both contain the exact same multi-sentence fingerprint error message. A grep for the substring returns the file twice. This is the same anti-pattern the new CONCERNS.md item "Audit-log action name list duplicated in three modules" is calling out, just for a smaller constant.

**Code-judo move:** export a `INVALID_FINGERPRINT_MESSAGE` (or, better, a `describeFingerprintError()` helper) from `server/ssh/host-key-fingerprint.ts` and import it in both files. The test then imports the same constant and can drop the brittle string-equal assertion.

---

## P1 — Architectural drift to address now

### 4. `getLatestServerActionRecords` reaches for `sql.join(..., sql.raw(", "))` to patch a broken query; the whole raw-SQL path is the wrong tool

`server/servers/records.ts:91-128`

The original `IN ${sql.join(...)}` (no separator) was a real bug — `sql.join` defaults to no separator, so the emitted SQL was `IN name1name2name3`. The fix wraps the join in parentheses and threads `sql.raw(", ")` as a separator. The whole call is still hand-rolled raw SQL with three jobs mixed together:

- filtering by `user_id` (Drizzle knows this);
- filtering by an `inArray` of action names (Drizzle has a typed helper for this);
- DISTINCT ON (the only thing that actually needs raw SQL — and even this can be expressed as a window function in a typed select).

**Code-judo move:** drop `getDb().execute(sql\`…\`)` and write the query with the Drizzle builder. The action name list comes from a constant (see #5). Something like:

```ts
const ranked = db
    .select({
        serverId: auditLogs.serverId,
        action: auditLogs.action,
        details: auditLogs.details,
        createdAt: auditLogs.createdAt,
        rowNum: sql<number>`row_number() over (partition by ${auditLogs.serverId} order by ${auditLogs.createdAt} desc)`.as("rn"),
    })
    .from(auditLogs)
    .where(...)
    .as("ranked");

return db
    .select({ … })
    .from(ranked)
    .where(eq(ranked.rowNum, 1));
```

That eliminates the `sql.raw` separator hack, the dangling `IN ()` defensive guard (Drizzle inlines the array), and the empty-serverIds short-circuit (#6).

### 5. The `finishedActionNames` / `relevantServerActionNames` enum is now duplicated in three modules and the new diff adds a fourth

```
server/logs.ts:14                 (array)
server/server-detail-snapshot.ts:20 (Set)
server/servers/records.ts:5        (array, the new diff)
```

The new CONCERNS.md item calls this out explicitly. The diff is the right moment to delete the duplication it just added to, not the moment to grow it.

**Code-judo move:** create `server/audit-log-actions.ts` (or extend `server/constants.ts`) exporting a single `FINISHED_SERVER_ACTION_NAMES = [...] as const` and `SERVER_ACTION_NAME_SET = new Set(FINISHED_SERVER_ACTION_NAMES)`. The three modules become a one-line import. The `relevantServerActionNames` array in `servers/records.ts:5-16` should literally delete itself once it can import the shared list.

### 6. The `serverIds.length === 0` guard is a band-aid over a missing caller contract

`server/servers/records.ts:95-99`

The early-return protects `getLatestServerActionRecords` from emitting `IN ()` when called with an empty list. But the only caller is `servers/list.ts`, which gets its `serverIds` from `getOwnedServerListRecords(userId)` — a user with zero servers will hit this branch and return `[]`, then `getLatestServerActionRecords` is called and short-circuits. The work of fetching `getOwnedServerListRecords` is wasted in that case.

**Code-judo move:** in `servers/list.ts`, branch on the empty list at the call site (skip the audit-log query entirely, similar to how the file already does `Promise.all` between independent fetches). The function then assumes a non-empty `serverIds`, the defensive branch goes away, and the `Promise.all` you already have becomes a `Promise.allSettled` opportunity if you want to be defensive about partial failures (different concern, separate change).

### 7. The legacy `installs.log` column and `parseLegacyLogBlob` should not be a "next concern" — they are now in three places

```
server/install.ts:7, 259, 293   (new)
server/install/legacy-log.ts    (new)
server/logs.ts:12, 122, 176-179 (new)
server/db/schema.ts:143         (column)
server/install/records.ts:23, 43 (writes `log: null`)
```

The new diff added the third and fourth read sites. CONCERNS.md is correct that the column should be backfilled + dropped, but the PR is _expanding_ the dual-path code instead of contracting it. Even if you keep the column, the fallback parsing is now scattered:

- `install.ts:286-293` builds `eventLines` then falls back to `parseLegacyLogBlob` only when the array is empty.
- `logs.ts:158-194` does the same fallback per-install, with extra null-filtering.

**Code-judo move:** collapse both read sites to a single helper, e.g. `getInstallLogLines({installId, legacyBlob, fallbackTimestamp})` returning the string[]. Both call sites become one line, the empty-check logic lives in exactly one place, and the legacy fallback is one `if (!hasEvents) return parseLegacyLogBlob(blob, ts)` instead of two ad-hoc conditionals. Then add a TODO to delete the column in a follow-up once a backfill migration is in.

Better still: write a one-off backfill migration as part of _this_ PR (read `installs.log`, split on `\n`, insert into `install_events` with step=`"legacy"` and `createdAt = installs.createdAt`) and delete `parseLegacyLogBlob` + the legacy column reads entirely. The user has explicitly told CONCERNS.md this is the goal.

### 8. `upsertInstallRecord` wraps a delete+update in a transaction, but the write paths still set `log: null` redundantly

`server/install/records.ts:23, 43` both contain `log: null`. With the install-events table now authoritative and the legacy column flagged for removal, these writes are dead. They were already "do not write to it" per AGENTS.md.

**Code-judo move:** drop the `log: null` from both `values({...})` and `set({...})` clauses. If you keep the column for now, the upsert no longer pretends to "reset" a column it never writes.

---

## P2 — Test & code-quality issues

### 9. `buildEd25519WireKey` is copy-pasted across two test files

`server/ssh/host-key-fingerprint.test.ts:8-18` and `server/ssh/connection.test.ts:23-33` are byte-identical. There is no shared test helper module in this directory.

**Code-judo move:** extract to `server/ssh/__tests__/build-ed25519-wire-key.ts` (or `server/ssh/test-helpers.ts`) and import in both. This is a small helper, but the duplication is exactly the kind of "fix the same thing in two places later" tax this review is supposed to flag.

### 10. The "sanity: our test key has padding" assertion is testing the test

`server/ssh/connection.test.ts:172`, `host-key-fingerprint.test.ts:38`

```ts
expect(noPaddingExpected).not.toBe(expected); // sanity: our test key has padding
```

This is a tautology (the regex on the very next line can only produce a different string if `expected` actually ends in `=`). It is also fragile: if someone changes the production code to produce the no-padding form (which is exactly what #2 recommends), this test starts failing for the wrong reason.

**Code-judo move:** delete both `expect(...).not.toBe(...)` lines. The behavior under test is "the no-padding form is accepted", not "the test input has a particular shape".

### 11. `expected.replace(/=+$/, "")` is open-coded in `fingerprintsMatch`, `connection.test.ts`, and `host-key-fingerprint.test.ts`

Three different files now have the same strip-padding regex. After #2 this is just `fingerprintFromKeyBuffer` and the test file's "noPadding" fixture, which can be expressed as `validFingerprint.replace(/=+$/, "")` once and imported.

### 12. `hostVerifier` callback has a multi-line comment explaining a 5-line implementation

`server/ssh/connection.ts:70-75`

The block comment explaining "Do NOT set `hostHash` here: ssh2 would pre-hash the raw key…" is valuable context, but the comment is longer than the code it documents and is wedged into a config-object literal. Either move the rationale to a one-liner on the function or to the function's JSDoc; the inline block-comment-in-config-object pattern is hard to scan and tends to drift out of sync with the code below it.

---

## P3 — Smaller but worth flagging

- **`server/ssh/connection.ts:55-60`** — `const ssh = new NodeSSH() as NodeSshWithHostKey;` is a type assertion that loses its purpose once #1 is fixed.
- **`server/ssh/connection.ts:97-110`** — the catch-block that re-wraps `SshConnectError` to attach `observedKey` exists because `ssh2`'s own error happens _inside_ `ssh.connect(connectOptions)`, _not_ inside the `hostVerifier` callback, when `hostVerifier` returns `false`. With the new design (throw directly from the verifier), the verifier can no longer return `false` — confirm and remove the `return true;` at the end, since dead. (Same applies: the `observedKey` closure variable is only read in the catch for the case where `ssh2` rejected verification itself; with the verifier throwing directly, that path is unreachable and the whole `if (…&& !normalized.hostKey && observedKey)` block in the catch collapses.)
- **`server/ssh/host-key-fingerprint.ts:26-42`** — `parseSshKeyAlgorithm` accepts `MAX_ALGORITHM_NAME_LENGTH = 64`. The longest SSH algorithm name in the wild is 19 chars; this is conservative-but-OK, but it is also an unsigned-int read with no max-buffer-allocation check, so a hostile host key could trigger a 4 GiB `.subarray()` attempt. Cap the read at e.g. 256 bytes (a 4-byte length prefix + 252 bytes) and bail on anything larger, or use a streaming parser.
- **`server/install/legacy-log.ts:14`** — `parseLegacyLogBlob` uses a single `fallbackTimestamp` for _every_ line in the blob. Pre-migration rows had per-line timestamps; this is information loss, not normalization. If the goal is backfill-and-delete, this helper should not survive the migration; if it survives, the timestamp is wrong for every line past the first.

---

## Suggested sequencing

1. Fix #1 (closure-based capture, no cast) — touches 2 files + tests, no behavior change.
2. Fix #2 (canonicalize at the boundary) — touches 3 files + tests, removes a manual normalization step.
3. Fix #5 (shared action-name constant) — touches 4 files, deletes the new diff's `relevantServerActionNames` array.
4. Fix #4 (typed query for `getLatestServerActionRecords`) — touches 1 file, removes `sql.raw` and the empty-list guard.
5. Fix #7 (single install-log helper, or backfill-and-delete) — touches 2 files, optionally drops `legacy-log.ts` entirely.
6. Fix #3, #8, #9, #10, #11, #12 in any order — small.
7. Address #6 (move the empty-list check to the caller) only if the list.ts call site change is small; otherwise file as a follow-up.

After #1, #2, #4, and #5 land, the diff becomes: add one shared constants module, delete one raw-SQL query, delete one type cast + monkey-patch, delete one duplicated regex. The remaining surface is the actual bug fixes plus the test coverage. That's the kind of "feels inevitable in hindsight" version this branch deserves.

---

## Approval bar (per the thermo-nuclear prompt)

I would not approve this PR as-is. The two highest-impact items are **#1** (monkey-patched cast on a third-party class to compensate for a removed API) and **#2** (padding-normalization in the wrong layer, duplicated with the regex). **#4** + **#5** together would also substantially improve the diff, since the new code adds a _fourth_ copy of an enum that CONCERNS.md has just told the team to consolidate. **#7** is the question of whether the PR makes the dual-path code base smaller or larger — right now it grows it.

Once those are addressed (especially #1, which is a "this is a hack that could be a direct read" issue), the diff is much closer to mergeable. The rest of the list is polish.
