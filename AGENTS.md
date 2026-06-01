# HermesHub

## Commands

- Use `bun`, not `npm` or `pnpm`. The lockfile is `bun.lock`.
- Main local commands are `bun run dev`, `bun run build`, `bun run test`, `bun run typecheck`.
- `just dev`, `just test`, `just typecheck`, and `just check` are thin wrappers around the Bun scripts.
- CI runs `bunx @biomejs/biome check .`, then `bun run typecheck`, then `bun run test`, then `bun run build`. Match that order when you touch JS/TS files.
- Do not use `bun test`; Vitest is configured in `vite.config.ts`, and the repo’s test command is `bun run test`.

## Verified Gotchas

- `bun run dev` serves Vite on port `3000`.
- `vite.config.ts` excludes `node-ssh`, `ssh2`, and `cpu-features` from `optimizeDeps` because server-only SSH code pulls native `.node` binaries that break Vite dev prebundling if reintroduced into the client scan.
- `src/routeTree.gen.ts` is generated. Do not edit it by hand.
- `biome.json` excludes `src/routeTree.gen.ts` from checks.
- `drizzle.config.ts` throws at import time if `DATABASE_URL` is missing.
- There is a `db:generate` script, but no local `db:migrate` script in `package.json`. The checked-in migration path is `drizzle-kit migrate` during deploy (`app.json`, `.github/workflows/deploy.yml`). Do not assume `bun run db:migrate` exists just because `README.md` mentions it.

## Architecture

- `src/server.ts` is the server entrypoint. It sends `/api/*` requests to the Hono app in `server/app.ts` and everything else to TanStack Start.
- `server/` holds the real backend logic: auth, DB, SSH, install orchestration, dashboard aggregation, providers, Telegram, and logs.
- `src/routes/` contains file-based TanStack Start routes. Keep route files thin and push UI into `src/features/`.
- Authenticated dashboard pages reuse `AppShell` from `src/routes/dashboard.tsx`.

## Data Flow Conventions

- Route-level `createServerFn` loaders are the normal pattern for authenticated page snapshots such as dashboard, logs, AI provider, and Telegram.
- `src/routes/servers.$id.tsx` is the exception: it fetches `/api/servers/:id` from the component with `useMountEffect` instead of using a route loader. Follow the existing pattern unless you are intentionally reshaping that page.
- Install progress lives in two places: persisted `install_events` rows (the single source of truth) and the in-memory SSE stream in `server/install/sse-stream.ts`. `installs.log` is a legacy column kept only for read-fallback during migration; do not write to it. When you change install events or replay behavior, keep both the rows and the in-memory stream in sync.
- Server action history is read from `audit_logs` rows named `server.action.*.succeeded|failed`, filtered by the indexed `audit_logs.server_id` column (not by JSON `details.serverId`) before `LIMIT 5`. The list query in `server/servers/list.ts` keys records on the returned `serverId` column.
- Rollback target resolution is `request targetVersion -> latest installs.version -> "latest"`.

## Auth And Runtime Constraints

- Better Auth is intentionally lazy in `server/auth.ts`; avoid moving auth initialization to module scope or pages will crash when `DATABASE_URL` is unset.
- `src/lib/auth-client.ts` uses an absolute SSR base URL from `BETTER_AUTH_URL` (fallback `http://localhost:3000/api/auth`). Keep it absolute.
- Mutating API routes in `server/app.ts` call `requireHttps()` in production. Preserve that guard on new credential-bearing endpoints.

## Frontend Conventions

- Prefer the shared `cn()` helper and existing UI primitives in `src/components/ui/`.
- Keep helper text and validation text outside `<label>` elements so Testing Library queries and browser automation keep stable accessible names.
- The repo has a deliberate mount-only escape hatch in `src/lib/use-mount-effect.ts`; use it for stable external subscriptions like polling or SSE when that pattern already exists.

## Database Conventions

- Drizzle schema lives in `server/db/schema.ts`.
- App-owned primary keys generally use `text(...).primaryKey().default(sql\`gen_random_uuid()::text\`)`. Follow that pattern for new app tables unless an external integration forces a different key shape.

## DB Transaction Boundaries

Use `db.transaction()` when a write path touches multiple Drizzle statements that must commit or roll back together to maintain consistency. The current transaction boundaries are:

- **`server/telegram.ts` — `deployTelegramToServer`:** SSH deploy succeeds, then config update + success audit log insert are wrapped in a single transaction. If the transaction fails, deploy state (`deployedServerId`, `deployedServerHost`, `apiServerKey`) is not persisted, keeping local DB consistent with the remote Hermes container.
- **`server/server-actions.ts` — `runServerAction`:** SSH action succeeds, then success audit log + install version update (SELECT then UPDATE on `installs`) are wrapped in a single transaction. If the version update fails, the audit log also rolls back, so rollout history and install version stay in sync.
- **`server/install/sse-stream.ts` — `emitInstallEvent`:** `install_events` row insert + `installs` row update are wrapped in a single transaction. If the update fails, the event row rolls back too, so SSE replay and the persisted install row never disagree.

**When to use transactions:** When a secondary write (e.g., audit log) is coupled to a primary write (e.g., config update), and the primary write being committed without the secondary would cause an inconsistent or unrecoverable state. Examples: deploy state changes, version tracking updates.

**When sequential writes are fine:** Primary data → audit log sequences where the audit log is purely historical and its absence doesn't affect correctness (e.g., server connect/disconnect, provider save, `server.install.started`). If the audit insert fails, the primary operation is still valid — no data divergence.

## Existing Instruction Chain

- `CLAUDE.md` only points at this file. Keep repo-specific agent guidance here.
