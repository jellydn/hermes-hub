# Coding Conventions

**Analysis Date:** 2026-05-31

## Naming Patterns

**Files:**
- `kebab-case` for most feature/lib files (for example `src/features/servers/server-detail.tsx`, `src/lib/server-detail.ts`).
- Route files follow TanStack file-route naming (`src/routes/servers.$id.tsx`, `src/routes/servers.$id.install.tsx`, `src/routes/servers.index.tsx`, `src/routes/servers.new.tsx`).
- `PascalCase` is used for some top-level component filenames (`src/components/Header.tsx`, `src/components/Footer.tsx`, `src/components/ThemeToggle.tsx`), while `src/components/ui/button.tsx` is lowercase.

**Functions:**
- Runtime functions are `camelCase` (`connectServer`, `updateServer`, `getServerListSnapshot` in `server/servers.ts`; `refreshStatus`, `handleManualRetry` in `src/features/dashboard/status-overview.tsx`).
- React component functions are `PascalCase` (`ServerList` in `src/features/servers/server-list.tsx`, `ProviderSettings` in `src/features/providers/provider-settings.tsx`, `DashboardStatusOverview` in `src/features/dashboard/status-overview.tsx`).
- Route modules consistently export `Route` (`src/routes/index.tsx`, `src/routes/login.tsx`, `src/routes/servers.index.tsx`).

**Variables:**
- Local/state variables use `camelCase` (`fetchState`, `pollingPausedRef` in `src/features/dashboard/status-overview.tsx`; `installRecord`, `ipAddress` in `server/install.ts`).
- Constants use `UPPER_SNAKE_CASE` for shared timing/config constants (`IDLE_TIMEOUT_MS`, `HEARTBEAT_INTERVAL_MS` in `server/install/sse-stream.ts`; `DEFAULT_POLL_INTERVAL_MS`, `MAX_CONSECUTIVE_FAILURES` in `src/features/dashboard/status-overview.tsx`).
- Domain event/action names are dot-separated strings in arrays (`relevantServerActionNames` in `server/servers.ts`).

**Types:**
- Types are `PascalCase` with domain suffixes (`ServerListSummary` in `src/lib/servers.ts`, `ServerDetailSnapshot` in `src/lib/server-detail.ts`, `InstallStreamState` in `server/install/sse-stream.ts`).
- Frontend form schemas/types pair Zod schema + inferred/declared TS type (`loginSchema` + `LoginFields` in `src/routes/login.tsx`; `providerSchema` + `ProviderFormState` in `src/features/providers/provider-settings.tsx`).
- Unknown external data is narrowed with guards (`isRecord` in `server/servers.ts`, `normalizeInstallStatus` in `server/install/sse-stream.ts`).

## Code Style

**Formatting:**
- Formatter/linter tooling is Biome (`biome.json`, `justfile` `lint`/`format` recipes, `.pre-commit-config.yaml` `biome-check` hook).
- Formatting style in repo uses tabs and trailing commas in multiline constructs (for example `server/app.ts`, `server/install.ts`, `src/routes/login.tsx`).
- Biome scope excludes generated/output dirs (`biome.json` excludes `dist`, `drizzle`, `src/routeTree.gen.ts`).

**Linting:**
- Biome is the primary linter (`biome.json`, `.pre-commit-config.yaml`).
- Custom lint override disables `security.noDangerouslySetInnerHtml` (`biome.json`).
- Pre-commit additionally enforces whitespace/EOF/YAML/JSON and typecheck (`.pre-commit-config.yaml`).

## Import Organization

**Order:**
1. External packages first (`hono`, `drizzle-orm`, `react`, `lucide-react`) as seen in `server/servers.ts`, `src/features/providers/provider-settings.tsx`, `src/routes/servers.index.tsx`.
2. Internal aliases (`@/...`) next in frontend modules (`src/routes/login.tsx`, `src/features/servers/server-list.tsx`, `src/routes/dashboard.tsx`).
3. Relative local/server imports last (`./...`, `../...`) in backend and route bridge files (`server/app.ts`, `src/routes/servers.index.tsx`, `src/lib/session.ts`).

**Path Aliases:**
- Aliases configured: `@/*` and `#/*` in `tsconfig.json`; `#/*` also in `package.json#imports`.
- Active usage is primarily `@/*` in frontend (`src/routes/*`, `src/features/*`, `src/components/ui/button.tsx`).
- Server modules typically use relative imports (`server/*.ts`).

## Error Handling

**Patterns:**
- API handlers return structured JSON errors with HTTP status (`context.json({ error: ... }, status)`) throughout server endpoints (`server/servers.ts`, `server/install.ts`, `server/providers.ts`, `server/telegram.ts`, `server/app.ts`).
- Input parsing uses `try/catch` around `context.req.json()` with explicit 400 on malformed JSON (`server/servers.ts`, `server/providers.ts`, `server/telegram.ts`).
- Domain errors are normalized before response (for example `SshConnectError` handling in `server/servers.ts`, `normalizeInstallError` in `server/install.ts`, `normalizeSshError` in `server/ssh.ts`).
- Frontend fetch flows parse optional payload and surface fallback messages (`src/features/providers/provider-settings.tsx`, `src/routes/servers.$id.tsx`, `src/features/dashboard/status-overview.tsx`).

## Logging

**Framework:** `console` (selective)

**Patterns:**
- Logging is minimal and mostly security/ops related in server helper code (`console.log` fallback and `console.error` send failure in `server/lib/send-magic-link-email.ts`).
- Normal server flow favors persisted audit logs over console logs (`auditLogs` writes in `server/servers.ts`, `server/install.ts`, `server/providers.ts`, `server/telegram.ts`).

## Comments

**When to Comment:**
- Comments are used for security assumptions/guardrails and concurrency invariants (HTTPS proxy assumptions in `server/app.ts`; install slot claim semantics in `server/install.ts`; atomic claim docs in `server/install/sse-stream.ts`).
- Comments clarify non-obvious test scaffolding (`Promise.prototype.limit` note in `server/servers.test.ts`) and storage behavior (`server/providers.test.ts`).

**JSDoc/TSDoc:**
- Multi-line doc comments are used sparingly for high-risk behavior (`requireHttps` rationale in `server/app.ts`, `sendMagicLinkEmail` behavior in `server/lib/send-magic-link-email.ts`, `tryClaimInstallStream` in `server/install/sse-stream.ts`).
- Most functions rely on expressive names + types rather than pervasive JSDoc (`src/features/*`, `server/*.ts` generally).

## Function Design

**Size:** Mixed; many small helpers plus several large orchestrator functions (`connectServer`/`updateServer` in `server/servers.ts`, `runInstallWorkflow` and SSE route handler in `server/install.ts`, `refreshStatus` in `src/features/dashboard/status-overview.tsx`).

**Parameters:** Typed object parameters are common for multi-argument operations (`verifyServerConnection` call input in `server/servers.ts`; `runInstallWorkflow` input object in `server/install.ts`; `refreshStatus(options?)` in `src/features/dashboard/status-overview.tsx`).

**Return Values:** 
- API handlers return `Response` via `context.json(...)` (`server/app.ts`, `server/servers.ts`, `server/install.ts`).
- Helper functions return typed data/union-with-error objects (`parseConnectRequest` and `parseUpdateRequest` in `server/servers.ts`; `normalizeInstallStatus` in `server/install/sse-stream.ts`).

## Module Design

**Exports:** Predominantly named exports for handlers/components/types (`server/servers.ts`, `server/install.ts`, `src/features/servers/server-list.tsx`, `src/lib/server-detail.ts`); default export mainly for framework entry points (`src/server.ts`).

**Barrel Files:** Minimal barrel usage; one db entry module exists (`server/db/index.ts`). Most modules import from concrete files directly (`server/*.ts`, `src/features/*`, `src/routes/*`).

---

*Convention analysis: 2026-05-31*

