# HermesHub

## Commands

- Use `bun`, not `npm` or `pnpm`. The lockfile is `bun.lock`.
- Main local commands are `bun run dev`, `bun run build`, `bun run test`, `bun run typecheck`.
- Also useful: `bun run doctor` (`react-doctor`), `bun run db:generate` (write a new Drizzle migration from the current schema), `bun run preview` (serve the built bundle), `bun run brand:assets` (regenerate brand assets).
- `just dev`, `just test`, `just typecheck`, `just ci`, and `just check` are thin wrappers around the Bun scripts; `just ci` is the full lint → typecheck → test → build pipeline.
- CI runs `bunx @biomejs/biome check .`, then `bun run typecheck`, then `bun run test`, then `bun run build`. Match that order when you touch JS/TS files.
- Do not use `bun test`; Vitest is configured in `vite.config.ts`, and the repo’s test command is `bun run test`.
- Pre-commit (`.pre-commit-config.yaml`) runs biome-check, then `bun run typecheck`, then `react-doctor --staged --blocking warning` on staged changes.
- `just check` runs typecheck + test in parallel (unlike `just ci` which is `lint -> typecheck -> test -> build`). Use `VITEST_MAX_WORKERS` to limit parallel test processes.
- All current tests live in `server/` (none in `src/`). Add new tests as `*.test.ts` co-located in `server/`.

## Verified Gotchas

- `bun run dev` serves Vite on port `3000`.
- `vite.config.ts` excludes `node-ssh`, `ssh2`, and `cpu-features` from `optimizeDeps` because server-only SSH code pulls native `.node` binaries that break Vite dev prebundling if reintroduced into the client scan.
- `src/routeTree.gen.ts` is generated. Do not edit it by hand.
- `biome.json` excludes `src/routeTree.gen.ts` from checks.
- `drizzle.config.ts` imports without `DATABASE_URL`; runtime DB access still throws from `getDb()` when the env var is missing.
- Local migration commands are `bun run db:migrate` and `just db-migrate`; both require `DATABASE_URL` and wrap `drizzle-kit migrate`. Deploy still runs migrations at startup via `scripts/start-production.mjs`.
- Path aliases: both `@/*` and `#/*` resolve to `./src/*` (set in `tsconfig.json` `paths` and `package.json` `imports`; Vite uses `resolve.tsconfigPaths: true`). `server/` is outside `src/`, so `src/routes/*` and `src/features/*` import backend modules via relative paths (`../../server/...`), and `server/` modules never use the `@/` alias.
- `tsc` is strict: `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax: true`. Use `import type` for type-only imports — Biome and the build will flag plain `import` of a type-only symbol.
- Vitest is configured with `environment: "node"` in `vite.config.ts` and globs `src/**` and `server/**` for `*.test.{ts,tsx}` files (no `*.spec.*` in practice). Use `node:test`-style globals or import from `vitest`; do not assume a DOM. Tests are co-located with the code they cover.
- Required env vars: `DATABASE_URL`, `ENCRYPTION_KEY` (generate with `openssl rand -hex 32`), `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`. See `.env.example`.
- Production startup (`scripts/start-production.mjs`) runs `drizzle-kit migrate` before starting the server — migrations run automatically on deploy.
- The deploy pipeline ships to two targets, both via GitHub Actions on `main` push: VPS (Docker Compose, image built from `Dockerfile`) and Dokku (`git push dokku HEAD:master`). Workflows live in `.github/workflows/`.
- Single-instance boundary (per `docs/adr/0009-single-instance-boundary-for-operational-state.md`): install SSE streams, session credentials, the magic-link rate limiter, and the dashboard caches are in-memory module-level state. They are not shared across nodes and are accepted as a temporary constraint.

## Architecture

- `src/server.ts` is the server entrypoint. It sends `/api/*` requests to the Hono app in `server/app.ts` and everything else to TanStack Start.
- `server/` holds the real backend logic: auth, DB, SSH, install orchestration, dashboard aggregation, providers, Telegram, and logs.
- `src/routes/` contains file-based TanStack Start routes. Keep route files thin and push UI into `src/features/`.
- Authenticated dashboard pages reuse `AppShell` from `src/routes/dashboard.tsx`.

## Data Flow Conventions

- Route-level `createServerFn` loaders are the normal pattern for authenticated page snapshots such as dashboard, logs, AI provider, and Telegram.
- `src/routes/servers.$id.tsx` is the exception: it fetches `/api/servers/:id` from the component with `useMountEffect` instead of using a route loader. Follow the existing pattern unless you are intentionally reshaping that page.
- Install progress lives in two places: persisted `install_events` rows (the single source of truth) and the in-memory SSE stream in `server/install/sse-stream.ts`. When you change install events or replay behavior, keep both the rows and the in-memory stream in sync.
- Server action history is read from `audit_logs` rows named `server.action.*.succeeded|failed`, filtered by the indexed `audit_logs.server_id` column (not by JSON `details.serverId`) before `LIMIT 5`. The list query in `server/servers/list.ts` keys records on the returned `serverId` column.
- Rollback target resolution is `request targetVersion -> audit history imageRef -> installs.version -> "latest"`.

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

## Reference Docs

- `CONTEXT.md` — domain glossary (Quick Win, Lazy Failure, Session vs Stored Credential, Bot Username, Client IP, etc.).
- `docs/api-reference.md` — full HTTP API reference.
- `docs/adr/` — 11 architecture decision records (TanStack Start + Hono, Postgres + Drizzle, Better Auth magic links, multi-stage Docker build, AES-256-GCM credential encryption, file-based routing, Tailwind v4, react-hook-form + Zod, single-instance boundary, Telegram runtime, Hermes Web UI SSH proxy).
- `docs/test-coverage-review.md` — gap analysis and test recommendations.
- `.planning/codebase/` — `STRUCTURE.md`, `ARCHITECTURE.md`, `CONVENTIONS.md`, `STACK.md`, `INTEGRATIONS.md`, `TESTING.md`, `CONCERNS.md` (rebuilt 2026-06-06).
- `DESIGN.md` — design notes and trade-offs.
- `tasks/prd-hermes-hub-mvp.md` — original MVP PRD.
- `scripts/ralph/` — Ralph autonomous-agent tooling (`prd.json`, `progress.txt`, `prompt-opencode.md`).

## Existing Instruction Chain

- `CLAUDE.md` only points at this file. Keep repo-specific agent guidance here.
