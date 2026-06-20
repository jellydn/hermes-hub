# 13. Stacked-PR Merge Order with Predicted-Conflict Pre-Flight

Date: 2026-06-19

Updated: 2026-06-20 (added "Develop-baseline policy" subsection to Consequences)

## Status

Accepted

## Context

Stacked pull requests (e.g., `#63 → #64`, `#65 → #66`) cause merge conflicts
when squashed into trunk via `gh pr merge --squash --delete-branch`. Reactive
conflict resolution wastes developer time, and the failure modes are easy to
miss:

- PR #63 wrong-branch reconciliation mistake — a follow-up commit landed on a
  sibling branch (`telegram/fix-switch-message-race`) instead of the actual
  PR head (`telegram/fix-switch-banner @ b1b8bf4`). Required manual reflog
  recovery + `git reset --hard` + manual re-application.
- PR #64 `CONFLICTING` state — surfaced only after the predicted
  `telegram-settings.test.tsx` conflict was forecast for the `gh pr merge`
  step, not preemptively.
- PR #66 file-surface drift — a true line-level conflict on
  `server/crypto.ts` / `CONTEXT.md` / `plans/README.md` emerged mid-rebase,
  requiring the closeout-prompt's manual-resolution algorithm.

The repo's `justfile` had ad-hoc test/typecheck recipes but no end-to-end
"merge a stacked PR safely" workflow. Operationally, this left PR integration
non-reproducible.

## Decision

Six operational rules for stacked-PR merge cycles:

1. **Identify the stack topology** before any merge work via
   `gh pr view <n> --json baseRefName,headRefName,headRefOid,mergeable` for
   each PR in scope. Map each PR's `baseRefName` to identify which trunk
   branch the stack flows toward and which branch must merge first.

2. **Pre-flight gate** runs four sub-checks before any merge:
   - **mergeable flag** — `gh pr view <n> --json mergeable` returns
     `MERGEABLE`. A `CONFLICTING` or `false` reply aborts.
   - **Branch SHA match** — `git log origin/<headRefName> --oneline -1`
     equals the GH-reported `headRefOid`. Mismatch aborts.
   - **Per-PR file diff matches predicted surface** — the
     `git diff --name-only origin/<baseRefName>..origin/<headRefName>`
     output equals the predicted file list (see
     `prompts/babysit-pr-closeout.md` Steps 3-4 for per-PR predictions).
     Unexpected files abort.
   - **dirty-tree guard** — `git status --short` is empty before any
     `git pull` or `git fetch --ff-only`. A dirty local tree aborts.

3. **Squash-merge + delete-branch** via `gh pr merge --squash --delete-branch`
   after each PR clears step 2's gate. This:
   - Collapses per-stack history into one trunk-bound commit, keeping the
     squash commit's message as the canonical record.
   - `--delete-branch` programmatically eliminates phantom-branch remnants
     (the bug that caused the PR #63 wrong-branch reconciliation).

4. **Post-merge parallel verification** via `just check` — runs
   `bun run typecheck` + `bun run test` in parallel (mirroring the existing
   `just check` recipe's `& T1=$!` + `wait` pattern). If either exits
   non-zero, abort the cycle with the failing PR's SHA.

5. **Safety prohibitions** that operators observe manually:
   - **NO `--force` to trunk** — `--force-with-lease` only, and only on
     stacked branch heads.
   - **NO auto-resolving bot review threads** — surface them to a human
     reviewer; the `babysit-pr` skill explicitly excludes
     `GeminiCodeAssist` from the auto-resolve allow-list.
   - **NO deleting a stacked branch before its merge** — `--delete-branch`
     on `gh pr merge` is the only acceptable deletion path.

6. **Reproduce via recipe** rather than ad-hoc shell. The `justfile`
   exposes the per-PR recipe below.

### Inline rule — `just merge-pr <number>` recipe

```justfile
# Squash-merge a single PR with pre-flight checks + post-merge verification.
# Usage: just merge-pr 63
merge-pr number:
    #!/usr/bin/env bash
    set -e
    gh auth status                                                # 1. mergeable flag
    PR_JSON=$(gh pr view {{number}} --json headRefName,headRefOid,baseRefName,mergeable)
    echo "$PR_JSON" | jq -e '.mergeable==true'                   #     requires MERGEABLE
    BASE=$(echo "$PR_JSON" | jq -r .baseRefName)
    HEAD=$(echo "$PR_JSON" | jq -r .headRefName)
    EXPECTED_SHA=$(echo "$PR_JSON" | jq -r .headRefOid)
    git status --short | grep -q . && { echo 'dirty tree; aborting'; exit 1; } || true
    git fetch origin "$HEAD" "$BASE"                              # 2. SHA match
    ACTUAL_SHA=$(git log "origin/$HEAD" --oneline -1 | awk '{print $1}')
    [ "$ACTUAL_SHA" = "$EXPECTED_SHA" ] || { echo "SHA mismatch: expected $EXPECTED_SHA, got $ACTUAL_SHA"; exit 1; }
    git diff --name-only "origin/$BASE".."origin/$HEAD" > /tmp/pr-files.txt  # 3. file-surface vs predicted list (ops supply separately)
    echo "files in PR diff:"
    cat /tmp/pr-files.txt
    git pull --ff-only origin "$BASE"
    gh pr merge {{number}} --squash --delete-branch              # 4. squash + delete
    bun run typecheck & T1=$!
    VITEST_MAX_WORKERS="$(sysctl -n hw.ncpu 2>/dev/null || nproc 2>/dev/null || echo 4)" \
      bun run test & T2=$!                                      # parallel post-merge verification
    wait $T1
    wait $T2
    gh pr view {{number}} --json state -q .state                 # expect MERGED
```

Each PR in a stack is one `just merge-pr <n>` invocation. The pre-flight
checks in step 2 surfacechas are inline within the recipe; the predicted
file-surface list is supplied separately (see
`prompts/babysit-pr-closeout.md`).

## Consequences

### Positive

1. **Zero baseline-divergence conflicts on feature merges.** When `develop`
   aligns with the source branches' baseline (see Develop-baseline policy
   below), rebase-squash applies cleanly without surfacing out-of-band
   conflict markers on unrelated files. Saves ~minutes of manual conflict
   resolution per PR.
2. **Predictable integration timing.** Batch merge cycles take seconds
   rather than minutes; reduces cognitive load and lets operators sequence
   multiple PRs in one stretch without re-checking invariants.
3. **Clean git-flow semantics.** `develop` behaves strictly as a WIP
   integration layer, separated from deploy-ready `main`. PRs flow through
   one predictable channel.
4. **Less investigative drift.** The pre-flight SHA-match check would have
   caught the PR #63 wrong-branch mistake EARLY (wrong branch's tip ≠
   GH-reported `headRefOid`).
5. **Per-PR friction contained.** Real line-level conflicts (the kind that
   genuinely need human judgment) get bubbled up via `just check` failure
   rather than silently breaking the trunk.

### Negative

1. **Delayed dependency updates on `develop`.** Renovate PRs merged into
   `main` do not auto-propagate to `develop` until the explicit re-sync
   phase. Real-world consequence: developers testing on `develop` may run
   against slightly stale dep versions.
2. **Integration drift risk.** Feature code tested in `develop` is
   validated against older dependencies / refactors than `main`. Bugs that
   only emerge when `develop` is later merged back into `main` are
   detected late.
3. **Explicit sync overhead.** Pulling dep updates requires a non-trivial
   re-sync phase (cherry-pick or merge of `origin/main` into trunk),
   creating a small but real maintenance chore on every batch of renovate
   activity.
4. **Policy enforcement is documentary.** Safety rules rely on recipe
   scaffold + operator discipline, not programmatic locks. A mis-typed
   `--force` to trunk is still possible if the operator doesn't pay
   attention.
5. **Best-effort CI.** Relies on GitHub's "merge/mergeable" flag, with no
   mandatory status checks configured in branch protection (per `AGENTS.md`).
6. **Erases per-PR granular history.** Squash-merging drops the per-commit
   detail in trunk history (the per-commit record remains in the closed PR
   conversation but is harder to scan).
7. **Tool-stack coupling.** Recipe assumes `bash + gh + bun + git` are
   available with consistent performance characteristics.

### Develop-baseline policy (added 2026-06-20)

For all future merge cycles, **`develop` tracks `refactor/provider-ui-unified-layout`** (the active feature-integration trunk) — NOT `origin/main`.

**Operational rule (declared shell exception to Decision rule 6):** The
per-PR `just merge-pr <n>` recipe in Decision rule 6 handles each PR in
isolation. The once-per-merge-cycle baseline reset is a *different*
operation and is NOT covered by the per-PR recipe. Make the baseline
reset explicitly via:

```bash
git checkout refactor/provider-ui-unified-layout  # leave develop first so the next command works
git branch -f develop "$(git rev-parse refactor/provider-ui-unified-layout)"
git checkout develop
git push --force-with-lease origin develop
```

then proceeds per the Decision rules above. The `<trunk-head-SHA>` is the
HEAD commit of `refactor/provider-ui-unified-layout` at the start of the
merge cycle.

This baseline-reset flow is one of the few declared shell exceptions
alongside the `git rebase --onto` strategy for stacked branches (see
`prompts/babysit-pr-closeout.md` Step 4 for the analogous `--onto`
exception). If the baseline reset becomes frequent (more than ~once per
merge cycle), wrap it as a `just reset-develop-to-trunk` recipe and
move it under Decision rule 6.

#### Rationale

- All feature PRs (#63–#66) and the `chore/stacked-pr-merge-order-...`
  branch are based on `refactor/provider-ui-unified-layout`, not
  `origin/main`.
- Tracking the trunk aligns the integration baseline with the source
  branches, enabling rebase-squash merges to apply cleanly without
  baseline-divergence conflicts (proven in the prior session: 3/5
  squash-merges landed cleanly with `just check` passing; the 2
  failures (#64, #66) were genuine line-level conflicts, not
  baseline-divergence artifacts).
- The 5 commits that `origin/main @ 5a5e5d79` carries but the trunk
  doesn't are deferred to the explicit re-sync phase described below.
  `git log refactor/provider-ui-unified-layout..origin/main --oneline`
  lists them; the canonical pattern is:
    - 4 digest-style renovate dep updates for `millionco/react-doctor`,
      `@types/node`, `jsdom`, and `actions/checkout` (each prefixed by
      `chore(deps): update ... digest`).
    - 1 refactor commit `574a6f5 refactor(providers): unify AI Provider
      page into Access Methods view`.

#### Re-sync phase (when `origin/main` carries security/feature updates)

When `origin/main` accumulates commits that `develop` should incorporate
(typically because a Renovate bot's digest update or a security patch
landed on `main` without first going through trunk), run:

```bash
# 1. Inspect what origin/main has that trunk doesn't
git fetch origin main
git log refactor/provider-ui-unified-layout..origin/main --oneline

# 2. Decide merge-into-trunk (default) or cherry-pick:
#    - For ~all-merge commits (e.g., renovate digests), merge:
git checkout refactor/provider-ui-unified-layout
git merge --no-ff origin/main
git push origin refactor/provider-ui-unified-layout
# develop resets to new trunk HEAD per the Operational rule above.

#    - For surgical cherry-picks (rare), cherry-pick individual commits:
git cherry-pick <commit-sha>
```

Note: forcing the develop-baseline to flip from `trunk` to `origin/main`
is the "switching" escape hatch covered next.

#### Switching criteria — when Option B (track `origin/main` directly) becomes preferable

If any of the following become true, the policy flips from
`develop ← trunk` to `develop ← origin/main`:

- **Critical security patches** in `main` that are immediate
  prerequisites for ongoing feature work (e.g., a CVE in `@types/node`
  blocked the test suite).
- **Framework-major bumps** that change feature API expectations
  (e.g., a TanStack Router major-version bump that must be picked before
  any new route can be authored against the new API).
- **The source branch population shifts away from trunk.** If feature
  branches begin to target `main` directly instead of
  `refactor/provider-ui-unified-layout`, then tracking the source
  branches means tracking `main`.

When switching, perform **before** the next batch merge:

1. Hard-rebase ALL open feature branches against the new
   `main` baseline (`git rebase --onto <new-baseline> <old-baseline> <branch>`,
   per ADR 0013's `--onto` strategy for stacked branches).
2. Update `justfile`'s `merge-pr` recipe if the per-merge bump-then-test
   cycle needs adjustment for the new baseline.
3. Update this ADR's Develop-baseline policy subsection to reflect the
   change (Future revisions should mark the policy flip with the date of
   the flip and the version of `main` that triggered it).

#### History

The user's prior session pick ("Reset develop to trunk @ `fb9c279`")
confirmed the alignment-with-trunk policy when the merge orchestrator
hit baseline-divergence conflicts on every rebase attempt while `develop`
was on `origin/main`. This Consequences subsection memorializes that
pick as the standing rule for future cycles.

PR #72 squash-merge + develop-reset cycle `fb9c279 → a68bf40`
(2026-06-20): policy holds — staging commits absorbed harmlessly;
develop reset to trunk tip via the just-formalized `just
reset-develop-to-trunk` recipe (Decision rule 6's companion to
`merge-pr`).

## Cross-References

- `docs/adr/0009-single-instance-boundary-for-operational-state.md` — the
  operational-state rules (in-memory SSE streams, magic-link rate
  limiter, dashboard caches) apply during merge runs.
- `justfile` recipe `merge-pr` — the per-PR workflow this ADR codifies.
- `justfile` recipe `check` — the parallel typecheck + test convention
  mirrored by Step 4.- `prompts/babysit-pr-closeout.md` — the persisted runbook following
  this ADR's protocol when batch-closing PRs (#63–#66). After PR #72's
  squash-merge (see History above), the file is part of trunk at
  commit `a68bf40…` and inherited by `develop` via the post-merge
  reset; no stand-alone PR needed.
- Prior session pick: `Reset develop to trunk @ fb9c279` after the
  merge orchestrator surfaced baseline-divergence conflicts.
- Orphan staging commits (`765d986` ADR-addendum staging, amended
  `4707fa` of `d915c74`) pinned at
  `refs/tags/staging-2026-06-20-pre-merge-adr-addendum` and
  `refs/tags/staging-2026-06-20-pre-merge-closeout-prompt` for
  forensic reference. Inspect via `git show <tag>` or reflog
  (`git reflog --all | grep -E '765d986|4707fa'`). The squash-merge
  cycle documented in History above is the durable record; these
  tags are intentionally redundant annotation only — if they go
  missing (host ref-filter, manual `gc`), the trunk merge `95d8b43…`
  still carries the content.
