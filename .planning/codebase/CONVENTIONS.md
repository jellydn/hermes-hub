# Coding Conventions

## Language & TypeScript

- **Strict mode** enabled: `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax: true`
- **ES Modules** (`"type": "module"` in package.json)
- **ESNext** target with `bundler` module resolution
- **Type-only imports**: Use `import type` for type-only symbols — both Biome and `tsc` will flag plain `import` of a type-only symbol

## File Organization

- **Tests co-located** with source files: `foo.ts` ↔ `foo.test.ts` (or `foo.test.tsx` for React components)
- **Feature modules** live in `src/features/<domain>/` — one folder per product area
- **Route files** are thin — push UI logic into `src/features/` and `src/lib/`
- **Test files** use `*.test.{ts,tsx}` extension (not `*.spec.*`)

## Naming Conventions

| Context | Convention | Example |
|---------|-----------|---------|
| Database tables | snake_case plural | `servers`, `install_events`, `audit_logs` |
| TypeScript variables | camelCase | `serverId`, `createdAt` |
| TypeScript files | kebab-case | `server-actions.ts`, `use-mount-effect.ts` |
| React components | PascalCase | `ServerList`, `AppShell` |
| Hooks | camelCase with `use` prefix | `useMountEffect`, `useSession` |
| Drizzle relations | camelCase | `server.installs`, `user.sessions` |

## Database Conventions

- **Schema**: All Drizzle table definitions in `server/db/schema.ts`
- **Better Auth tables** (`user`, `session`, `account`, `verification`) re-exported at the bottom of schema
- **Primary keys**: `text(...).primaryKey().default(sql\`gen_random_uuid()::text\`)` for app-owned tables
- **Migration workflow**: Edit schema → `bun run db:generate` → `bun run db:migrate`
- **Transactions**: `db.transaction()` when multiple Drizzle statements must commit/roll back together (coupled writes like SSH action + audit log)
- **Sequential writes** are fine when audit log is purely historical (e.g., server connect/disconnect)

## Auth Conventions

- **Lazy initialization**: `getAuth()` builds Better Auth instance on first call, not at module scope
- **Lazy session**: `getAuthSession()` short-circuits to `null` when `DATABASE_URL` is missing
- **Route loading**: Typically via `createServerFn` loaders; exception is `servers.$id.tsx` which uses `useMountEffect`
- **Mutating API routes**: Must use `requireHttps()` middleware in production
- **Path rewriting**: `/auth/send-magic-link` rewrites to `/api/auth/sign-in/magic-link` and proxies to `getAuth().handler()`

## Frontend Conventions

- **CSS**: Tailwind CSS v4 with utility classes
- **Component variants**: `class-variance-authority` (`cva`) for component variant definitions
- **Class merging**: `cn()` utility (`tailwind-merge` + `clsx`) from `src/lib/utils.ts`
- **Forms**: `react-hook-form` + `zod` via `@hookform/resolvers` — resolvers and validators co-located in `src/features/<domain>/`
- **Mount-only effects**: Use `useMountEffect` from `src/lib/use-mount-effect.ts` for stable subscriptions (SSE, polling) — Biome's `useExhaustiveDependencies` is intentionally disabled for this file
- **Label placement**: Helper/validation text lives outside `<label>` elements for accessible names
- **UI primitives**: Use existing Shadcn UI components in `src/components/ui/`

## Backend Conventions

- **SSH**: `node-ssh` for all remote server operations. Connection pool managed via `server/web-ui/ssh-pool.ts`
- **Error handling**: Empty `catch { }` blocks appear in `server/deploy.ts`, `server/servers.ts`, and `server/server-actions.ts` — intentional silencing of expected errors in some cases
- **HTTPS guard**: Uses `globalThis.process.env.NODE_ENV` (not `process.env.NODE_ENV`) to avoid Vite constant-replacement tree-shaking the dev early return
- **Rate limiting**: Magic-link limiter keyed by `email`, not IP (in-memory)

## Dependency Management

- **Bun** is the package manager — not `npm` or `pnpm`
- **Lockfile**: `bun.lock`
- **Install**: `bun install` (not `npm install`)

## Code Quality

- **Linting/Formatting**: Biome (`bun run lint` = `@biomejs/biome check .`)
- **Typechecking**: `bun run typecheck` = `tsc --noEmit`
- **Testing**: `bun run test` = `vitest run --passWithNoTests --reporter=dot`
- **Code quality scan**: `bun run doctor` = `react-doctor`
- **Pre-commit hooks**: Biome check → typecheck → React Doctor (blocking warnings on staged changes)

## Path Aliases

- `#/*` → `./src/*`
- `#server/*` → `./server/*`
- `#shared/*` → `./shared/*`
- Kept in sync between `tsconfig.json` (paths) and `package.json` (imports)
- `server/` and `shared/` modules never use `#` aliases internally — use `../` relative imports
- Aliases are only for cross-directory imports from `src/`
