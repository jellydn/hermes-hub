# Plan 006: Extend httpsMiddleware to credential-bearing GETs

| Field | Value |
|---|---|
| Status | in-progress |
| Category | security |
| Audit finding | #6 (priority) |
| Audit SHA | `8ff4b72` |
| Depends on | none |

## Why

`server/app.ts` wraps every **mutating** route in `httpsMiddleware`, per
AGENTS.md:

> Mutating API routes in `server/app.ts` are wrapped in `httpsMiddleware`
> → `requireHttps()`. In production, the guard requires either `https://`
> on the request URL or `x-forwarded-proto: https` from the upstream proxy.

Read endpoints are unguarded. Several of them can return material that
the AGENTS.md rationale ("credential-bearing mutating routes") would
suggest should be guarded too:

- `streamServerInstallEvents` (`apiApp.get("/servers/:id/install/events", …)`)
  returns install events that may contain host key URLs, SSH errors,
  or compose-file echoes carrying the Docker image / env.
- `getLatestServerInstallLog` (`apiApp.get("/servers/:id/install/log", …)`)
  returns the install log blob — same risk surface.
- `getServerWebUiStatus` (`apiApp.get("/servers/:id/web-ui", …)`)
  returns the deploy status that includes ports, hosts, and routing
  information.

The non-credential reads (`/servers` list, server detail, telegram
pairings list, model-access-options) are *plainly* non-credential and
can stay unguarded. This plan applies the guard to the three above
only.

## Recon (do not re-derive)

- `httpsMiddleware` is defined at `server/app.ts:90-95`.
- `requireHttps` (the gate inside it) comments at `:64-88` document
  exactly what it checks.
- Tested by `server/app.test.ts` — `requireHttps` is exercised
  directly via `createContext`.
- AGENTS.md notes the design intent; this plan tightens the
  consistent application, not the design itself.

Build commands:
- `bun run typecheck`
- `bun run test -- server/app.test.ts`

## Files in scope

- `server/app.ts` — add `httpsMiddleware` to three specific GET
  routes listed below.

## Files explicitly out of scope

- The other unguarded GETs (`/api/servers`, `/api/dashboard/status`,
  `/api/logs`, `/api/telegram/model-access-options`,
  `/api/telegram/pairings`, `/api/servers/:id`,
  `/api/providers/codex-auth/status`).
- `requireHttps` itself — unchanged.
- Hono-level route authentication guards (`requireAuthSession`).
  These routes are already authenticated; this plan is about
  transit encryption, not auth.

## Current state at `8ff4b72`

`server/app.ts` — three unguarded GETs that can return credential-
adjacent data:

```ts
apiApp.get("/servers/:id/install/events", streamServerInstallEvents);
apiApp.get("/servers/:id/install/log", getLatestServerInstallLog);
apiApp.get("/servers/:id/web-ui", getServerWebUiStatus);
```

The comment block in AGENTS.md says "mutating API routes" — these
three are explicitly read-only. The guard is not currently applied.
Either the guard's rationale (transcript protection of credential
material) extends to those reads, or AGENTS.md and the codebase need
to reconcile on which GETs are sensitive.

## Plan

Run in order; each step has a verification command.

1. **Apply `httpsMiddleware` to the three credential-adjacent GETs.**

   In `server/app.ts`, change:

   ```ts
   apiApp.get("/servers/:id/install/events", streamServerInstallEvents);
   apiApp.get("/servers/:id/install/log", getLatestServerInstallLog);
   ```

   to:

   ```ts
   apiApp.get(
     "/servers/:id/install/events",
     httpsMiddleware,
     streamServerInstallEvents,
   );
   apiApp.get(
     "/servers/:id/install/log",
     httpsMiddleware,
     getLatestServerInstallLog,
   );
   ```

   For `/servers/:id/web-ui`, the surrounding `getServerWebUiStatus`
   is already wrapped — verify that's still the case at audit SHA
   before re-tagging it. If somehow unguarded in the working tree:
   add `httpsMiddleware` to that line too.

   Verify: `bun run typecheck` exits 0.

2. **Confirm no regression in `server/app.test.ts`.**

   Test pattern at `server/app.test.ts` constructs a context with
   `NODE_ENV=production` (or no override) and asserts the 426
   response from `requireHttps`. If any existing test asserts
   "GET /servers/:id/install/events succeeds over plain HTTP in
   production," that test now correctly fails. Update the test to
   reflect new semantics, **only if** doing so is consistent with
   intent.

   Run `bun run test -- server/app.test.ts`.
   Verify: the file's tests still pass. New failure → STOP and
   report.

3. **Short note in AGENTS.md or CONTEXT.md.**

   Add a 1-2 sentence update: "The `httpsMiddleware` guard also
   applies to credential-adjacent reads: install events / log and
   the web-ui status check, because they may include credential
   material in error paths." This keeps AGENTS.md in sync with the
   implemented behavior.

4. **Final pass.**

   `bunx @biomejs/biome check . && bun run typecheck && bun run test`.

   Verify: clean.

## Tests

This plan does not add new tests. The three guarded routes are
exercised indirectly through `server/app.test.ts`. If the executor
wants explicit assertions for *"install events fetch with
`x-forwarded-proto: http` returns 426":* add a small
`it(…)` case in `server/app.test.ts` using `createContext` and a
fake `install/events` route. Match the existing `requireHttps` test
pattern at the top of the file.

## Done criteria

- All three GETs at `/servers/:id/install/events`,
  `/servers/:id/install/log`, and (if applicable)
  `/servers/:id/web-ui` are wrapped in `httpsMiddleware`.
- `bun run typecheck` exits 0.
- `bun run test -- server/app.test.ts` passes; if a previously-
  passing test fails, STOP and report.
- AGENTS.md (or CONTEXT.md) note updated.

## Maintenance note

If a new GET endpoint is added that returns install / SSH / Hermes
state, add the guard by default unless the operator explicitly
documents why it's not needed. Treat the guard as required-by-
default for any endpoint that reads or streams state produced by a
credential-bearing mutator.

## Escape hatches

- If `app.test.ts` already has tests asserting that ONE of these
  three GETs succeeds over plain HTTP in production: STOP. The
  existing test is wrong; do not silently rewrite it. Report the
  conflict and let the operator decide.
- If the executor is unsure whether a fourth endpoint also returns
  credential material (e.g. logs in `getLogs`): default to NOT
  adding the guard; flag as a follow-up question. Coverage is the
  audit's responsibility, not the executor's.
