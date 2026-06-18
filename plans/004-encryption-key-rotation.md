# Plan 004: ENCRYPTION_KEY rotation migration path

| Field | Value |
|---|---|
| Status | pending |
| Category | security / tech-debt |
| Audit finding | #4 (priority) |
| Audit SHA | `8ff4b72` |
| Depends on | none (but flag to operators before merge) |

## Why

`server/crypto.ts:9-15` derives a single 32-byte AES-256-GCM key from
`process.env.ENCRYPTION_KEY` via SHA-256. AGENTS.md explicitly states
"rotating it invalidates all stored SSH credentials." That is correct
and currently unavoidable: any byte change in the env var produces a
new key, and every previously encrypted payload — `botToken`,
`apiServerKey`, deployment keys — fails GCM auth-tag verification on
next decrypt.

This is a "shatter the glass" failure mode. Operators have no in-app
recovery path: every active integration has to be re-saved by hand.
For a project whose entire premise is managing long-lived credentials,
this needs a migration path.

## Recon (do not re-derive)

- Symmetric AES-256-GCM, IV is per-encryption random 12 bytes, auth
  tag is part of the wire format.
- Encrypted payloads use a `.`-joined base64url of `iv|authTag|cipher`.
- Storage columns: `telegramConfigs.botToken`, `telegramConfigs.apiServerKey`,
  `aiProviders.encryptedApiKey`. Schema lives in
  `server/db/schema.ts` (Drizzle). Encrypted fields are stored as `text`.
- Healthy decrypt failure path: `server/crypto.ts:36` throws on bad
  payload structure → callers in `server/telegram.ts:148` and
  `server/deploy.ts:55` map to HTTP 500.

Build commands:
- `bun run typecheck`
- `bun run test -- server/crypto.test.ts server/deploy.test.ts server/telegram.test.ts`
- `bun run db:generate && bun run db:migrate` for the schema bump

## Scope of this plan

This plan is **architectural scaffolding only**. The actual rotation
event (writing data with a new key in production, re-encrypting
existing rows) is operator-driven and out of scope for this PR. The
plan sets up the data path so that rotation becomes a config-only
operation.

Out of scope (intentionally):
- An automated re-encryption runner (the "phase 2" of a rotation
  event). Mentioned briefly in Maintenance.
- Removing the existing single-key flow. New code layers on top; old
  payload format continues to decrypt via the legacy key.
- UI for "key version".

## Files in scope

- `server/db/schema.ts` — add `encryption_key_version` to
  `telegramConfigs` and `aiProviders` (defaulting to current
  legacy version string, e.g. `"v1"`).
- `server/crypto.ts` — introduce `getEncryptionKeyring()` returning
  `{ active: string; all: string[] }`. Update `encryptSecret` to
  prefix the wire format with a `vN` segment. Update `decryptSecret`
  to parse `vN`. Add modes to support both old (`v1`-implicit) and
  new (`v2`-explicit) payloads.
- `server/providers/records.ts` — set `encryption_key_version`
  on insert; pass through for new writes.
- `server/telegram.ts` and `server/deploy.ts` — read
  `encryption_key_version` on the way in to `decryptSecret` so the
  right key is selected (or accept that `decryptSecret` looks up
  by version internally).
- `server/crypto.test.ts`, plus extend
  `server/telegram.test.ts`/`server/deploy.test.ts` for the new
  round-trip.

## Files explicitly out of scope

- Anything in `client/` or React.
- `server/auth.ts`, `server/lib/send-magic-link-email.ts` —
  unrelated to credential encryption at rest.
- Re-encryption runner / migration CLI script.
- Database row-rewrite tooling. (Operator does this in a separate
  release.)

## Current state at `8ff4b72`

`server/crypto.ts:9-15`:

```ts
function getEncryptionKey() {
  const rawKey = process.env.ENCRYPTION_KEY!;
  return createHash("sha256").update(rawKey).digest();
}
```

`server/crypto.ts:18-39` (excerpted):

```ts
export function encryptSecret(value: string) {
  const iv = randomBytes(ivLength);
  const cipher = createCipheriv(algorithm, getEncryptionKey(), iv);
  …
  return [iv, authTag, encrypted]
    .map((part) => part.toString("base64url"))
    .join(".");
}
```

`server/crypto.ts:46-54`:

```ts
export function decryptApiServerKey(payload: string): string {
  if (!payload) return "";
  try { return decryptSecret(payload); }
  catch {
    if (!payload.includes(".")) return payload;
    throw new Error("API server key could not be decrypted.");
  }
}
```

Schema shape (relevant fields, names only — see `server/db/schema.ts`
for the full column list):

```ts
// telegramConfigs.botToken: text NOT NULL
// telegramConfigs.apiServerKey: text NULL
// aiProviders.encryptedApiKey: text NOT NULL
```

## Plan

Run in order; each step has a verification command. Coordinate with
operators: this plan needs the rotation scheme communicated (in
`CONTEXT.md` or an ADR) before merge so operators know what
`ENCRYPTION_KEY` semantics will look like in production.

1. **Add `encryption_key_version` columns.**

   In `server/db/schema.ts`, add a non-nullable column with a default
   of `'v1'` to `telegramConfigs` and `aiProviders`. Migration:

   ```bash
   bun run db:generate && bun run db:migrate
   ```

   Run locally on the dev DB. Verify
   `drizzle/00NN_some_name.sql` is generated and applied, and the
   tables accept inserts with `'v1'` default. Verify: `bun run
   typecheck`.

2. **Introduce a keyring in `server/crypto.ts`.**

   Add a module-level keyring built once at first-call from env vars.
   Read two env vars:

   - `ENCRYPTION_KEY` (current — keyed as `'v1'`).
   - `ENCRYPTION_KEY_V2` (new — optional; if present, `'v2'` becomes
     active for new writes, and decryption tries both). If absent,
     behavior is unchanged.

   Function shape:

   ```ts
   type Keyring = {
     active: { version: string; key: Buffer };
     all: Array<{ version: string; key: Buffer }>;
   };
   function getKeyring(): Keyring;
   ```

   Then:

   - `encryptSecret(plaintext)` uses the **active** key and prefixes
     the wire format: `"vN.iv.authTag.cipher"` where `vN` is the
     active version.
   - `decryptSecret(payload)` parses the prefix; if missing, treats
     it as legacy `"v1"` and uses the `v1` key (full backward
     compat). If present, uses that key.

   Verify: `bun run typecheck && bun run test -- server/crypto.test.ts`.

3. **Decrypt callers do not need to pass key version explicitly.**

   Don't change `decryptSecret`'s signature in this phase. The
   key-version inside the payload tells the function which key to
   use. (Plan deferred: a future "operator runbook" plan can add an
   explicit `decryptSecretWithKey(payload, version)` if needed.)

   Verify: existing `server/deploy.test.ts`,
   `server/telegram.test.ts` continue to pass without modification
   (`decryptSecret` reads the prefix internally).

4. **Extend `server/crypto.test.ts`** with round-trip tests:

   - Encrypt with v1 (no env override) → decrypt with same v1 returns
     plaintext. Round-trip via `"v1.…"` payload prefix.
   - Encrypt with v1, set `ENCRYPTION_KEY_V2` to a different value,
     decrypt → still works (v1 key still in the keyring).
   - Encrypt with v2 (active), decrypt with both v1 and v2 in the
     ring → works.
   - Decrypt a deliberately malformed prefix (e.g. `v9.…` with no v9
     key) → throws.

   Verify: `bun run test -- server/crypto.test.ts` passes including
   the new cases.

5. **Set `encryption_key_version` on insert in
   `server/providers/records.ts` and `server/telegram.ts`.**

   When the controller writes a new encrypted value, persist the
   active key's version into the `encryption_key_version` column.
   Read paths can ignore the column right now (decrypt reads the
   prefix in the payload); the column is recorded for the future
   re-encryption runner.

   Verify: typecheck + targeted tests.

6. **Document the rotation story in CONTEXT.md or a new ADR.**

   Add a short note: "Operators set a new key by exporting
   `ENCRYPTION_KEY_V2=<new>` and triggering a re-encrypt run (CLI in
   follow-up PR). All rows continue to decrypt because the keyring
   holds both versions. New writes use `v2`. To retire `v1`, run the
   re-encrypt CI job (separate plan) until no `v1` rows remain,
   then unset `ENCRYPTION_KEY`."

   Verify: doc diff is small and pure prose.

7. **Final pass.**

   `bunx @biomejs/biome check . && bun run typecheck && bun run test`.

   Verify: clean.

## Tests

Pattern: round-trip tests in `server/crypto.test.ts`. Set `process.env`
values via `vi.stubEnv("ENCRYPTION_KEY_V2", ...)` (Vitest provides
this) for the multi-key cases. Each test calls `encryptSecret` then
`decryptSecret` and asserts equality. The "deliberately malformed
prefix" case asserts a specific error message.

Reference existing tests in `server/crypto.test.ts` — round-trip
with a known key already exists; emulate that shape.

## Done criteria

- `encryption_key_version` column exists on `telegramConfigs` and
  `aiProviders` with default `'v1'`. Migration applied.
- `server/crypto.ts` has `getKeyring()` and prefix-based versioning
  on encrypt/decrypt.
- New round-trip tests pass; all existing tests green.
- `bun run typecheck` and `bun run test` clean.
- Brief doc note added explaining how an operator rotates.

## Maintenance note

This is the *foundation* for rotation, not the rotation itself. Once
this is merged, an operator can:

1. Add `ENCRYPTION_KEY_V2=<new-key>` to env.
2. Watch new writes start storing `v2` payloads.
3. Run a re-encryption job (separate plan) to rewrite old rows.
4. Drop `ENCRYPTION_KEY` once zero `v1` rows remain.

The re-encryption runner is **the next plan to write** after this
lands. Tag the follow-up in `plans/README.md` under a "Future work"
section.

## Escape hatches

- If the active key derivation (`getKeyring` reading env at runtime)
  is awkward given the existing lazy-init pattern in `server/auth.ts`
  / rate-limiter: build the keyring once at module load (the env is
  read once), with a `buildKeyringFromEnv()` helper that's called on
  first encrypt/decrypt. Cache the result.
- If changing the wire-format prefix breaks any consumer that expects
  the old format ("v1" never existed before): the `legacy v1` fallback
  in step 2 covers this. Don't remove it.
- If the operators can't be coordinated (e.g. this lands before a
  rotation narrative is ready): STOP. This plan requires
  coordination. Land after the rotation doc/ADR is reviewed.
