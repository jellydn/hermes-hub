# Plan 004: The auth/ownership guard layer has direct unit tests

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in "STOP conditions" occurs, stop and report — do not improvise.
> When done, update the status row for plan 004 in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 29c3b46..HEAD -- server/request-guards.ts`
> If it changed since this plan was written, compare the "Current state" excerpt
> against the live file before proceeding; on a mismatch, treat it as a STOP
> condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests (security boundary)
- **Planned at**: commit `29c3b46`, 2026-06-14

## Why this matters

`server/request-guards.ts` is the reusable server-side authorization seam:
`requireAuthSession` (401 when unauthenticated), `requireOwnedServer` /
`requireOwnedServerById` (404 when a server isn't owned by the caller — the IDOR
check), and `requireOwnedServerSsh*` (resolves SSH config or 400). It is consumed
by `deploy.ts`, `web-ui/handlers.ts`, `settings/mcp.ts`, `agent-skills.ts`, and
`codex-auth/handler.ts`, yet has **no direct test**. A regression here (e.g.
dropping the `userId` filter, or returning the session instead of a 401/404)
weakens access control across every consumer at once. These tests pin the status
codes and the resolved shapes so the boundary can't silently regress. They are
also the safety net for the later guard-consolidation refactor (DEBT-01).

## Current state

`server/request-guards.ts` (full, unchanged at `29c3b46`):

```ts
import type { Context } from "hono";
import { getAuthSession } from "./auth";
import { isResponse } from "./lib/is-response";
import {
  getOwnedServerRecord,
  type OwnedServerRecord,
  resolveServerSshConfigOrError,
} from "./server-records";

export async function requireAuthSession(context: Context) {
  const session = await getAuthSession(context.req.raw.headers);
  if (!session) return context.json({ error: "Unauthorized" }, 401);
  return session;
}

async function requireOwnedServerById(context, serverId, session?) {
  const resolvedSession = session ?? (await requireAuthSession(context));
  if (isResponse(resolvedSession)) return resolvedSession;
  const server = await getOwnedServerRecord({
    serverId, userId: resolvedSession.user.id,
  });
  if (!server) return context.json({ error: "Server not found" }, 404);
  return { session: resolvedSession, server, serverId };
}

export async function requireOwnedServer(context) {
  const serverId = context.req.param("id");
  if (!serverId) return context.json({ error: "Server ID is required" }, 400);
  return requireOwnedServerById(context, serverId);
}

export async function requireOwnedServerSshById(context, serverId, session?) {
  const owned = await requireOwnedServerById(context, serverId, session);
  if (isResponse(owned)) return owned;
  const sshResult = resolveServerSshConfigOrError(owned.server, owned.session.session.id);
  if (!sshResult.ok) return context.json({ error: sshResult.error }, 400);
  return { ...owned, authMethod: sshResult.authMethod, credential: sshResult.credential };
}

export async function requireOwnedServerSsh(context) {
  const serverId = context.req.param("id");
  if (!serverId) return context.json({ error: "Server ID is required" }, 400);
  return requireOwnedServerSshById(context, serverId);
}
```

Key facts for the tests:
- Dependencies to mock: `getAuthSession` (from `./auth`), `getOwnedServerRecord`
  + `resolveServerSshConfigOrError` (from `./server-records`). `isResponse`
  (from `./lib/is-response`) is a pure helper — do NOT mock it; let it run.
- A `Context` can be faked as a plain object exposing:
  - `req.raw.headers` (any value — passed straight to the mocked `getAuthSession`)
  - `req.param(name)` → returns the route param (e.g. `"id"`)
  - `json(body, status)` → return a real `Response` so `isResponse(...)` is true.
    The simplest faithful fake: `json: (body, status) => new Response(JSON.stringify(body), { status })`.
- A session shape: `{ user: { id: "u1" }, session: { id: "s1" } }`.

### Conventions to follow

- Co-locate as `server/request-guards.test.ts`.
- Vitest, node env. Mocking pattern with `vi.hoisted` + `vi.mock`: see
  `server/settings/mcp/secrets.test.ts` for the exact idiom.
- Assert on the returned value: either a `Response` (check `.status`) or the
  resolved context object (check `.server`, `.authMethod`, etc.).

## Commands you will need

| Purpose   | Command | Expected on success |
|-----------|---------|---------------------|
| Run test  | `bun run test server/request-guards.test.ts` | all pass |
| Typecheck | `bun run typecheck` | exit 0 |
| Lint      | `bunx @biomejs/biome check server/request-guards.test.ts` | exit 0 |
| Full test | `bun run test` | all pass |

## Scope

**In scope** (only file you create):
- `server/request-guards.test.ts`

**Out of scope** (do NOT modify):
- `server/request-guards.ts` — tests only. If a test reveals a real bug, STOP
  and report.
- Any consumer handler or `server-records.ts` / `auth.ts`.

## Git workflow

- Branch: `advisor/004-test-request-guards`
- One commit; conventional commits, e.g.
  `test(request-guards): cover auth and ownership boundary`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Create `server/request-guards.test.ts`

Build a `makeContext({ param, headers })` helper that returns the fake `Context`
described above. Mock `./auth` and `./server-records`. Cases:

`requireAuthSession`:
1. No session → returns a `Response` with status 401.
2. Session present → returns the session object (not a Response).

`requireOwnedServer`:
3. Missing `id` param → `Response` status 400.
4. Authenticated but `getOwnedServerRecord` returns null → `Response` 404.
5. Authenticated + owned → returns `{ session, server, serverId }` with the
   server from the mock and `getOwnedServerRecord` called with the
   session's `user.id` (assert the `userId` argument — this is the IDOR guard).
6. Unauthenticated (no session) → `Response` 401 (propagated from
   `requireAuthSession`).

`requireOwnedServerSsh`:
7. Owned + `resolveServerSshConfigOrError` returns `{ ok: true, authMethod,
   credential }` → returns context including `authMethod` + `credential`.
8. Owned + `resolveServerSshConfigOrError` returns `{ ok: false, error }` →
   `Response` 400 with that error.
9. Missing `id` param → `Response` 400.
10. Not owned → `Response` 404 (propagated).

**Verify**: `bun run test server/request-guards.test.ts` → all pass (≥10 tests).

### Step 2: Run the full gate

**Verify**:
- `bun run typecheck` → exit 0
- `bunx @biomejs/biome check server/request-guards.test.ts` → exit 0
- `bun run test` → all pass

## Test plan

- New file `server/request-guards.test.ts` with the ~10 cases above, especially
  the `userId`-argument assertion (the ownership/IDOR boundary).
- Structural pattern: `server/settings/mcp/secrets.test.ts` (hoisted mocks).
- Verification: `bun run test server/request-guards.test.ts` → all green.

## Done criteria

ALL must hold:

- [ ] `server/request-guards.test.ts` exists and covers 401 (no session),
      400 (missing id), 404 (not owned), success shape, and the SSH `ok:false` → 400 path
- [ ] At least one test asserts `getOwnedServerRecord` is called with the
      session's `user.id` (the ownership filter)
- [ ] `bun run test server/request-guards.test.ts` passes
- [ ] `bun run typecheck` exits 0
- [ ] `bunx @biomejs/biome check server/request-guards.test.ts` exits 0
- [ ] `bun run test` passes
- [ ] `git status` shows only `server/request-guards.test.ts` added
- [ ] `plans/README.md` status row for 004 updated to DONE

## STOP conditions

Stop and report (do not improvise) if:

- `server/request-guards.ts` no longer matches the "Current state" excerpt.
- A test for the documented status codes fails — report it (the boundary may
  have changed or have a real defect) rather than rewriting the assertion.
- Faithfully faking `Context` proves impossible without importing real Hono
  internals — report the blocker (a minimal fake should suffice).

## Maintenance notes

- These tests are the safety net for DEBT-01 (migrating the ~8 handlers that
  still hand-roll `getAuthSession` onto these helpers). Land this before that
  refactor.
- A reviewer should confirm the `userId`-argument assertion exists — it's the
  single most important line (the cross-tenant boundary).
