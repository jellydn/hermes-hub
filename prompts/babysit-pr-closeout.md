<!-- Run in fresh codebuff session as the ONLY task. -->

> **Operator note:** Run this prompt in a fresh codebuff session as the **only** task. The agent should not have other context interfering with the closeout flow. This file is the canonical persist of the babysit-pr closeout prompt drafted in the session that produced ADR 0013 (`docs/adr/0013-stacked-pr-merge-order-with-predicted-conflict-preflight.md`).

# Babysit PRs #63, #64, #65, #66 — final closeout

## Context — current state at run start (verify, do not trust blindly)

| PR | Branch | Base | Threads | mergeable | Notes |
|---|---|---|---|---|---|
| #63 | `telegram/fix-switch-banner` | `refactor/provider-ui-unified-layout` | 0 | ✅ | gemini conditional-clear landed (`commit messages stored on this branch`) |
| #64 | `telegram/test-switch-banner` | `telegram/fix-switch-banner` | 0 | ❌ CONFLICTING | file overlap with #63 on `src/features/telegram/telegram-settings.test.tsx` |
| #65 | `telegram/fix-magic-link-normalize` | `refactor/provider-ui-unified-layout` | 0 | ✅ | 400 Bad Request landed for overlong emails |
| #66 | `telegram/fix-decrypt-strict` | `telegram/fix-magic-link-normalize` | 1 | ✅ | gemini thread on `server/crypto.ts:95` (med priority; remediation text updated in plan 005 follow-up) |

Topology (2 stacks):

- Stack A: `trunk → #63 → #64`
- Stack B: `trunk → #65 → #66`

Before doing anything, run these checks for EACH of the four PRs to confirm:

1. **Branch SHAs match the table.** `gh pr view N --json headRefName,headRefOid` then `git fetch origin <headRefName>` + `git log origin/<headRefName> --oneline -1` — local origin SHA must equal `headRefOid`. Mismatch → STOP. (This is the check that would have caught the PR #63 wrong-branch reconciliation mistake — see "Lessons learned" below.)
2. **Per-PR file diff matches the predicted surface.** `git diff --name-only origin/<baseRefName>..origin/<headRefName>` — every file must appear in the canonical predicted conflict list defined in Steps 3 and 4 below (do not duplicate the list here; it may drift). Unexpected files → STOP.
3. **mergeable flag unchanged** (table column 5).
4. **open-thread count unchanged** (table column 4).

If any of these have changed since this prompt was last refreshed, STOP and surface the new state before proceeding. The Steps below assume the table is current.

**Lessons learned (real failure modes this prompt prevents):**
- **PR #63 wrong-branch mistake** (a follow-up commit landed on `telegram/fix-switch-message-race` instead of the actual PR head `telegram/fix-switch-banner`) — would have been caught by **check #2 above**: the wrong branch's actual file surface (plan-002 original) differed from the predicted surface (which included the conditional-clear). The executor would say "the conditional-clear is missing from this PR's diff" → STOP. Check #1 alone would NOT have caught it (the wrong branch had a valid remote SHA; GH just pointed at a different branch).
- **PR #64 `CONFLICTING` state** — surfaced via check #2 (predicted surface = `src/features/telegram/telegram-settings.test.tsx` only) AND via `gh pr view 64 --json mergeable` returning `CONFLICTING` (check #3). Either would have stopped the merge.

## Goals (in order)

1. Resolve the 1 remaining open gemini thread on PR #66 (auto-resolve only if `GeminiCodeAssist` API permits; otherwise surface for human triage per the `babysit-pr` skill's no-auto-resolve rule).
2. Resolve PR #64's CONFLICTING mergeable status by rebasing it onto the post-#63 trunk.
3. Merge #65 → #63 → #66 → #64 in dependency order.
4. Stop polling (`/tmp/babysit-pr-poll.sh`) once all 4 PRs enter MERGED state.
5. Run a final post-merge trunk health check (typecheck + tests).

## Pre-conditions

Run these once before any merge work. If any fails, STOP.

```bash
git fetch --all --prune
gh auth status                                                    # must show active session
git checkout refactor/provider-ui-unified-layout && \
    git pull --ff-only origin refactor/provider-ui-unified-layout  # trunk HEAD = origin HEAD
git status --short                                                # expect empty (no local drift)
```

Note: `just --show merge-pr` documents the per-PR recipe that this prompt's Steps 1-4 codify; `just merge-pr N` can be used as a shortcut for any individual step below while keeping the same safety gate behavior.

## Step 1 — Merge #65 (independent, lowest conflict risk)

```bash
gh pr view 65 --json mergeable              # must be MERGEABLE
gh pr checks 65                              # all checks SUCCESS or SKIPPED
gh pr merge 65 --squash --delete-branch
git fetch origin refactor/provider-ui-unified-layout
# verify: trunk HEAD == PR #65 headRefOid
```

If `gh pr merge` returns non-zero (non-MERGEABLE or conflict), STOP.

## Step 2 — Merge #63 (independent)

```bash
gh pr view 63 --json mergeable
gh pr merge 63 --squash --delete-branch
# verify: trunk HEAD == PR #63 headRefOid
```

If `gh pr merge` returns non-zero, STOP and surface for human triage.

## Step 3 — Rebase + merge #66 (was stacked on #65; #65 already merged)

```bash
git fetch origin telegram/fix-decrypt-strict
git checkout telegram/fix-decrypt-strict
git rebase origin/refactor/provider-ui-unified-layout
# Likely conflict sources (verify, do not trust):
#   - server/crypto.ts (overlap with plan 005 / #66; both pre-fix and post-fix versions exist)
#   - CONTEXT.md (operator-runbook carryover; remediation strings may differ)
#   - plans/README.md (status carryover; both PRs update the status table)
# Resolution: keep both PRs' reconciliation of plans/README.md status table cells; preserve
# the recomputed remediation strings (e.g. "redeploy the Telegram bot" rather than earlier
# "re-save via /api/providers") so a future operator sees a CONSISTENT remediation string.
git push --force-with-lease origin telegram/fix-decrypt-strict
gh pr merge 66 --squash --delete-branch
```

Note: `--force-with-lease`, NEVER `--force` to trunk.

## Step 4 — Rebase + merge #64 (was CONFLICTING; stacked on #63; #63 now in trunk)

```bash
git fetch origin telegram/test-switch-banner
git checkout telegram/test-switch-banner
git rebase origin/refactor/provider-ui-unified-layout
# Predicted conflict: src/features/telegram/telegram-settings.test.tsx
# Both PR #63 (conditional-clear describe block at end-of-file) and
# PR #64 (gemini stylistic hardenings in isDeployed-flip test +
# reject-unmocked fallback) modify this file. Resolution algorithm:
#   - Take #63's `describe("formReducer conditional message clearing", ...)`
#     block (formReducer + FormState import + 4 cases) intact.
#   - Take #64's:
#       - `expect(fetchMock).not.toHaveBeenCalled()`
#         (replacing the original mock.calls.every)
#       - dropped redundant `fetchMock.mockResolvedValueOnce(...)` slot
#       - explicit `if (url === "/api/telegram/pairings")` branch
#       - `return Promise.reject(new Error(\`Unexpected unmocked fetch: ${url}\`))`
#   - Verify the 4 new formReducer tests in #63 do not depend on the slots
#     removed by #64.
git push --force-with-lease origin telegram/test-switch-banner
gh pr merge 64 --squash --delete-branch
```

## Step 5 — Final health check (post all 4 merges)

```bash
git checkout refactor/provider-ui-unified-layout && \
    git pull --ff-only origin refactor/provider-ui-unified-layout
# Verify all 4 stacked branches are now empty relative to trunk:
for b in telegram/test-switch-banner telegram/fix-magic-link-normalize \
         telegram/fix-decrypt-strict; do
    if [ -n "$(git log --oneline refactor/provider-ui-unified-layout..refs/remotes/origin/$b 2>/dev/null | head -1)" ]; then
        echo "WARN: refs/remotes/origin/$b has unmerged commits relative to trunk"
    fi
done
# Expected: silent (no WARN)
bun run typecheck
bun run test
gh pr list --state merged --search "is:pr" | grep -E '#6(3|4|5|6)\b' || \
    echo "  no merged PRs in #63-66 — closeout fail"
# Expected: at least the 4 merged PR numbers
```

If typecheck or tests fail post-merge, the merges are already in trunk. STOP and surface for triage — do not attempt fixes via `--force` push to trunk.

## Stop conditions (HARD STOPS — surface to user, do not proceed)

- Any `gh pr merge` returns non-zero with a "merge conflict" message → STOP. Re-fetch the PR state and surface to the user. Do not attempt a click-through.
- `git rebase` produces a conflict in any file NOT in the predicted conflict list (server/crypto.ts, CONTEXT.md, plans/README.md, src/features/telegram/telegram-settings.test.tsx) → STOP and let the user decide.
- Post-merge `bun run typecheck` exits non-zero on trunk → STOP. Surface. The merge is in trunk and any fix must be a follow-up PR.
- Any gemini-code-assist review thread you cannot auto-resolve (the `babysit-pr` skill says gemini is NOT on the auto-resolve allow-list) → STOP, list the thread body + ID for the user to manually resolve via the GH web UI.

## Escalation rules

- DO NOT auto-resolve gemini-code-assist review threads — surface them.
- DO NOT force-push to `refactor/provider-ui-unified-layout` (trunk) under any circumstance; only `--force-with-lease` on the 4 stacked branch heads is acceptable. NEVER plain `--force` to trunk.
- DO NOT delete a stacked branch via `git push origin --delete <branch>` before its merge — `--delete-branch` on `gh pr merge` is the only acceptable deletion path.
- If a `git rebase` produces a non-trivial conflict (more than `<<<<<<<` / `=======` / `>>>>>>>` markers show), STOP and surface — do NOT attempt a 3-way resolution under time pressure.
- After all 4 merges complete, leave the local repo at `refactor/provider-ui-unified-layout` (do NOT leave on a deleted-branch tip; `git checkout refactor/provider-ui-unified-layout` at the end of Step 5 is mandatory).

## Cross-references

- `docs/adr/0013-stacked-pr-merge-order-with-predicted-conflict-preflight.md` —
  the operational rule this prompt codifies.
- `justfile` recipe `merge-pr` — the per-PR shortcut; this prompt's Steps 1-4
  each map to a single `just merge-pr N` invocation.
- `justfile` recipe `check` — the parallel typecheck+test convention mirrored
  by Step 5's verification gate.
- ADR 9 (`docs/adr/0009-single-instance-boundary-for-operational-state.md`) —
  the SSH pool rules apply to merge-day operators too; the deploy workflow
  referenced there assumes a single working tree which this prompt's
  pre-conditions enforce.
