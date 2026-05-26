# HermesHub

Web app for non-technical users to deploy and manage a self-hosted Hermes AI Agent on a VPS (zero terminal required).

## State

**Scaffolded via CTA** — TanStack Start with file-based routing, TailwindCSS v4, shadcn-style UI primitives, Drizzle ORM, Hono API routing, and Better Auth magic-link auth are wired in. The Hermes-specific product flows are still being built story by story from the PRD and Ralph plan.

## Key Commands

```bash
bun run dev       # starts Vite dev server on port 3000
bun run build     # production build
bun run preview   # preview production build
bun run test      # vitest
bun run typecheck # TypeScript typecheck
```

## Package Manager

Use **bun** (not npm). Lockfile is `bun.lock`. Do not commit `package-lock.json`.

## Path Aliases

- `#/*` → `./src/*` (package.json `imports`)
- `@/*` → `./src/*` (tsconfig `paths`)

Both work. Prefer `@/` for readability.

## TypeScript

- `verbatimModuleSyntax: true` — must use `import type` for type-only imports
- `noUnusedLocals` / `noUnusedParameters` — strict
- `jsx: "react-jsx"` — no need to import React in JSX files

## Sources of Truth

- `tasks/prd-hermes-hub-mvp.md` — full PRD with user stories, schema, API routes
- `scripts/ralph/` — Ralph autonomous build agent loop

## Ralph Build System

```bash
./scripts/ralph/ralph.sh [max_iterations] [cli_tool] [model] [share]
```

- Iterates through `prd.json` stories one per run
- Progress tracked in `scripts/ralph/progress.txt`
- Prompt templates: `scripts/ralph/prompt-{opencode,amp,pi}.md`

## Architecture

- `app/` or `src/routes/` — TanStack Start routes (file-based)
- `server/` — Hono API routes and auth/server helpers
- `server/db/` — Drizzle ORM schema and migrations
- `server/ssh/` — SSH utilities (node-ssh or ssh2)
- `server/install/` — Hermes install orchestration with SSE events

## Conventions

- Add new routes under `src/routes/`; the scaffold is file-based and `routeTree.gen.ts` is auto-generated.
- Custom request branching belongs in `src/server.ts`; keep `/api/*` handling there and let the default TanStack Start handler serve everything else.
- Shared UI primitives should live in `src/components/ui/` with shadcn-style helpers in `src/lib/utils.ts`; use the shared `cn()` helper instead of ad hoc class string merging.
- Cross-layer provider metadata should live in `src/lib/ai-providers.ts` so the UI model pickers and server-side validation/test handlers stay in sync.
- Authenticated integration pages like AI Provider and Telegram should load their current summary through a route-level `createServerFn`, then let a feature component own the client-side form and action state.
- Form fields should keep helper and error copy outside the `<label>` element so accessible names stay stable for browser automation and Testing Library queries.
- Authenticated pages should reuse the shared `AppShell` exported from `src/routes/dashboard.tsx` so sidebar navigation, user header actions, and responsive layout stay consistent across dashboard sections.
- Nested dashboard pages should live under the parent route filename (for example `src/routes/servers.$id.install.tsx`) so TanStack Router generates child paths like `/servers/$id/install` automatically.
- Drizzle schema files live under `server/db/`, and `drizzle.config.ts` reads `DATABASE_URL` eagerly, so set that env var before running `drizzle-kit` commands.
- Persisted app entities in `server/db/schema.ts` use text primary keys with `gen_random_uuid()::text`; keep new tables aligned with that pattern unless an external integration requires a different key shape.
- Auth: Better Auth magic link only (no passwords, no OAuth); mount Better Auth directly in `server/app.ts` and keep any custom `/api/auth/*` aliases as thin request rewrites to the library's built-in routes.
- Better Auth wiring should stay lazy: create the auth instance inside a getter instead of at module load so page routes can still render when `DATABASE_URL` is missing, and use an absolute `baseURL` in `src/lib/auth-client.ts` because Better Auth rejects relative URLs during SSR.
- Encryption: AES-256-GCM for stored credentials (`ENCRYPTION_KEY` env var)
- Install progress is tracked in the latest `installs` row per server and mirrored through the in-memory SSE stream state in `server/install.ts`; when changing install steps, keep the DB log format and emitted event payloads in sync so reconnecting clients can replay prior progress.
- Vitest is configured through `vite.config.ts`, so run tests with `bun run test`; plain `bun test` uses Bun's runner and skips the repo's jsdom-backed setup.
- All destructive actions require confirmation dialog
- Supports Ubuntu 22.04+ / Debian 12+ VPS targets
- `routeTree.gen.ts` is auto-generated — do not edit
