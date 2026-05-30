# Coding Conventions

**Analysis Date:** 2026-05-28

## Naming Patterns

**Files:**
- Source files use `kebab-case`: `server-actions.ts`, `status-overview.tsx`, `sse-stream.ts`, `install-idle-timeout.ts`
- Test files mirror source names with `.test.ts` or `.test.tsx` suffix: `server-actions.test.ts`, `status-overview.test.tsx`
- Route files follow TanStack Router conventions: `servers.$id.tsx`, `servers.$id.install.tsx`, `ai-provider.tsx`
- Generated files are excluded from linting: `src/routeTree.gen.ts`
- Config files use standard names: `biome.json`, `tsconfig.json`, `vite.config.ts`, `drizzle.config.ts`

**Functions:**
- `camelCase` throughout: `getAuthSession`, `parseAndValidateOs`, `normalizeSshError`, `withSshConnection`
- Getters prefixed with `get`: `getDb`, `getAuthSession`, `getSessionCredential`, `getDashboardStatus`
- Transformers prefixed with `to` or descriptive verb: `toAgentSummary`, `toProviderSummary`, `toTelegramSummary`
- Boolean helpers use `is`/`has` prefix: `isAiProviderId`, `hasDatabaseUrl`
- Event emitters use `emit` prefix: `emitInstallEvent`
- Stream helpers use `ensure`/`reset` prefix: `ensureInstallStream`, `resetInstallStream`
- Action handlers use `run` prefix for command execution: `runServerAction`
- Connection handlers use `connect`/`verify` prefix: `connectServer`, `verifyServerConnection`

**Variables:**
- `camelCase` for all variables: `magicLinkRateLimiter`, `staticCache`, `metricsCache`
- Constants use `UPPER_SNAKE_CASE` for module-level configuration: `DEFAULT_POLL_INTERVAL_MS`, `MAX_POLL_INTERVAL_MS`, `MAX_CONSECUTIVE_FAILURES`, `STATIC_CACHE_TTL_MS`
- Refs use `Ref` suffix: `pollTimeoutRef`, `nextPollDelayRef`, `snapshotRef`

**Types:**
- `PascalCase` for all types: `SshConnectionInput`, `VerifiedServerInfo`, `DashboardStatusSnapshot`, `ServerDetailSnapshot`
- Props types use component name + `Props`: `DashboardStatusOverviewProps`
- Record types use descriptive name + `Record`: `ServerRecord`, `InstallRecord`, `ProviderRecord`
- Summary types use domain + `Summary`: `DashboardAgentSummary`, `DashboardProviderSummary`, `DashboardVpsSummary`
- Error classes extend `Error` with descriptive names: `SshConnectError`, `UnsupportedOsError`
- Error class `name` property matches class name: `this.name = "SshConnectError"`

## Code Style

**Formatting:**
- Tool: Biome (v2.4.16)
- Tabs for indentation (Biome default)
- Double quotes for strings
- Trailing commas in multi-line structures
- Semicolons at statement ends
- CSS parser configured for Tailwind directives

**Linting:**
- Tool: Biome
- `noDangerouslySetInnerHtml` is explicitly `off`
- TypeScript strict mode with `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`
- CI order: `biome check` -> `typecheck` -> `test` -> `build`

## Import Organization

**Order:**
1. Third-party packages (`react`, `vitest`, `hono`, `drizzle-orm`, `lucide-react`)
2. Internal imports using path aliases (`@/lib/utils`, `@/components/ui/button`)
3. Relative imports within the same module (`./ssh`, `./auth`, `./db/schema`)

**Path Aliases:**
- `#/*` maps to `./src/*` (used in `package.json` `"imports"`)
- `@/*` maps to `./src/*` (used in `tsconfig.json` `"paths"`)
- Both are available; `@/*` is used more frequently in frontend code

**Import Style:**
- Named imports preferred: `import { describe, expect, it, vi } from "vitest"`
- Type-only imports use `import type`: `import type { Context } from "hono"`, `import type * as React from "react"`
- `verbatimModuleSyntax` is enabled, enforcing explicit `type` annotations on type-only imports

## Error Handling

**Patterns:**
- Custom error classes for domain-specific errors with descriptive `name` property
- Errors normalized at boundaries: `normalizeSshError()` maps raw SSH errors to user-friendly `SshConnectError` messages
- HTTP responses use status codes with JSON error bodies: `{ error: "message" }`
- Guard clauses at function top: check auth, check credentials, check DB availability before proceeding
- `requireHttps()` guard applied to credential-bearing endpoints in production
- Auth unavailability returns 503: `{ error: "DATABASE_URL is required" }`
- Validation errors return 400 with specific messages: `"Invalid target version"`, `"Action must be restart, update, or rollback"`
- Conflict errors return 409: `"Install already in progress"`
- Unauthorized returns 401: `{ error: "Unauthorized" }`

**Error Response Pattern:**
```typescript
// Server handlers return Response objects directly
return context.json({ error: "message" }, 400);

// Or throw custom errors that are caught upstream
throw new UnsupportedOsError(`Unsupported OS: ${prettyName}`);
```

## Logging

**Framework:** No logging library; uses audit logs in the database

**Patterns:**
- Audit logs stored in `audit_logs` table via `insertAuditValues`
- Action lifecycle: `server.action.{action}.started` -> `server.action.{action}.succeeded|failed`
- Install lifecycle: `server.install.started` -> `server.install.succeeded|failed`
- Log entries include `serverId` in `details` JSONB field for filtering
- Install progress logs are stored as newline-delimited text in `installs.log`

## Comments

**When to Comment:**
- JSDoc for public API functions with non-obvious behavior: `clearDashboardCache()`, `requireHttps()`
- Inline comments for deployment assumptions and security considerations
- Block comments for rate limiter configuration: `// 3 requests per 5 minutes per email`
- Comments on mock helper functions in tests: `// reset to clear stale _onceImpl chains from prior tests`
- Exposed-for-tests functions are documented: `/** Exposed for tests — clears all cached data between test runs. */`

**JSDoc/TSDoc:**
- Used sparingly, primarily for exported functions that need behavioral context
- Not used for every function; self-documenting code preferred

## Function Design

**Size:**
- Functions are generally small and focused (10-40 lines typical)
- Complex handlers extracted into helpers: `rewriteAuthRequest()`, `handleAuthUnavailable()`, `applyMagicLinkRateLimit()`
- Test setup extracted into `createContext()` factory functions

**Parameters:**
- Hono context objects for HTTP handlers: `(context: Context) => Response`
- Plain objects for domain functions: `{ userId, sessionId }`, `{ serverId, userId }`
- Discriminated unions for action types: `{ action: "restart" | "update" | "rollback" }`

**Return Values:**
- HTTP handlers return `Response` objects directly
- Domain functions return typed objects or throw errors
- Helper functions return primitive or simple object values
- DB query chains use fluent builder pattern: `db.select().from().where().orderBy().limit()`

## Module Design

**Exports:**
- Named exports preferred over default exports
- Only functions and types exported; internal state kept private
- Test-only helpers exported with JSDoc annotation
- Route files export default components (TanStack Router convention)

**Barrel Files:**
- No barrel/index files observed; imports use direct file paths
- `server/db/schema.ts` serves as a schema barrel for all Drizzle tables

## Database Conventions

**Schema Location:** `server/db/schema.ts`

**Primary Keys:**
- App-owned tables: `text("id").primaryKey().default(sql\`gen_random_uuid()::text\`)`
- Auth tables (Better Auth): `text("id").primaryKey()` (managed by auth library)

**Column Naming:**
- DB columns use `snake_case`: `user_id`, `created_at`, `encrypted_credential`
- TypeScript properties use `camelCase`: `userId`, `createdAt`, `encryptedCredential`
- Drizzle maps between them automatically

**Timestamps:**
- All tables have `created_at` with `defaultNow()` and `.notNull()`
- Mutable tables add `updated_at` with `$onUpdate(() => new Date())`

---
*Convention analysis: 2026-05-28*
