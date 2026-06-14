# Plan 002: Scanner-bypass skill install fails loudly on download errors

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in "STOP conditions" occurs, stop and report — do not improvise.
> When done, update the status row for plan 002 in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 29c3b46..HEAD -- server/settings/agent-skills/remote.ts server/settings/agent-skills/remote-list.test.ts`
> If either file changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch, treat
> it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `29c3b46`, 2026-06-14

## Why this matters

When deploying a curated agent skill on the "accept scanner risk" path,
HermesHub installs it by piping a remote download into `tee`:
`curl -fsSL <url> | sudo tee <SKILL.md> > /dev/null`. In a shell pipeline the
exit status is that of the **last** command (`tee`, always 0), and the repo sets
`pipefail` nowhere. So a failed download (404, DNS failure, host unreachable, or
a mid-stream network drop) leaves an **empty or partial `SKILL.md`** on the
remote Hermes host while HermesHub reports the skill as successfully deployed —
and the post-deploy `find ... -name SKILL.md` existence check is satisfied by
the empty file. The user's agent silently runs with a broken/missing skill and
no error is surfaced. This fix makes the download failure abort the deploy.

## Current state

The defect is in the command builder. `server/settings/agent-skills/remote.ts`
(~lines 117–128):

```ts
// server/settings/agent-skills/remote.ts
export function buildDirectSkillInstallCommand(
  skillName: string,
  fetchUrl: string,
): string {
  const skillDir = `${managedComposeVolumeHome}/.hermes/skills/hermeshub/${skillName}`;
  const skillMdPath = `${skillDir}/SKILL.md`;
  return [
    `sudo mkdir -p ${shellQuote(skillDir)}`,
    `curl -fsSL ${shellQuote(fetchUrl)} | sudo tee ${shellQuote(skillMdPath)} > /dev/null`,
  ].join(" && ");
}
```

How it's consumed (do not change these — context only):
- `server/settings/agent-skills/deploy.ts` (~lines 44–49) runs the joined
  command list and treats only `result.code !== 0` as failure:
  ```ts
  const compoundCommand = plan.shellCommands.join(" && ");
  const result = await ssh.execCommand(compoundCommand);
  if (result.code !== 0) {
    throw new Error(result.stderr || "Failed to deploy agent skills changes");
  }
  ```
- `server/settings/agent-skills/deploy-plan.ts` later confirms "installed" via a
  `find ... -name SKILL.md` existence check, which an empty file passes.

Root cause: the `curl | tee` pipeline masks `curl`'s non-zero exit. `shellQuote`
lives at `server/ssh/quoting.ts` and is already imported in `remote.ts`.

### Conventions to follow

- The fix is a one-line shell change inside `buildDirectSkillInstallCommand`.
  Keep using `shellQuote(...)` for the URL and path — never interpolate raw.
- Tests are co-located. `parseInstalledSkillNamesFromFind` (same file) is
  already tested in `server/settings/agent-skills/remote-list.test.ts` — add the
  new builder test there (or in a sibling `remote.test.ts`), matching that
  file's import/`describe` style.

## Commands you will need

| Purpose   | Command | Expected on success |
|-----------|---------|---------------------|
| Run test  | `bun run test server/settings/agent-skills/` | all pass |
| Typecheck | `bun run typecheck` | exit 0, no errors |
| Lint      | `bunx @biomejs/biome check server/settings/agent-skills/` | exit 0 |
| Full test | `bun run test` | all pass |

## Scope

**In scope**:
- `server/settings/agent-skills/remote.ts` — fix `buildDirectSkillInstallCommand`
- `server/settings/agent-skills/remote-list.test.ts` — add a test for the builder
  (or create `server/settings/agent-skills/remote.test.ts` if you prefer; pick one)

**Out of scope** (do NOT touch):
- `server/settings/agent-skills/deploy.ts` — the `code !== 0` check is correct
  once the command propagates failure; no change needed.
- `server/settings/agent-skills/deploy-plan.ts` — the `find` check is fine once
  no empty file is ever written.
- The non-bypass `buildCustomSkillFileWrite` path (writes via stdin `tee`, not a
  pipe) — already safe.

## Git workflow

- Branch: `advisor/002-skill-install-pipefail`
- One commit; conventional commits style, e.g.
  `fix(agent-skills): fail skill install when remote download fails`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Make the download failure abort the install

Change `buildDirectSkillInstallCommand` so a non-2xx / failed `curl` aborts and
no empty file is written. Use a download-to-temp-then-move approach so partial
writes never land at the final path:

```ts
export function buildDirectSkillInstallCommand(
  skillName: string,
  fetchUrl: string,
): string {
  const skillDir = `${managedComposeVolumeHome}/.hermes/skills/hermeshub/${skillName}`;
  const skillMdPath = `${skillDir}/SKILL.md`;
  const tmpPath = `${skillMdPath}.download`;
  return [
    `sudo mkdir -p ${shellQuote(skillDir)}`,
    // curl -f already exits non-zero on HTTP >=400; -o writes to a temp file so
    // a failed/partial download never becomes the final SKILL.md. Require the
    // file to be non-empty before moving it into place.
    `curl -fsSL ${shellQuote(fetchUrl)} -o ${shellQuote(tmpPath)}`,
    `sudo test -s ${shellQuote(tmpPath)}`,
    `sudo mv ${shellQuote(tmpPath)} ${shellQuote(skillMdPath)}`,
  ].join(" && ");
}
```

Notes:
- `curl -o tmp` (no pipe) means `curl`'s own non-zero exit propagates through the
  `&&` chain — a 404/DNS/host failure stops the chain and `deploy.ts` sees
  `code !== 0`.
- `test -s` guards against a 0-byte success.
- `sudo` on `curl` is unnecessary (writing to a temp path the user can write);
  keep `sudo` only where the original used it for the final managed location —
  if writing the temp file under the managed dir requires root, prefix `curl`
  with `sudo` as well. If unsure whether the skills dir is root-owned, keep
  `sudo` on `curl`, `test`, and `mv` to match the original privilege level.

Prefer the **conservative** choice: keep `sudo` on every command in the chain so
privilege behavior is identical to before.

**Verify**: `bun run typecheck` → exit 0.

### Step 2: Add a unit test for the builder

In `server/settings/agent-skills/remote-list.test.ts` (or a new
`remote.test.ts`), import `buildDirectSkillInstallCommand` and assert the
returned string:
- contains `curl -fsSL` with the quoted URL and `-o` to a temp path (NOT a
  `| tee` pipe),
- contains a `test -s` non-empty guard,
- contains a `mv` of the temp file to the final `SKILL.md` path,
- joins steps with `&&` (so any failure aborts),
- properly quotes a URL containing shell metacharacters (e.g. pass a URL with a
  `;` or space and assert it is single-quoted, not raw).

**Verify**: `bun run test server/settings/agent-skills/` → all pass, new test
included.

### Step 3: Run the full gate

**Verify**:
- `bunx @biomejs/biome check server/settings/agent-skills/` → exit 0
- `bun run test` → all pass

## Test plan

- New test(s) for `buildDirectSkillInstallCommand` covering: no `tee` pipe
  present, temp-file + `test -s` + `mv` shape, `&&` joining, and shell-quoting of
  a metacharacter URL.
- Structural pattern: existing `server/settings/agent-skills/remote-list.test.ts`.
- Verification: `bun run test server/settings/agent-skills/` → all green.

## Done criteria

ALL must hold:

- [ ] `buildDirectSkillInstallCommand` no longer pipes `curl` into `tee`; a
      failed download aborts the chain
- [ ] `grep -n "tee" server/settings/agent-skills/remote.ts` shows the direct
      install path no longer relies on `curl ... | sudo tee` for the bypass install
- [ ] New unit test asserts the no-pipe / temp-move / quoted-URL shape and passes
- [ ] `bun run typecheck` exits 0
- [ ] `bunx @biomejs/biome check server/settings/agent-skills/` exits 0
- [ ] `bun run test` passes
- [ ] `git status` shows only the two in-scope files changed/added
- [ ] `plans/README.md` status row for 002 updated to DONE

## STOP conditions

Stop and report (do not improvise) if:

- `remote.ts` no longer matches the "Current state" excerpt (drift).
- You discover the managed skills directory's ownership makes the `sudo`/temp
  choice ambiguous in a way you can't resolve from the code (report the
  question rather than guessing privilege levels).
- The fix appears to require changing `deploy.ts` or `deploy-plan.ts`
  (it should not — report if it does).

## Maintenance notes

- If a future change reintroduces a `cmd | tee`/`cmd | something` pipeline for
  remote writes, the same exit-status masking returns — prefer download-to-temp
  + `test -s` + `mv`, or `set -o pipefail` on the remote shell.
- A reviewer should confirm the URL is still `shellQuote`d (injection boundary)
  and that `sudo` usage matches the prior privilege level.
- Related untested surface (deferred): `readRemoteManifest` name validation and
  `buildCustomSkillFileWrite` quoting — see TEST-04 in `plans/README.md`.
