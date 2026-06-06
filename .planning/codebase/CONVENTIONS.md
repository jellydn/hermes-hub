# Coding Conventions

**Analysis Date:** 2026-06-02

## Naming Patterns

**Files:**
- `kebab-case.ts` for all source and test files, e.g. `server/install/sse-stream.ts`, `src/lib/dashboard-status.ts`, `src/features/dashboard/status-overview.test.tsx`.
- React components live in `.tsx` files whose filename matches the kebab-cased component (`server-list.tsx` exports `ServerList`).
- File-based TanStack Start routes use TanStack's dotted convention under `src/routes/`, e.g. `src/routes/servers.$id.install.tsx`, `src/routes/servers.new.tsx`.
- Test files are co-located beside the module they cover and end in `.test.ts` / `.test.tsx` (see `vite.config.ts` `test.include`).
- The generated router file `src/routeTree.gen.ts` is excluded from Biome (`biome.json`) and must not be edited by hand (per `AGENTS.md`).

**Functions:**
- `camelCase` for normal functions and exported helpers: `getDashboardStatusSnapshot` in `server/dashboard.ts`, `emitInstallEvent` in `server/install/sse-stream.ts`, `requireSession` in `src/lib/session.ts`.
- Boolean-returning helpers read like predicates: `hasDatabaseUrl` (`server/app.ts`), `tryClaimInstallStream` (`server/install/sse-stream.ts`).
- React components and hooks follow React conventions: `PascalCase` for components (`DashboardStatusOverview`, `ServerList`), `useCamelCase` for hooks (`useMountEffect` in `src/lib/use-mount-effect.ts`).

**Variables:**
- `camelCase` for locals and module-level bindings (`installStreams`, `staticCache` in `server/dashboard.ts`).
- `SCREAMING_SNAKE_CASE` for module-level constants representing tunables or durations: `IDLE_TIMEOUT_MS`, `HEARTBEAT_INTERVAL_MS` in `server/install/sse-stream.ts`, `STATIC_CACHE_TTL_MS` in `server/dashboard.ts`.
- Numeric literals use underscore separators for readability (`90_000`, `30_000`, `60_000`).

**Types:**
- `PascalCase` for `type` aliases: `DashboardStatusSnapshot`, `DashboardVpsSummary` in `src/lib/dashboard-status.ts`; `InstallStreamState`, `InstallEvent` in `server/install/sse-stream.ts`.
- The codebase prefers `type` aliases over `interface` — `rg "^interface "` over `server/db/schema.ts` and `src/lib/` returns nothing while `type X = { ... }` is pervasive (`src/lib/dashboard-status.ts:3`).
- Drizzle schema exports use `camelCase` for table bindings and `snake_case` for column SQL names: `pgTable("install_events", { installId: text("install_id"), ... })` in `server/db/schema.ts`.

## Code Style

**Formatting:**
- Biome 2.4.16 (`biome.json`) — formatter + linter in one tool. Run with `bunx @biomejs/biome check .` (CI) or `just format` to write fixes.
- Tabs for indentation, double-quoted strings, trailing commas — applied via Biome defaults; no overrides in `biome.json`.
- Tailwind CSS directives are enabled in the CSS parser (`biome.json` `css.parser.tailwindDirectives: true`).

**Linting:**
- Biome with mostly defaults. The only explicit rule override is `linter.rules.security.noDangerouslySetInnerHtml: "off"` in `biome.json`.
- `biome.json` `files.includes` excludes `dist`, `src/routeTree.gen.ts`, and `drizzle/` from analysis.
- TypeScript strictness is enforced via `tsconfig.json`: `strict`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `noUncheckedSideEffectImports`, `verbatimModuleSyntax`.
- `verbatimModuleSyntax: true` requires `import type` for type-only imports (see `import type { Context } from "hono"` in `server/install.ts`, `import type { EffectCallback } from "react"` in `src/lib/use-mount-effect.ts`).

## Import Organization

**Order (observed across `server/install.ts`, `src/features/dashboard/status-overview.test.tsx`, `src/components/ui/button.tsx`):**
1. External / third-party packages (`drizzle-orm`, `hono`, `react`, `@testing-library/react`, `vitest`).
2. Blank line, then internal modules — first cross-area imports (path alias `@/...` for client, relative `../` for server), then same-directory relatives (`./session`, `./status-overview`).
3. `import type` lines are interleaved with their value imports rather than grouped separately.

**Path Aliases:**
- `tsconfig.json` declares both `#/*` and `@/*` pointing at `./src/*`.
- In practice the codebase uses `@/...` everywhere in `src/` (e.g. `import { Button } from "@/components/ui/button"`, `import { requireSession } from "@/lib/session"`). The `#/*` alias is declared but not used in source.
- `server/` does not use path aliases — it uses relative imports (`./auth`, `./db`, `../src/lib/dashboard-status`).

## Error Handling

**Patterns:**
- HTTP route handlers in `server/` return JSON error envelopes via Hono's `context.json({ error: "..." }, status)` rather than throwing. Status codes follow REST conventions (`401` Unauthorized, `400` invalid input, `404` not found, `409` conflict, `503` dependency unavailable). See `server/install.ts:28-62` and the pattern repeated across `server/server-actions.ts`, `server/servers.ts`.
- Internal helpers that can fail at a domain level return discriminated result objects: `resolveServerSshConfigOrError` in `server/server-records.ts` returns `{ ok: true, ...config } | { ok: false, error: message }`; callers branch on `sshResult.ok`.
- `throw new Error(...)` is reserved for truly exceptional cases — missing required env vars (`server/auth.ts:15`), invalid inputs that should never reach a handler (`server/server-actions.ts:45` `Invalid image tag`), missing decrypted credentials (`server/server-records.ts:73`).
- Mutating API routes call `requireHttps()` in production before processing credential bodies (`server/app.ts` `requireHttps`, called from credential-bearing handlers — preserve this guard on new endpoints per `AGENTS.md`).
- Multi-write paths that must stay consistent use `db.transaction()` (documented in `AGENTS.md` — `emitInstallEvent` in `server/install/sse-stream.ts`, `runServerAction` in `server/server-actions.ts`, `deployTelegramToServer` in `server/telegram.ts`).

## Logging

**Framework:** Plain `console` — no logging library is used in the app.

**Patterns:**
- `console.*` is essentially absent from production code. The only matches under `server/` and `src/` (excluding tests) are in `server/lib/send-magic-link-email.ts`: `console.log` for the dev fallback that prints magic links when no email provider is configured, and `console.error` when the Resend API call fails.
- Persistent observability goes through audit logs (`audit_logs` table) inserted via `server/lib/insert-audit-log.ts` and read back through `server/logs.ts`. Install progress is published through SSE events in `server/install/sse-stream.ts`. Treat these — not `console` — as the primary log sinks.

## Comments

**When to Comment:**
- Comments explain *why*, not *what*: concurrency reasoning in `server/install.ts:54-58` ("Claim the in-process install slot synchronously before any await…"), build-time gotchas in `server/app.ts` `requireHttps` ("Uses globalThis.process to avoid Vite's build-time replacement…"), legacy fallback notes in `AGENTS.md`-aligned code (`installs.log` is read-only legacy).
- Sparse inline comments otherwise; named functions and types do most of the explanatory work.

**JSDoc/TSDoc:**
- Used sparingly on exported helpers whose contract deserves prose, e.g. the block comment on `requireHttps` in `server/app.ts` documents the deployment assumption, and `clearDashboardCache` in `server/dashboard.ts` has a one-line `/** ... */` summary.
- The `useMountEffect` helper in `src/lib/use-mount-effect.ts` uses a `biome-ignore` directive plus inline explanation rather than JSDoc, because it is the deliberate escape hatch (`AGENTS.md` calls this out).

## Function Design

**Size:** Functions are kept focused — most handlers in `server/app.ts`, `server/install.ts`, `server/dashboard.ts` are under ~50 lines and delegate heavy lifting to `server/<area>/` submodules (`server/install/records.ts`, `server/install/workflow.ts`, `server/dashboard/records.ts`, `server/dashboard/summaries.ts`).

**Parameters:**
- Hono handlers take a single `context: Context` argument (`startServerInstall(context: Context)` in `server/install.ts`).
- Internal helpers with more than ~2 inputs use a single object parameter with named fields: `getDashboardStatusSnapshot(input: { userId: string; sessionId?: string | null })` in `server/dashboard.ts`, `emitInstallEvent({ installId, serverId, runId, step, ... })` in `server/install/sse-stream.ts`. This matches the call sites in tests like `server/install/sse-stream.test.ts`.

**Return Values:**
- Async functions return `Promise<T>` with explicit return types where the contract is non-trivial (e.g. `Promise<DashboardStatusSnapshot>`).
- Domain helpers that can fail return discriminated unions (`{ ok: true, ... } | { ok: false, error }`) rather than throwing — see `server/server-records.ts`.
- Hono handlers always return `context.json(...)` (a `Response`).

## Module Design

**Exports:**
- Named exports only — no `export default` in source files (route components are an exception driven by TanStack Start file routing).
- Modules export both functions and the supporting types they need from one file (`server/install/sse-stream.ts` exports `installStreams`, `emitInstallEvent`, `ensureInstallStream`, `normalizeInstallStatus`, and the `InstallEvent` / `InstallStreamState` types together).
- Cross-cutting types live in `src/lib/*.ts` and are imported by both client and server (e.g. `server/dashboard.ts` imports `DashboardStatusSnapshot` from `../src/lib/dashboard-status`).

**Barrel Files:** Not used. There are no `index.ts` re-export files in `server/` or `src/`; every import targets the concrete module path. The closest thing is intentional re-exports inside a single module for the test surface, e.g. `server/dashboard.ts` re-exports `toAgentSummary`, `toProviderSummary`, `toTelegramSummary`, `getHealthTone` from `./dashboard/summaries` ("Re-exports for tests and route files").

---

*Convention analysis: 2026-06-02*
