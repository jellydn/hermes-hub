# HermesHub justfile
# https://github.com/casey/just

# Dotenv files (.env) are loaded automatically — no explicit `set dotenv` needed

# Default recipe
default:
    @just --list

# Start the dev server
dev:
    bun run dev

# Production build
build:
    bun run build

# Preview production build
preview:
    bun run preview

# Run tests
test:
    bun run test

# TypeScript type check
typecheck:
    bun run typecheck

# Generate Drizzle migrations
db-generate:
    bun run db:generate

# Apply Drizzle migrations locally
db-migrate:
    bun run db:migrate

# Run all checks (typecheck + test, parallel for speed)
check:
	#!/usr/bin/env bash
	set -e
	bun run typecheck & T1=$!
	CPU="$(sysctl -n hw.ncpu 2>/dev/null || nproc 2>/dev/null || echo 4)"
	if [ "$CPU" -gt 6 ]; then CPU=6; fi
	VITEST_MAX_WORKERS="${VITEST_MAX_WORKERS:-$CPU}" bun run test & T2=$!
	wait $T1
	wait $T2

# Install dependencies
install:
    bun install

# Lint with Biome
lint:
    bunx @biomejs/biome check .

# Auto-format with Biome
format:
    bunx @biomejs/biome check --write .

# Run complete CI pipeline (lint, typecheck, test, build)
ci: lint typecheck test build

# Pre-flight + squash-merge a single PR, then post-merge typecheck + tests.
# Mirrors Steps 2-5 of the babysit-pr final closeout prompt codified in
# docs/adr/0013-stacked-pr-merge-order-with-predicted-conflict-preflight.md.
#
# SAFETY: never force-push to refactor/provider-ui-unified-layout from this
# recipe; the squash-merges here only ever land on the local ref-tracking of
# head branches which are deleted by --delete-branch after the merge.
#
# Usage: just merge-pr <number>
# Errors out (non-zero) on:
#   - gh CLI not authenticated
#   - PR not MERGEABLE (CONFLICTING means rebase the PR head first)
#   - Working tree dirty
#   - post-merge typecheck or tests failed
merge-pr number:
	#!/usr/bin/env bash
	set -euo pipefail
	PR="$1"
	if ! gh auth status >/dev/null 2>&1; then
		echo "ERROR: gh CLI not authenticated. Run 'gh auth login' first." >&2
		exit 1
	fi
	mergeable=$(gh pr view "$PR" --json mergeable --jq '.mergeable')
	if [ "$mergeable" != "MERGEABLE" ]; then
		echo "ERROR: PR #$PR is not MERGEABLE (state: $mergeable)." >&2
		echo "Resolve conflicts first: git rebase origin/refactor/provider-ui-unified-layout on the PR's head, then push --force-with-lease." >&2
		exit 1
	fi
	if [ -n "$(git status --short)" ]; then
		echo "ERROR: Working tree dirty. Commit or stash before merging." >&2
		exit 1
	fi
	echo "==> Squash-merging PR #$PR (deleting head branch)"
	gh pr merge "$PR" --squash --delete-branch
	echo "==> Post-merge verification (typecheck + tests, parallel)"
	bun run typecheck & T1=$!
	CPU="$(sysctl -n hw.ncpu 2>/dev/null || nproc 2>/dev/null || echo 4)"
	if [ "$CPU" -gt 6 ]; then CPU=6; fi
	VITEST_MAX_WORKERS="${VITEST_MAX_WORKERS:-$CPU}" bun run test & T2=$!
	wait $T1
	wait $T2
	echo "==> PR #$PR merged and verified: $(gh pr view "$PR" --json url --jq '.url')"
