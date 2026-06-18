# Plans Index

Audit SHA: `8ff4b72`
Branch at audit: `refactor/provider-ui-unified-layout`
Upstream remote: `https://github.com/HuynhDucDung/hermes-hub` (private fork)

This index tracks two batches of findings from the same audit (commit
`8ff4b72`). Each plan stamps that SHA as its baseline; executors
running on a later SHA must open `git log 8ff4b72..HEAD` first to
capture drift before executing.

## Status table

| Status | Plan | Finding | Category | Effort |
|---|---|---|---|---|
| pending | [001 — magic-link limiter normalize](001-magic-link-limiter-normalize.md) | #1 | security | S |
| pending | [002 — model-switch success message race](002-model-switch-message-race.md) | #2 | correctness | S |
| pending | [003 — mount-effect re-fire on isDeployed flip](003-mount-effect-refire-on-isdeployed.md) | #3 | correctness | S |
| pending | [004 — ENCRYPTION_KEY rotation migration path](004-encryption-key-rotation.md) | #4 | security / tech-debt | L |
| pending | [005 — drop plaintext fallback in decryptApiServerKey](005-decrypt-plaintext-fallback.md) | #5 | security / tech-debt | S |
| pending | [006 — extend httpsMiddleware to credential-bearing GETs](006-https-guard-on-credential-gets.md) | #6 | security | S |
| pending | [007 — extract useStaleRef helper](007-controller-state-stale-ref.md) | #7 | tech-debt | S |
| pending | [008 — negative model-switch test](008-negative-model-switch-test.md) | #8 | test-gap | S |
| pending | [009 — narrow @tanstack/react-router test mock](009-narrow-router-mock.md) | #9 | tech-debt | S |
| pending | [010 — server deploy / telegram handler coverage](010-server-deploy-coverage.md) | #10 | coverage | M |

## Execution order

All ten plans are independent of each other — none blocks another.
Planned batching minimizes churn for the executor model and surfaces
clear PR boundaries:

- **Batch A (low-risk, isolated, UI-heavy):** 001, 002, 003, 005, 008,
  009. Touches ≤ 2 files per plan and stays within `server/app.ts`,
  `server/crypto.ts`, or the telegram settings/controller tree.
  Stacking them as a single PR is acceptable.
- **Batch B (test-only):** 008. Pure regression-test addition; can
  ship separately or alongside any neighboring feature PR.
- **Batch C (refactor foundation):** 007. Extracts `useStaleRef`
  helper before it is reused; ship as a stepping-stone PR.
- **Batch D (broad coverage):** 010. New unit tests for `server/telegram.ts`
  and `server/deploy.ts`; may need its own PR.
- **Batch E (architectural, needs operator):** 004. Touches
  `server/crypto.ts`, the `encryptedApiKey` storage path, and
  requires a `keyVersion` column. Run last or in a separate PR with
  explicit operator sign-off documented in the PR description.

> Plan 009 depends on plan 008's new test file existing in the same
> branch — bundle them, or apply 009 after 008 merges.

## Branching — suggested stack

```
PR-1: 002, 003, 008, 009    (UI correctness + test mocks; ~half-day)
PR-2: 001, 005               (rate-limit normalize + plain-text drop; ~hour)
PR-3: 007                    (useStaleRef extraction; ~hour)
PR-4: 010                    (server handler tests; ~half-day)
PR-5: 006                    (HTTPS guard on credential-adjacent GETs; ~hour)
PR-6: 004                    (key rotation migration; needs design sign-off)
```

## Conventions an executor must match

- Use `bun`, not `npm`/`pnpm`. Lockfile is `bun.lock`.
- Verification commands per the project (paste-verbatim):
  - typecheck → `bun run typecheck` (exit 0)
  - test targeted → `bun run test -- <globlike path>`
  - test full → `bun run test` (default `--reporter=dot --passWithNoTests`)
  - lint → `bunx @biomejs/biome check .` (read-only) or `biome check --write .`
  - full pipeline → `just ci`
- Path aliases (per ADR 0012): `#/*`, `#server/*`, `#shared/*`. Do not
  reintroduce `@/*`.
- Strict TS config — use `import type` for type-only imports, no `as any`.
- Vitest with `environment: "node"`; per-file `// @vitest-environment happy-dom`
  for DOM tests. Test ID regex pattern in `vite.config.ts`.
- `src/lib/use-mount-effect.ts` is a documented escape hatch (`biome.json`
  disables exhaustive-deps on it). Do not enable exhaustive-deps there.
  Plan 007 places `useStaleRef` next to it but does not need an
  override.
- `ssh2`, `node-ssh`, `cpu-features` are excluded from Vite
  `optimizeDeps`. Do not import in client code.
- Logs: `server/lib/logger.ts` (pino) — never use `console.log/error`
  in server code (AGENTS.md).

## Status tracking

Executors should update the table at the top of this file when
starting / finishing each plan. Status values: `pending`,
`in-progress`, `done`, `blocked`. If `blocked`, record the blocker
inside the plan file as a short note at the top.

## What this index does NOT include

The "Direction" suggestions from the audit (graceful `ENCRYPTION_KEY`
rotation as a product feature, live deploy-status polling, Discord/
Slack channel parity) are intentionally excluded. The direction list
exists for the maintainer to weigh, not for a single executor batch.
Any subset can be promoted via a follow-up `improve next` invocation.

## Audit revisited

Findings 6–10 were added to this index in a second pass after the
Top 5 batch landed in `plans/001-005`. The two batches together
cover the full set of 10 audit findings surfaced at HEAD `8ff4b72`.
