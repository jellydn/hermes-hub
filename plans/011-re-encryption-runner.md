# Plan 011: Re-encryption runner (plan 004 phase 2)

| Field | Value |
|---|---|
| Status | pending |
| Category | security / ops |
| Baseline | plan 004 landed as `df998f3` (PR #110, 2026-08-06) |
| Depends on | plan 004 (keyring + versioned wire format + `encryption_key_version` columns) |
| Behavior decisions | fail-fast (preflight validation, abort on first failure); CLI script + `workflow_dispatch` job |

## Why

Plan 004 delivered the *foundation* for `ENCRYPTION_KEY` rotation but
explicitly left the rotation event itself out of scope:

> The re-encryption runner is **the next plan to write** after this lands.
> — `plans/004-encryption-key-rotation.md`, Maintenance note

Today, once an operator sets `ENCRYPTION_KEY_V2`:

- New writes are encrypted with the v2 key (`v2.iv.authTag.cipher` wire
  format) and record `encryption_key_version = 'v2'`.
- All pre-existing rows remain encrypted with the v1 key. They still
  decrypt (the keyring holds both), but they can only be rewritten by
  hand — every credential has to be re-saved through the UI.

That is the same "shatter the glass" failure mode plan 004 set out to
eliminate, just deferred by one release. This plan closes the loop with
an operator-run re-encryption job that rewrites every stale (non-active)
encrypted row to the active key, making rotation a true
config-only operation:

1. Add `ENCRYPTION_KEY_V2=<new>` to env.
2. Run `bun run re-encrypt --apply` (or trigger the workflow).
3. Watch new writes use `v2`.
4. Re-run until the job reports `0 rows to re-encrypt`.
5. Old key is dormant; retire it once all rows are on the active version.

## Recon (do not re-derive)

Current state at `df998f3` (verified 2026-08-06):

- `server/crypto.ts` ships `getKeyring()` (env-snapshot-keyed cache),
  `getActiveEncryptionKeyVersion()`, `encryptSecret` (writes
  `vN.iv.authTag.cipher`), `decryptSecret` (parses the prefix; a
  missing prefix is treated as legacy `v1`), and `decryptApiServerKey`
  (refuses legacy plaintext with a descriptive error — plan 005).
- The **wire format is self-describing**: the payload's own `vN` prefix
  identifies the key, so the runner does not need a version column to
  know what to rewrite. Columns are bookkeeping, not the source of truth.
- Encrypted payload inventory (the runner must cover every surface that
  `encryptSecret` / `encryptSecretMap` writes to):

  | Table | Column | Shape | Version column? |
  |---|---|---|---|
  | `ai_providers` | `encrypted_api_key` | text NOT NULL | yes |
  | `telegram_configs` | `bot_token` | text NOT NULL | yes |
  | `telegram_configs` | `api_server_key` | text NULL | yes |
  | `servers` | `encrypted_credential` | text NULL (only when `store_credential`) | **no** |
  | `server_web_ui` | `encrypted_password` | text NULL | **no** |
  | `mcp_servers` | `encrypted_env` | jsonb `EncryptedSecretMap` | **no** (per-entry) |
  | `mcp_servers` | `encrypted_headers` | jsonb `EncryptedSecretMap` | **no** (per-entry) |

  - `EncryptedSecretMap = Record<string, { encrypted: string; last4: string }>`
    (`server/settings/mcp/types.ts`). Each entry's `encrypted` is its
    own independent payload; entries can be at different versions during
    a transition, so `mcp_servers` gets **per-entry** prefix detection,
    not a row-level version.
  - Insert sites that set `encryptionKeyVersion`:
    `server/telegram.ts:666` (telegram_configs) and
    `server/providers/model-access-persistence.ts:48,89` (ai_providers).
    `servers`, `server_web_ui`, and `mcp_servers` never write the column
    (they have none) — the runner must derive their version from the
    prefix.
- DB access: `getDb()` in `server/db/index.ts` (postgres-js + Drizzle,
  throws `DATABASE_URL is required` when unset — a ready-made guard for
  the CLI).
- Script conventions: `scripts/db-migrate.mjs` is a thin node guard
  around an exec; `scripts/generate-brand-assets.ts` runs via
  `bun run` (see `package.json` `brand:assets`). AGENTS.md: use `bun`,
  `.env` is not auto-loaded for child `node` processes — export env in
  the shell first (`set -a; . ./.env; set +a`).
- Workflow conventions: `deploy.yml` shows the `workflow_dispatch`
  pattern, the `: "${SECRET:?...}"` env guards, and existing
  `ENCRYPTION_KEY`/`DATABASE_URL` secrets usage.
- No local DB in the Cursor Cloud dev VM; CI runs no migrations and no
  DB-backed integration tests. Unit tests mock `getDb()` (see
  `server/dashboard.test.ts:44`, `server/deploy.test.ts:28`).

Build commands:
- `bun run typecheck`
- `bun run test -- server/lib/re-encryption-runner.test.ts`
- `bunx @biomejs/biome check .`

## Scope of this plan

Deliver an operator-run re-encryption job:

- **CLI**: `scripts/re-encrypt.ts` (bun-run, `--dry-run` default,
  `--apply` to write) + core logic in `server/lib/re-encryption-runner.ts`
  (testable, DB-mockable) + `package.json` script `re-encrypt`.
- **Workflow**: `.github/workflows/re-encrypt.yml` with
  `workflow_dispatch` (inputs: `apply` boolean, default false) that
  shells out to the CLI with `DATABASE_URL`/`ENCRYPTION_KEY`/
  `ENCRYPTION_KEY_V2` from secrets.
- **Behavior**: fail-fast. Preflight pass validates that **every**
  payload decrypts under its own version key; if any row fails, print
  the row identifiers and exit non-zero **without writing anything**.
  Only after a clean preflight does the rewrite pass run, inside a
  single transaction. Idempotent: rows already at the active version are
  skipped; a second run is a no-op.
- **Docs**: `.env.example` gains `ENCRYPTION_KEY_V2`; `CONTEXT.md`
  rotation term gains the runbook steps.

Out of scope (intentionally):
- Adding `encryption_key_version` columns to `servers`, `server_web_ui`,
  `mcp_servers`. The wire prefix is the source of truth; columns are
  optional bookkeeping (see Escape hatches). Plan 004 already added the
  column only where it was cheap (two tables).
- Retiring/dropping `ENCRYPTION_KEY` from the keyring. `buildKeyringFromEnv`
  still requires it as the legacy `v1`; "retire" here means: once zero
  stale rows remain, the v1 key is dormant, and the operator may
  eventually unset `ENCRYPTION_KEY_V2` after rotating its value forward
  (out of scope — needs its own keyring change to support v3+).
- UI for "key version" or progress display.
- Server-side trigger/route — this is operator- and CI-driven only.

## Files in scope

- `server/lib/re-encryption-runner.ts` (new) — core logic:
  `planReencryption(db)` (read-only preflight + rewrite plan) and
  `applyReencryption(db)` (transactional rewrite).
- `server/lib/re-encryption-runner.test.ts` (new) — unit tests with a
  mocked `getDb()`.
- `scripts/re-encrypt.ts` (new) — thin CLI: env guards, arg parse
  (`--dry-run` / `--apply`), summary output, exit codes.
- `package.json` — add `"re-encrypt": "bun run scripts/re-encrypt.ts"`.
- `.github/workflows/re-encrypt.yml` (new) — `workflow_dispatch` job.
- `.env.example` — document `ENCRYPTION_KEY_V2`.
- `CONTEXT.md` — extend the rotation term with the runbook.
- `plans/README.md` — tag this plan under a "Future work" section (per
  plan 004's Maintenance note).

## Files explicitly out of scope

- `server/db/schema.ts` — no migration in this plan.
- `server/crypto.ts` — no changes; the runner consumes the existing
  `encryptSecret`/`decryptSecret`/`getActiveEncryptionKeyVersion`.
- `server/telegram.ts`, `server/providers/*`, `server/servers.ts`,
  `server/web-ui/*`, `server/settings/mcp/*` — no insert/read changes.
- Client/React code.

## Current state at `df998f3`

`server/crypto.ts` (excerpted, key parts):

```ts
function buildKeyringFromEnv(): Keyring {
	const legacyKey = process.env.ENCRYPTION_KEY;
	if (!legacyKey) {
		throw new Error("ENCRYPTION_KEY is required");
	}
	const entries: KeyringEntry[] = [
		{ version: LEGACY_ENCRYPTION_VERSION, key: deriveKey(legacyKey) },
	];
	const nextKey = process.env.ENCRYPTION_KEY_V2;
	if (nextKey) {
		entries.push({ version: "v2", key: deriveKey(nextKey) });
	}
	return { active: entries[entries.length - 1], all: entries };
}

export function getActiveEncryptionKeyVersion(): string {
	return getKeyring().active.version;
}
```

`encryptSecret` emits `[active.version, iv, authTag, encrypted].join(".")`;
`parsePayload` maps a `vN` prefix to a keyring entry and treats a
prefix-less payload as legacy `v1`.

Schema (relevant columns):

```ts
// aiProviders.encryptedApiKey: text NOT NULL
// aiProviders.encryptionKeyVersion: text DEFAULT 'v1' NOT NULL
// telegramConfigs.botToken: text NOT NULL
// telegramConfigs.apiServerKey: text NULL
// telegramConfigs.encryptionKeyVersion: text DEFAULT 'v1' NOT NULL
// servers.encryptedCredential: text NULL
// serverWebUi.encryptedPassword: text NULL
// mcpServers.encryptedEnv / encryptedHeaders: jsonb EncryptedSecretMap
```

## Plan

Run in order; each step has a verification command.

1. **Core runner in `server/lib/re-encryption-runner.ts`.**

   Export two functions operating on a Drizzle `db`:

   - `planReencryption(db)` — read-only. Loads every encrypted payload
     from all seven columns above (skipping NULLs and empty maps),
     determines each payload's current version from its wire prefix
     (falling back to `v1` when no prefix), and attempts a
     decrypt on each payload **using its own version's key**. For
     `telegram_configs.api_server_key` reuse `decryptApiServerKey`
     (not raw `decryptSecret`) so legacy plaintext values surface the
     descriptive plan-005 "re-save via /api/providers" message instead
     of the generic payload error. Any decrypt failure is collected into
     `errors`, not swallowed.
   - `applyReencryption(db)` — first calls `planReencryption(db)`. If
     `errors` is non-empty, **aborts with no writes** (fail-fast) and
     returns the error list. Otherwise, inside a single
     `db.transaction(...)`, rewrites every stale row. To close the
     preflight→tx race (a user re-saving a credential mid-run), do the
     decrypt **inside the transaction** immediately before each UPDATE
     rather than trusting preflight plaintext; if the payload changed
     since preflight, re-evaluate (it may now be active — skip it).
     Update the column (and `encryption_key_version` where the column
     exists). For `mcp_servers` maps, rewrite each stale entry's
     `encrypted` independently, preserving `last4` and untouched
     entries.

   Use a Drizzle `sql`-free approach: select all rows from the five
   tables (`aiProviders`, `telegramConfigs`, `servers`, `serverWebUi`,
   `mcpServers`) via `db.select().from(...)`, and update by primary key
   (`eq(table.id, row.id)`). Where a column exists (ai_providers,
   telegram_configs), update it to `getActiveEncryptionKeyVersion()`.

   Verify: `bun run typecheck`.

2. **Unit tests in `server/lib/re-encryption-runner.test.ts`.**

   Mock `./db` (module) or `getDb()` returning an in-memory fake
   following the existing mock style in `server/dashboard.test.ts` /
   `server/deploy.test.ts`. Cover:

   - Stale v1 row is rewritten to the active version and the version
     column flips to `v2` (when `ENCRYPTION_KEY_V2` is set via
     `vi.stubEnv`, per `server/crypto.test.ts:102` pattern).
   - Rows already at the active version are skipped; a second run is a
     no-op (idempotency).
   - Legacy prefix-less payload is treated as `v1` and rewritten.
   - `mcp_servers` map: only stale entries rewritten; `last4` and other
     keys preserved; mixed-version map handled.
   - `servers.encryptedCredential` / `serverWebUi.encryptedPassword`
     NULL values are skipped (no version column to write).
   - **Fail-fast:** one corrupt payload → `errors` non-empty →
     `applyReencryption` writes nothing (assert the fake's update
     function was never called) and reports the row identifier.
   - No `ENCRYPTION_KEY_V2` set → active version is `v1`, nothing is
     stale, plan is empty (no-op, exit 0).

   Verify: `bun run test -- server/lib/re-encryption-runner.test.ts`.

3. **CLI in `scripts/re-encrypt.ts`.**

   Match the repo's script conventions: `bun run` via the `package.json`
   script, **relative imports** (`../server/crypto`, `../server/db`,
   `../server/db/schema`) — `scripts/generate-brand-assets.ts` is the
   precedent and uses `../src/...` imports, so do not rely on `#server/*`
   aliases here. Behavior:

   - Guard: `DATABASE_URL`, `ENCRYPTION_KEY` required (mirror
     `db-migrate.mjs` / `getDb` throw message). If `ENCRYPTION_KEY_V2`
     is unset, print `active version is v1 — nothing to re-encrypt`
     and exit 0.
   - Default mode is `--dry-run`: print the plan (counts per table,
     row identifiers for errors, total stale) and exit 0.
   - `--apply`: run `applyReencryption(db)`; on success print
     `re-encrypted N rows to v2` and exit 0; on errors print each
     `table:id:column — reason` and exit 1.
   - Use `console.log` only in this script (scripts/ are not server
     runtime; `db-migrate.mjs` uses `console.error`).

   Add `"re-encrypt": "bun run scripts/re-encrypt.ts"` to
   `package.json` scripts (alphabetical placement near `db:migrate`).

   Verify: `bun run re-encrypt` with no `.env` exported fails with the
   `DATABASE_URL is required` guard (exit 1) — proves the guard;
   `bun run typecheck`.

4. **Workflow `.github/workflows/re-encrypt.yml`.**

   Model the `workflow_dispatch` shape on `deploy.yml`:

   - `on.workflow_dispatch.inputs.apply` — boolean, default `false`
     (dry-run by default so operators preview before writing).
   - One job, `reencrypt`, on `ubuntu-latest`, `timeout-minutes: 20`,
     permissions `contents: read`.
   - Steps: checkout → `oven-sh/setup-bun@v2` → `bun install
     --frozen-lockfile` → run `bun run re-encrypt ${{ inputs.apply &&
     '--apply' || '' }}` with `env` from secrets:
     `DATABASE_URL`, `ENCRYPTION_KEY`, `ENCRYPTION_KEY_V2`. Guard all
     three with `: "${SECRET:?...}"` lines like `deploy.yml:150`.
   - `concurrency` group keyed on the workflow name so two manual runs
     cannot race the same DB.

   Verify: workflow file passes YAML parse; dry-run run on a real
   target exits 0 with `0 rows to re-encrypt` after the first `--apply`.

5. **Docs.**

   - `.env.example`: add
     `# Optional second key for ENCRYPTION_KEY rotation — when set, new writes use v2 and bun run re-encrypt rewrites stale rows`.
     `ENCRYPTION_KEY_V2=` after the `ENCRYPTION_KEY` block.
   - `CONTEXT.md`: extend the rotation term with the runbook steps
     (add key → `bun run re-encrypt --apply` (or workflow) → re-run
     until 0 stale → old key dormant → retire `ENCRYPTION_KEY_V2`).

   Verify: `bunx @biomejs/biome check .env.example CONTEXT.md`.

6. **Final pass.**

   `bunx @biomejs/biome check . && bun run typecheck && bun run test`.

   Verify: clean.

## Tests

Pattern: unit tests in `server/lib/re-encryption-runner.test.ts` with a
mocked `getDb()`, following the mock style of
`server/dashboard.test.ts` / `server/deploy.test.ts`. Env variance via
`vi.stubEnv("ENCRYPTION_KEY", ...)` / `vi.stubEnv("ENCRYPTION_KEY_V2", ...)`
(see `server/crypto.test.ts:102-149`). The CLI itself needs no test
(thin wrapper); the workflow needs no test (shell plumbing).

Key assertions: stale rows rewritten with active key; version columns
flip where they exist; NULLs skipped; maps rewritten per-entry with
`last4` preserved; idempotent re-run; **fail-fast leaves the DB
untouched** when any payload fails to decrypt; no-V2 → no-op.

## Done criteria

- `server/lib/re-encryption-runner.ts` + tests exist; `bun run re-encrypt`
  works with `--dry-run` / `--apply`.
- Rewrite covers all seven encrypted surfaces, including `mcp_servers`
  maps (per-entry) and tables without a version column (prefix-derived).
- Fail-fast guaranteed: any undecryptable payload aborts with zero
  writes and non-zero exit, naming every failing row.
- Idempotent: re-run after completion reports `0 rows to re-encrypt`.
- `.github/workflows/re-encrypt.yml` dry-runs by default, applies on
  explicit input, and guards all three secrets.
- `.env.example` + `CONTEXT.md` document the runbook.
- `bun run typecheck`, `bun run test`, `bunx @biomejs/biome check .` all
  clean.

## Maintenance note

This is the operator-facing half of rotation. Future key versions
(v3+) will need a keyring generalization in `server/crypto.ts`
(`buildKeyringFromEnv` currently hardcodes v1/v2) — plan 011's runner
already generalizes (it compares payload version to whatever the active
version is), so only the keyring itself changes. When the keyring grows,
extend `getActiveEncryptionKeyVersion` consumers (the two insert sites)
and re-run the runner; no runner change required.

## Escape hatches

- If a single `db.transaction` over all tables is too wide for the data
  set: run per-table transactions and accept that a mid-run failure
  leaves earlier tables rewritten (re-run is idempotent and safe). The
  fail-fast preflight still runs once before any writes. Pair with an
  optional `--limit N` knob if a table ever grows large enough that one
  unbounded transaction is a concern.
- If operators want SQL-queryable completion checks on the tables
  without version columns: a follow-up can add
  `encryption_key_version` to `servers`, `server_web_ui`, and
  `mcp_servers` (migration 0021) and have the runner write it there
  too. Not needed for correctness — the wire prefix is authoritative.
- If the workflow's secrets do not exist yet (`ENCRYPTION_KEY_V2` is
  new): the dry-run default means a missing secret surfaces as a clean
  `: "... required"` failure rather than a half-applied rotation.
- If a legacy plaintext `api_server_key` is encountered (plan 005
  refuses it): the preflight reports it as an error row and aborts —
  the operator must re-save that provider via the UI before rotating,
  which is the intended, safe behavior.
