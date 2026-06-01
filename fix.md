# Fix Plan — Remaining CONCERNS.md Items

**Created:** 2026-06-01
**Scope:** Items still open after the 2026-06-01 audit. Accepted limitations
(ADR-0009) and already-fixed items are excluded.
**Ordering:** Sequenced by risk × effort, with quick wins first.

Each phase below is independently shippable. Run `bunx @biomejs/biome check .`
→ `bun run typecheck` → `bun run test` → `bun run build` after every phase
(matches CI order from `AGENTS.md`).

---

## Phase 1 — Quick Wins (≤ 1 day each)

### 1.1 Pin Hermes image to an immutable digest
**Concern:** *Hermes image tag pinned to `latest`*

- Edit `server/constants.ts`:
  - Add `hermesImageVersion = "<tag>"` (e.g. `v1.x.y`).
  - Add `hermesImageDigest = "sha256:..."` (read once via
    `docker manifest inspect`).
  - `defaultHermesImage = \`${hermesImageRepository}:${hermesImageVersion}@${hermesImageDigest}\``.
- No other code change — `buildHermesComposeContent` already interpolates
  `defaultHermesImage`.
- **Test:** snapshot test on `buildHermesComposeContent()` output (covers
  1.4 too).
- **Rollback story:** bumping the constant + redeploying is the rollback.

### 1.2 Align TanStack package versions
**Concern:** *TanStack package version skew*

- Pick the latest compatible matrix that `@tanstack/react-start@^1.168`
  supports (run `bunx npm-check-updates -p bun --filter '@tanstack/*'`).
- Update `package.json` so `react-router`, `react-router-ssr-query`,
  `react-start`, `router-plugin`, `react-router-devtools` share one minor
  line. `devtools-vite` + `react-devtools` follow their own line.
- `bun install`, then run full CI sequence + smoke-test `bun run dev` and
  `bun run build`.
- **Done when:** all `@tanstack/react-*` packages report compatible peer
  ranges and the build is clean.

### 1.3 Add `(user_id, created_at desc)` index to `audit_logs`
**Concern:** *DB pool / query shape* (partial)

- Edit `server/db/schema.ts` `auditLogs` table:
  ```ts
  (table) => [
    index("audit_logs_user_id_idx").on(table.userId),
    index("audit_logs_user_created_idx").on(table.userId, table.createdAt.desc()),
  ]
  ```
- `bun run db:generate` → new migration file in `drizzle/`.
- Deploy runs `drizzle-kit migrate` per `AGENTS.md`.
- **Test:** no behavior change; verify existing tests still pass.

### 1.4 Golden tests for `buildHermesComposeContent`
**Concern:** *Compose rendering golden tests* + *Compose YAML rendering uses
string interpolation* (de-risks 4.1 later)

- Create `server/compose.test.ts`:
  - Snapshot the output with `{}`, with provider envs only, with all options.
  - Property-based test (`fast-check` already not in deps — use a small
    handwritten matrix instead): values containing `"`, `\n`, `:`, `#`,
    `${`, `` ` ``.
  - Assert the result is valid YAML via `yaml.parse(...)` from the `yaml`
    package (already an indirect dep; if not, install it under
    `devDependencies`).
- **Done when:** every produced compose is parseable and round-trips to the
  expected object shape.

---

## Phase 2 — SSH Host Trust (≈ 2-3 days)

### 2.1 Persist first-seen host key fingerprint
**Concerns:** *SSH host authenticity not verified/pinned* + *Host key trust
onboarding/pinning UX*

**Schema change**
- Add nullable `hostKeyFingerprint TEXT` and
  `hostKeyAlgorithm TEXT` columns to `servers` in
  `server/db/schema.ts`.
- `bun run db:generate` → migration.

**Server change**
- `server/ssh/connection.ts`:
  - Add `expectedFingerprint?: string` to `SshConnectionInput`.
  - In `ssh.connect`, pass an `algorithms` constraint and a `hostVerifier`
    that hashes the server's host key (`createHash('sha256').update(key).digest('base64')`).
  - On first connect (no expected fingerprint): return the fingerprint via
    a new `verifyServerConnection` field so callers can persist it.
  - On subsequent connects: throw `SshConnectError('host_key_mismatch', ...)`
    if it does not match.
- `server/servers.ts` `connectServer`:
  - After successful `verifyServerConnection`, store `hostKeyFingerprint` +
    `hostKeyAlgorithm` on the `servers` row.
- Every downstream caller (`install/workflow.ts`, `deploy.ts`,
  `dashboard/metrics.ts`, `server-actions.ts`, `telegram.ts`) passes
  `expectedFingerprint` from the resolved server record.

**UX change**
- On mismatch, the API returns a 409 with the new + old fingerprint so
  the UI can show a "Host key changed — confirm or reject" dialog.
- Add a `POST /api/servers/:id/host-key/accept` route guarded by
  `requireHttps()` that updates the stored fingerprint after the user
  confirms (logged as an audit event `server.host_key.rotated`).

**Tests**
- Unit: `ssh/connection.test.ts` — verifier accepts matching, rejects
  mismatched, captures fingerprint on first connect.
- Integration: connect flow stores fingerprint; second connect with
  different key returns 409.

**Migration story for existing rows:** `hostKeyFingerprint` is nullable;
treat `null` as "first contact" and backfill on the next successful
connect.

---

## Phase 3 — Supply-Chain Hardening (≈ 1-2 days)

### 3.1 Replace `curl | sh` with apt + pinned Docker repo
**Concern:** *Supply-chain risk in install command pipeline*

- Rewrite the `install-docker` step in
  `server/install/workflow.ts` (lines 36-42) to:
  ```sh
  sudo install -m 0755 -d /etc/apt/keyrings &&
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg &&
  sudo chmod a+r /etc/apt/keyrings/docker.gpg &&
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null &&
  sudo apt-get update &&
  sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  ```
- Drop the now-redundant `install-compose` step (or keep it as a no-op
  verification: `docker compose version`).
- Branch on `verified.osName` — Debian uses
  `https://download.docker.com/linux/debian`. For non-Ubuntu/Debian
  (warning status), still fall back to `get.docker.com` and surface a
  warning in the install log.
- **Tests:** update `install.test.ts` mock assertions for the new command
  text; add a step-name guard so the test fails if a new step is added
  without an assertion.

---

## Phase 4 — Compose & Logs Robustness (≈ 2-3 days)

### 4.1 Switch compose rendering to the `yaml` serializer
**Concern:** *Compose YAML rendering still uses string interpolation*

- Build an object literal in `server/compose.ts` and serialize via
  `yaml.stringify`.
- Drop the manual `.replace(/"/g, '\\"')` escaping.
- Re-run the golden tests added in 1.4; they should now pass with
  stronger inputs.
- **Done when:** all known-bad input chars round-trip safely and the
  diff vs. the previous output is byte-for-byte except for quoting
  style (compose is tolerant of either).

### 4.2 Append-only install events table
**Concern:** *Install log persistence rewrites full log blob*

- New table `install_events` (`installId`, `step`, `progress`, `message`,
  `status`, `timestamp`, optional `error`), indexed by
  `(install_id, created_at)`. Generate migration via `bun run db:generate`.
- In `server/install/sse-stream.ts` `emitInstallEvent`:
  - Insert one row per event instead of `update(installs).set({ log: ... })`.
  - Continue to update `installs.status`/`installs.step`/`installs.updatedAt`
    on the existing row, but stop writing `installs.log`.
- `server/install/sse-stream.ts` `hydrateInstallEvents` and
  `getLatestServerInstallLog` (`server/install.ts:249-278`) read from
  `install_events` instead of parsing the legacy log string.
- Keep `installs.log` column for one release as a back-compat read fallback,
  then drop in a follow-up.
- **Tests:** update `install.test.ts` and `install-idle-timeout.test.ts`
  for the new write path; add a test that asserts the legacy log column
  is no longer written.

### 4.3 Normalize `audit_logs.server_id` + rewrite server-list action query
**Concern:** *Server list action query JSON-filter + LIMIT 100*

- Schema: add nullable `serverId TEXT` column on `audit_logs` with an
  index on `(user_id, server_id, created_at desc)`.
- Backfill: data migration extracts `details->>'serverId'` into the new
  column for existing rows (`UPDATE audit_logs SET server_id = ...`).
- Code: every `db.insert(auditLogs).values({ ..., details: { serverId, ... } })`
  call also sets `serverId` directly. Add a small wrapper
  `insertAuditLog({ ..., serverId })` in `server/lib/` so we cannot forget.
- Rewrite `getLatestServerActionRecords` in `server/servers/records.ts` to
  use the new column with `DISTINCT ON (server_id)` (Postgres) ordered
  by `created_at desc`, eliminating the LIMIT 100 cap and the JSON
  predicate.
- **Tests:** `server/servers.test.ts` already exercises this path —
  extend it with a multi-server fixture that proves >100 audit rows
  no longer hide a server's latest action.

---

## Phase 5 — Test Coverage Closeouts (≈ 1 day, can run in parallel)

### 5.1 Telegram deploy SSH happy path
**Concern:** *Telegram deploy/test SSH execution paths* (Medium)

- Extend `server/telegram.test.ts` `deployTelegramToServer` case to
  assert:
  - `deployComposeViaSsh` invoked with expected host/port/username/auth.
  - Compose content passed in includes `API_SERVER_KEY`,
    `TELEGRAM_BOT_TOKEN`, and the provider env vars.
  - On success: `telegram.deployed` audit row + `deployedServerId`,
    `deployedServerHost`, `apiServerKey` set inside a single
    `db.transaction` (mock + assert call order).
  - On SSH failure: `telegram.deploy.failed` audit row, no transaction
    commit.

---

## Out of scope (intentionally)

These remain documented in CONCERNS.md / ADR-0009 and are **not** part of
this fix plan:

- Externalizing install streams, session credentials, dashboard cache, or
  rate limiter to Redis/Postgres. Wait until multi-instance is on the
  roadmap.
- Building a durable install job queue. Same trigger.
- Raising `DB_POOL_MAX` defaults — environment-tunable already; only
  revisit if metrics show pool exhaustion.

---

## Suggested merge order

```diagram
╭─────────────────────╮   ╭────────────────────────╮   ╭────────────────────────╮
│ Phase 1 — quick wins│──▶│ Phase 2 — SSH host trust│──▶│ Phase 4 — compose/logs │
│ 1.1 image pin       │   │ 2.1 fingerprint pinning │   │ 4.1 yaml serializer    │
│ 1.2 TanStack align  │   ╰────────────────────────╯   │ 4.2 install events     │
│ 1.3 audit index     │            │                    │ 4.3 audit server_id    │
│ 1.4 compose golden  │            ▼                    ╰────────────────────────╯
╰─────────────────────╯   ╭────────────────────────╮              │
            │             │ Phase 3 — supply chain │              ▼
            ▼             │ 3.1 apt-based docker   │   ╭────────────────────────╮
   (after 1.4 lands)      ╰────────────────────────╯   │ Phase 5 — telegram test│
   Phase 4.1 is safe                                   ╰────────────────────────╯
```

Phase 5 can land at any time after Phase 1.

## Validation checklist (per phase)

- [ ] `bunx @biomejs/biome check .`
- [ ] `bun run typecheck`
- [ ] `bun run test`
- [ ] `bun run build`
- [ ] Manual smoke for the touched surface (install / deploy / dashboard)
- [ ] CHANGELOG entry appended to `.planning/codebase/CONCERNS.md`
