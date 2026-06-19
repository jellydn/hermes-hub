# 13. Stacked-PR Merge Order with Predicted-Conflict Pre-Flight

Date: 2026-06-19

## Status

Accepted

## Context

HermesHub ships individual audit fixes as separate PRs against `refactor/provider-ui-unified-layout`. When two fixes in the same vault of audit follow-ups touch overlapping files (e.g., PR #63 modifies `src/features/telegram/use-model-access-controller.ts` and `src/features/telegram/telegram-settings.test.tsx`'s tail; PR #64 modifies the same `telegram-settings.test.tsx` for stylistic hardenings), the standard "merge everything when CI is green" approach generates avoidable merge conflicts on the dependent stack.

The first batch of fix-PRs (six originally — PR-1 through PR-6 from audit SHA `8ff4b72`) was designed as two independent stacks:

- Stack A (PR-1 / 002 / 003 / 008 / 009): `trunk → #63 → #64`. The plan stories separation is `001` (its own PR), `002` (PR #63), `003` (PR #63 cover for `useEffect([isDeployed, fetchOptions])` actually rolled into PR #63's `bfee4eb`/`b1b8bf4` head implementation per ADR test surface), `008` (negative model-switch test rolled into PR #63), `009` (test stylistic hardenings landed on PR #64).
- Stack B (PR-2 / 005): `trunk → #65 → #66`. PR #65 is plan 001 (magic-link limiter normalize), PR #66 is plan 005 (decrypt-plaintext-fallback) plus the gemini-thread helper extraction.

These stacks intersect in two places: the test surface (`src/features/telegram/telegram-settings.test.tsx` — touched by both #63's conditional-clear describe block and #64's stylistic hardenings), and the shared operator-runbook / status-tracking files (`server/crypto.ts`, `CONTEXT.md`, `plans/README.md`). GitHub's `mergeable` flag detected the conflict on PR #64 (`mergeable: CONFLICTING`) before any human had to rebase, but resolving it correctly required knowing the predicted conflict files in advance.

Three operational issues emerged during the babysit-iteration across these 4 PRs:

1. **Phantom-branches.** PR #63's gemini-thread follow-up commit landed on `telegram/fix-switch-message-race` instead of `telegram/fix-switch-banner`, leaving the wrong-branch commit orphaned until corrective action.
2. **Reactive conflict resolution.** Operators re-discovered the conflict surface mid-rebase, slowing the closeout flow.
3. **Sequential `gh pr merge` calls without verification gates.** Each merge happened in isolation with no post-merge typecheck+test gate.

## Decision

Standardize the merge sequence for stacked PRs as a single pre-flighted, dependency-ordered operation with a predicted-conflict list, operationalized by a single `just merge-pr <number>` recipe in `justfile`.

### Rule 1 — Identify the stack via `baseRefName`

Each PR's `baseRefName` is the parent of its head. For the stack `trunk → #63 → #64`, merge #63 first then #64; for `trunk → #65 → #66`, merge #65 first then #66. The `git diff --name-only refactor/provider-ui-unified-layout..$BRANCH` intersection across the stack produces the predicted-conflict file list (files two or more branches both modify).

### Rule 2 — Pre-flight checks (parallel-safe)

Before calling `gh pr merge N`, verify:

- `gh auth status` returns active — if not, bail with a clear error.
- `gh pr view N --json mergeable` returns `"MERGEABLE"` — if `"CONFLICTING"`, **stop** and surface the predicted-conflict file list to the operator.
- The local worktree has no uncommitted changes (`git status --short` returns empty) — operators must commit or stash before merging.

Note that `gh pr view --json mergeable` aggregates both file-conflicts AND required-check status into a single state. The recipe does not separately verify CI — it relies on GitHub's own mergeable calculation.

### Rule 3 — Squash-merge with `--delete-branch`

`gh pr merge N --squash --delete-branch` keeps trunk history linear (one squash commit per PR) and removes the head branch from `origin` after the merge. `--delete-branch` is critical: it eliminates the common "phantom branch survives merge" mistake, which the PR #63 follow-up commit landed on (`telegram/fix-switch-message-race` lived as an orphan for one babysit cycle before being deleted).

### Rule 4 — Post-merge parallel verification

Run `bun run typecheck` + `bun run test` in parallel (mirroring `just check`'s existing parallelism: `& T1=$!` + `wait $T1`). If either fails, the operator must STOP — the merge is already in trunk; surface for human triage.

### Rule 5 — Safety prohibitions (enforced by docstring NOT by code)

The recipe documents the following rules but does not programmatically enforce them (operators are trusted to read the warnings):

- **No `git push --force` on the trunk branch.** Only `--force-with-lease` on stacked-PR heads, never plain `--force` to trunk.
- **No auto-resolution of bot review threads** (per `babysit-pr` skill — gemini-code-assist is NOT on the auto-resolve allow-list).
- **No rebase squashing on a PR that just landed** — the merge is in trunk; any further fix must be a follow-up PR.

### Rule 6 — Operationalize as `just merge-pr <number>`

The recipe composes Rules 2-4 into a single reproducible step:

```just
# Pre-flight + squash-merge a single PR, then post-merge typecheck + tests.
# Usage: just merge-pr <number>
merge-pr number:
	#!/usr/bin/env bash
	set -euo pipefail
	PR="$1"
	if ! gh auth status >/dev/null 2>&1; then
		echo "ERROR: gh CLI not authenticated." >&2; exit 1
	fi
	mergeable=$(gh pr view "$PR" --json mergeable --jq '.mergeable')
	if [ "$mergeable" != "MERGEABLE" ]; then
		echo "ERROR: PR #$PR is not MERGEABLE (state: $mergeable)." >&2
		echo "Resolve conflicts first: git rebase origin/refactor/provider-ui-unified-layout on the PR's head." >&2
		exit 1
	fi
	if [ -n "$(git status --short)" ]; then
		echo "ERROR: Working tree dirty." >&2; exit 1
	fi
	gh pr merge "$PR" --squash --delete-branch
	bun run typecheck & T1=$!
	CPU="$(sysctl -n hw.ncpu 2>/dev/null || nproc 2>/dev/null || echo 4)"
	if [ "$CPU" -gt 6 ]; then CPU=6; fi
	VITEST_MAX_WORKERS="${VITEST_MAX_WORKERS:-$CPU}" bun run test & T2=$!
	wait $T1
	wait $T2
```

The recipe's parallelism convention mirrors `just check`'s existing pattern (`& T1=$!` + `wait`), reusing project conventions.

## Consequences

### Positive

- The merge sequence becomes reproducible from a single command: `just merge-pr 65 && just merge-pr 63 && <rebase+push PR #64/PR #66 onto trunk> && just merge-pr 66 && just merge-pr 64`
- The mergeable pre-flight catches the PR #64 `CONFLICTING` state deterministically — operators don't have to rediscover the conflict surface by glancing at gh-web
- `--delete-branch` removes phantom-branch mistakes at merge time, eliminating the PR #63 reconciliation cleanup step (deleting `telegram/fix-switch-message-race`) as a session-end chore
- Post-merge typecheck+test gate catches "merge breaks trunk" at commit-time instead of after deploy, mirroring the `just ci` pipeline philosophy
- The recipe's `set -euo pipefail` fails fast on any sub-command failure, surfacing the gh error immediately rather than continuing past a failed pre-flight
- Operators no longer carry around a hand-maintained "predicted conflict list" — the mergeable gate gives that information for free via gh's own computation

### Negative

- The recipe does not enforce Rule 5 prohibitions by code (operators can still force-push to trunk from outside `just merge-pr`). The docstring warns but does not prevent. A future hardening could add a pre-command `git config --get remote.origin.url` check or a CI blocking-merge hook
- `gh pr view --json mergeable` aggregates checks-into-mergeable, but a repo with NO required status checks will report `MERGEABLE` even when CI is red. HermesHub doesn't have branch protection requiring checks on `refactor/provider-ui-unified-layout`, so CI failure detection in this recipe is best-effort only
- Squash-merging erases per-PR commit history on trunk. The conditional-clear fix-up commit (PR #63 follow-up) is preserved on the GH PR page (post-merge conversation history) but is not part of trunk's `git log`. A future ADR requiring audit traceability to specific PR commits would need to look up the squash commit's body or the deleted head's reflog
- The `just merge-pr` recipe does not handle the rebase-onto-trunk step needed for `CONFLICTING` PRs (e.g., PR #64 at closeout start). A future recipe `just merge-pr-rebase <number>` could wrap that flow into a single command
- `VITEST_MAX_WORKERS` capping at 6 follows the `just check` convention but is a magic number. If a CI environment has fewer cores or different concurrency expectations, the cap may be too aggressive
- The recipe depends on `bash`, `gh`, `bun`, `git`, and `sysctl`/`nproc` all being on PATH. The current environment has all of these, but a Docker container or a CI environment without `nproc` will silently run with `4` workers (the fallback)

## Cross-References

- ADR 9 (`0009-single-instance-boundary-for-operational-state.md`) — the SSH pool rules apply to merge-day operators too; the deploy workflow referenced there assumes a single working tree which `just merge-pr` requires
- `justfile` — the `check` recipe's parallelism convention is mirrored by `merge-pr`'s post-merge verification block
- `prompts/babysit-pr-closeout.md` — the closeout prompt this ADR codifies into a just recipe (the prompt was drafted in session-2026-06-19)
