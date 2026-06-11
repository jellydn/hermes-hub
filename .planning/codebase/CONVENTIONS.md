# Coding Conventions

**Analysis Date:** 2026-06-06

## Naming Patterns

**Files:**

- Source files use **kebab-case** with domain prefixes where helpful: `server-detail-page.tsx`, `use-mount-effect.ts`, `insert-audit-log.ts`, `host-key-fingerprint.ts`.
- Route files follow TanStack Router file-based naming in `src/routes/`: `dashboard.tsx`, `servers.index.tsx`, `servers.$id.tsx`, `servers.$id.install.tsx`, `servers.new.tsx`.
- Generated files are excluded from lint: `src/routeTree.gen.ts` (do not edit by hand; excluded in `biome.json`).
- Tests are co-located and named `*.test.ts` or `*.test.tsx` (no `*.spec.*` files in this repo).
- Shared API contracts live in `shared/contracts/` (e.g. `server-health-check.ts`, `server-web-ui.ts`).

**Functions:**

- **camelCase** for functions and hooks: `getDashboardStatusSnapshot`, `requireSession`, `useMountEffect`, `connectServer`, `parseConnectRequest`.
- Hono route handlers are named exports matching the action: `listServers`, `connectServer`, `runServerAction`.
- `createServerFn` loaders use `load*` prefix: `loadDashboardStatus`, `loadServers`, `loadLogs`, `loadCurrentProviderConfig`.
- Private/local helpers use descriptive verbs: `rewriteAuthRequest`, `applyMagicLinkRateLimit`, `normalizeSshError`.

**Variables:**

- **camelCase** for locals and state: `serverDetail`, `isLoading`, `fetchMock`, `magicLinkRateLimiter`.
- Destructured Hono context: `context` or `c`.
- Boolean state prefixed with `is`/`has`: `isLoading`, `isActive`, `hasDatabaseUrl`.
- Session/route data from TanStack: `session`, `dashboardStatus`, `location`.

**Types:**

- **PascalCase** for types, interfaces, and classes: `ConnectServerRequest`, `ServerDetailSnapshot`, `SshConnectError`, `DashboardStatusSnapshot`.
- React component props suffixed with `Props`: `TelegramConnectSectionProps`, `PersonaSettingsProps`.
- Error classes suffixed with `Error`: `SshConnectError`, `WebUiProxyError`, `DeployError`, `TelegramConnectionError`.
- Discriminated error codes as string unions: `SshConnectErrorCode` in `server/ssh/errors.ts`.
- Drizzle table exports are camelCase plurals: `healthChecks`, `users`, `installEvents`; column names in schema use **snake_case** (`created_at`, `user_id`).

## Code Style

**Formatting:**

- **Biome** (`biome.json`, schema 2.4.16) is the sole formatter/linter; no Prettier config.
- Indentation uses **tabs** (observed across `src/` and `server/`).
- `just format` / `just lint` run `bunx @biomejs/biome check .` (add `--write` for auto-fix).
- CSS parser enables Tailwind directives: `biome.json` → `css.parser.tailwindDirectives: true`.
- Excludes: `dist`, `src/routeTree.gen.ts`, `drizzle`.

**Linting:**

- Biome default rules with one project override: `security/noDangerouslySetInnerHtml` is **off** globally.
- `src/lib/use-mount-effect.ts` has `correctness/useExhaustiveDependencies` **off** (intentional mount-only `useEffect` with `[]` deps).
- TypeScript strict mode in `tsconfig.json`: `strict`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `noUncheckedSideEffectImports`.
- `verbatimModuleSyntax: true` — use `import type` for type-only imports (e.g. `src/components/ui/button.tsx`, `src/routes/dashboard.tsx`).
- Package manager is **Bun** (`bun.lock`); use `bun run`, not `npm`/`pnpm` (`AGENTS.md`).

**CI order** (`.github/workflows/ci.yml`, `just ci`):

1. `bunx @biomejs/biome check .`
2. `bun run typecheck` (`tsc --noEmit`)
3. `bun run test`
4. `bun run build`

## Import Organization

**Order:**

1. Node builtins (`node:crypto`, `node:stream`)
2. External packages (`@tanstack/*`, `hono`, `drizzle-orm`, `react`, `vitest`, etc.)
3. Blank line
4. Internal absolute aliases (`@/features/...`, `@/lib/...`, `@/components/...`)
5. Internal relative imports (`../../server/...`, `./server-detail`)

**Path Aliases:**

- `@/*` → `./src/*` (`tsconfig.json` `paths`)
- `#/*` → `./src/*` (`package.json` `imports` field)
- `vite.config.ts` sets `resolve.tsconfigPaths: true` so Vite/Vitest resolve both aliases.
- Routes import server code via relative paths (e.g. `../../server/dashboard` in `src/routes/dashboard.tsx`) because `server/` is outside `src/`.
- `server/` modules import each other with relative `./` paths; no `@/` alias in `server/`.

**Example** (`src/routes/dashboard.tsx`):

```typescript
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";

import { DashboardPage } from "@/features/dashboard/dashboard-page";
import { requireSession } from "@/lib/session";
import { getAuthSession } from "../../server/auth";
import { getDashboardStatusSnapshot } from "../../server/dashboard";
```

## Error Handling

**Patterns:**

**Hono API routes** (`server/app.ts`, `server/servers.ts`):

- Return JSON errors with HTTP status: `context.json({ error: "Unauthorized" }, 401)`, `context.json({ error: parsed.error }, 400)`.
- Auth guard: check `getAuthSession(context.req.raw.headers)`; return 401 when missing.
- JSON parse failures: `try/catch` around `context.req.json()` → 400 `"Invalid JSON body"`.
- Custom domain errors mapped to responses: `error instanceof SshConnectError ? error.message : "SSH verification failed"` → 400 with audit log (`server/servers.ts`).
- Production HTTPS guard: `requireHttps()` returns 426 for plaintext mutating routes (`server/app.ts`); preserve on new credential-bearing endpoints.
- Rate limiting returns 429 with `{ error: "Too many requests..." }` for magic-link endpoints.
- Health endpoint catches DB errors and returns degraded JSON (not thrown): `server/app.ts` `/health`.

**Server modules:**

- Throw `new Error("...")` for unrecoverable invariant violations (`server/server-records.ts`, `server/providers.ts`).
- Throw typed errors for domain cases: `SshConnectError`, `WebUiProxyError`, `DeployError`, `InvalidHermesConfigYamlError`.
- `normalizeSshError()` in `server/ssh/errors.ts` converts unknown SSH failures into `SshConnectError` with codes.
- DB transactions (`db.transaction()`) for coupled writes per `AGENTS.md` (telegram deploy, server actions, install SSE).

**Frontend:**

- `requireSession()` throws TanStack `redirect({ to: "/login", search: { redirect } })` when unauthenticated (`src/lib/session.ts`).
- Client fetch paths set local error state: `setError(payload?.error ?? "Unable to load this server.")` (`src/features/servers/server-detail-page.tsx`).
- Mount effects use `isActive` flag + cleanup to avoid stale updates after unmount.

**Validation:**

- Manual parsing/validation in server handlers (e.g. `parseConnectRequest` in `server/servers.ts`) returns `{ error: string }` discriminated results.
- Zod used sparingly on the frontend for forms: `src/features/auth/login-page.tsx`, `src/features/providers/provider-settings.tsx` (`import * as z from "zod"`).
- Form validation helpers return user-facing strings or `null`: `getFormValidationError()` in `src/features/settings/mcp-form-state.ts`.

## Logging

**Framework:** `console` (minimal, targeted use)

**Patterns:**

- `server/lib/send-magic-link-email.ts`: `console.log` magic link URL in non-production; `console.error` on Resend API failure.
- No structured logging framework (Winston, Pino, etc.) in app code.
- Prefer returning error JSON to clients and writing `audit_logs` rows over console logging for operational events (`server/lib/insert-audit-log.ts`).

## Comments

**When to Comment:**

- Security/deployment assumptions: `requireHttps()` block comment in `server/app.ts`.
- Non-obvious build/runtime behavior: `globalThis.process` note in `requireHttps` to avoid Vite tree-shaking.
- Intentional lint escapes: `useMountEffect` documents `react-doctor-disable` and Biome override.
- Domain constants: `server/constants.ts` uses `/** ... */` for container paths and deploy assumptions.
- Re-export rationale: `// Re-export for server-fn usage` in `server/servers.ts`.

**JSDoc/TSDoc:**

- Used for exported helpers and security-sensitive functions, not every function.
- Block comments (`/** ... */`) on `server/lib/get-client-ip.ts`, `server/install/sse-stream.ts`, `server/managed-compose-deploy.ts`.
- Inline `//` for route grouping and proxy notes in `server/app.ts`.

## Function Design

**Size:**

- Route files stay thin; UI and state live in `src/features/` (per `AGENTS.md`).
- Hono handlers delegate to server modules; large logic split by domain (`server/telegram.ts`, `server/install/`, `server/web-ui/`).

**Parameters:**

- Hono handlers: single `Context` argument (`listServers(context: Context)`).
- `createServerFn` handlers: no args for GET loaders; use `getRequestHeaders()` inside for auth.
- `requireSession(locationHref?, loadSession?)` accepts injectable loader for tests (`src/lib/session.ts`).
- SSH/runtime helpers accept config objects: `verifyServerConnection({ host, port, username, authMethod, credential })`.

**Return Values:**

- Hono handlers return `context.json(...)` or `Response`.
- `createServerFn` loaders return snapshot DTOs or `null` when unauthenticated (e.g. `loadDashboardStatus` returns `null` without session).
- Pure helpers return typed snapshots or `{ error: string }` unions for validation.

## Module Design

**Exports:**

- Named exports preferred; avoid default exports in app code.
- UI primitives: `export { Button }` from `src/components/ui/button.tsx`.
- Routes export `Route` via `createFileRoute` (`export const Route = createFileRoute(...)`).
- Server re-exports for cross-boundary use: `export { getServerListSnapshotImpl as getServerListSnapshot }` in `server/servers.ts`.

**Barrel Files:**

- No `index.ts` barrel files in `src/` or `server/`; import directly from the defining module.

## Architecture Conventions

**Entrypoints:**

- `src/server.ts` — sends `/api/*` to Hono (`server/app.ts`), everything else to TanStack Start.
- `server/` holds backend logic; `src/routes/` file-based routes; `src/features/` feature UI.

**Data loading:**

- **Default:** route-level `createServerFn` loaders in `beforeLoad` for authenticated snapshots (`src/routes/dashboard.tsx`, `logs.tsx`, `settings.tsx`, `telegram.tsx`, `ai-provider.tsx`, `servers.index.tsx`).
- **Exception:** `src/routes/servers.$id.tsx` fetches `/api/servers/:id` in the component via `useMountEffect` (`src/features/servers/server-detail-page.tsx`) — follow existing pattern unless intentionally reshaping.

**Frontend UI:**

- Use shared `cn()` from `src/lib/utils.ts` (`clsx` + `tailwind-merge`) for class merging; used in `src/components/ui/button.tsx` and across features.
- Prefer primitives in `src/components/ui/` (Button, etc.) with `class-variance-authority` variants.
- Keep helper/validation text **outside** `<label>` elements; labels pair with inputs via `htmlFor`/`id` (`src/features/telegram/telegram-connect-section.tsx`).
- `useMountEffect` (`src/lib/use-mount-effect.ts`) for stable mount-only subscriptions: polling, SSE, initial fetch (`install-progress.tsx`, `status-overview.tsx`, `telegram-pairing-section.tsx`).

**Database:**

- Schema in `server/db/schema.ts`.
- App-owned PKs: `text("id").primaryKey().default(sql\`gen_random_uuid()::text\`)`(per`AGENTS.md`).
- Use `db.transaction()` when coupled writes must commit/roll back together (telegram deploy, server actions, install events).

**Auth:**

- Better Auth lazy-init in `server/auth.ts` — do not move to module scope.
- `src/lib/auth-client.ts` uses absolute SSR base URL from `BETTER_AUTH_URL`.

**Vite/dev:**

- `vite.config.ts` excludes `node-ssh`, `ssh2`, `cpu-features` from `optimizeDeps` (native binaries break client prebundling).

---

_Convention analysis: 2026-06-06_
