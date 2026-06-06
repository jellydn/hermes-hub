# Coding Conventions

Generated: 2026-06-06

## TypeScript

| Rule | Detail |
|------|--------|
| Strict mode | Enabled |
| Module syntax | `verbatimModuleSyntax` (use `import type` for type-only imports) |
| Module resolution | `bundler` |
| JSX | `react-jsx` |
| Target | ESNext |

## Formatting & Linting

**Tool:** Biome (`biome.json`)

- All code formatted with Biome (no Prettier or ESLint)
- CI runs `biome check .` before typecheck and tests
- `src/routeTree.gen.ts` excluded from checks
- `src/lib/use-mount-effect.ts` exempted from `useExhaustiveDependencies`

**Pre-commit hooks** (`.pre-commit-config.yaml`):
1. `trailing-whitespace`, `end-of-file-fixer`, `check-yaml`, `check-json`, `check-added-large-files`
2. `biome-check`
3. `typecheck`
4. `react-doctor` (staged, blocking on warning)

## Package Management

- Use `bun`, **not** `npm` or `pnpm`
- Lockfile: `bun.lock`
- Add packages via `bun add` (not manual `package.json` edits)
- Never install packages globally

## Component Patterns

### Route Components
- **Thin route files**: `src/routes/*.tsx` are configuration-only containers
- `beforeLoad` for SSR data fetching (use `Promise.all` for parallel loads)
- Page components live in `src/features/<name>/<name>-page.tsx`

### State Management
- **Complex state**: Use `useReducer` (not multiple `useState`)
- **External stores**: Use `useSyncExternalStore` (see `ThemeToggle.tsx`)
- **Mount-only effects**: Use `useMountEffect` from `src/lib/use-mount-effect.ts`

### Forms
- Use `react-hook-form` with `zod` resolvers
- Form components in `src/features/`

### UI Components
- Use `cn()` from `src/lib/utils.ts` for class merging
- Button variants defined with `class-variance-authority` in `button-variants.ts`
- `asChild` pattern (Radix Slot) for polymorphic buttons
- Semantic HTML: `<output>` for live regions, `<article>` for cards
- Helper/validation text outside `<label>` elements (for Testing Library stability)

## Server Patterns

### API Handlers (`server/app.ts`)

```ts
// Route handler pattern
app.post("/api/endpoint", async (context) => {
  const ctx = await requireOwnedServer(context);
  if (ctx instanceof Response) return ctx;
  // ... business logic ...
  return context.json(result, status);
});
```

### Database

- Drizzle ORM with `pgTable` definitions in `server/db/schema.ts`
- Primary keys: `text(...).primaryKey().default(sql\`gen_random_uuid()::text\`)`
- Use `db.transaction()` for multi-statement writes that must be atomic
- Sequential writes for audit logs where consistency is non-critical

### Auth

- Better Auth initialized lazily in `server/auth.ts` (not at module scope)
- `requireHttps()` guard on credential-bearing endpoints in production
- Session cookie-based auth (no JWT)

### SSH

- `node-ssh` for VPS connections
- SSH credentials: encrypted at rest (AES-256-GCM) or ephemeral (in-memory)
- `server/ssh/connection.ts`: `verifyServerConnection` with `Promise.all` for parallel system info queries
- `server/ssh/os.ts`: OS compatibility validation (Ubuntu 22.04+, Debian 12+)

### Credential Encryption

- AES-256-GCM via Node built-in `crypto` module
- `ENCRYPTION_KEY` env var (32-byte hex)
- `encryptSecret` / `decryptSecret` in `server/crypto.ts`

## Naming

| Category | Convention | Example |
|----------|-----------|---------|
| Files | kebab-case | `server-actions.ts`, `connection-wizard.tsx` |
| Components | PascalCase | `DashboardPage`, `ServerInventoryCard` |
| Functions | camelCase | `getDashboardStatusSnapshot` |
| Hooks | `use` prefix | `useHermesWebUi`, `useMountEffect` |
| Types | PascalCase | `ServerDetailSnapshot` |
| Enums/Unions | PascalCase | `ServerWebUiDeployStatus` |
| Route params | `$paramName` | `servers.$id.tsx` |
| API endpoints | kebab-case paths | `/api/servers/:id/web-ui/deploy` |

## Error Handling

- API errors: `{ error: "message" }` JSON with appropriate HTTP status
- SSH errors: caught and normalized via `normalizeSshError`
- Client errors: `fetchError` state, `pollingPaused` after 3 consecutive failures
- Audit logging: `insertAuditLog` with action name pattern `server.<domain>.<action>.<result>`

## Import Organization

- External imports first
- Internal imports grouped by layer (server, src, features, components, lib)
- Use `@/` path alias for src imports
- Use relative paths for server-to-server imports

## Commit Convention

Uses commitizen convention: `type(scope): description`

| Type | Usage |
|------|-------|
| `feat` | New feature |
| `fix` | Bug fix |
| `refactor` | Code restructuring |
| `perf` | Performance improvement |
| `chore` | Maintenance, deps |
| `docs` | Documentation |
| `test` | Test changes |
| `ci` | CI/CD changes |
