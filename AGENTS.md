# HermesHub

Web app for non-technical users to deploy and manage a self-hosted Hermes AI Agent on a VPS (zero terminal required).

## State

**Scaffolded via CTA** — TanStack Start with file-based router, TailwindCSS v4, and example components (`Header`, `Footer`, `ThemeToggle`). No Drizzle, Hono, or Better Auth installed yet. Full PRD and Ralph plan exist.

## Key Commands

```bash
bun run dev       # starts Vite dev server on port 3000
bun run build     # production build
bun run preview   # preview production build
bun test          # vitest
npm run typecheck # TypeScript typecheck
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

## Planned Architecture (not yet built)

- `app/` or `src/routes/` — TanStack Start routes (file-based)
- `server/` — Hono API routes (not yet installed)
- `server/db/` — Drizzle ORM schema and migrations (not yet installed)
- `server/ssh/` — SSH utilities (node-ssh or ssh2)
- `server/install/` — Hermes install orchestration with SSE events

## Conventions

- Add new routes under `src/routes/`; the scaffold is file-based and `routeTree.gen.ts` is auto-generated.
- Auth: Better Auth magic link only (no passwords, no OAuth) — **not yet installed**
- Encryption: AES-256-GCM for stored credentials (`ENCRYPTION_KEY` env var)
- All destructive actions require confirmation dialog
- Supports Ubuntu 22.04+ / Debian 12+ VPS targets
- `routeTree.gen.ts` is auto-generated — do not edit
