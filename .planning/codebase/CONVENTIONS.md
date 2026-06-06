# Code Conventions — HermesHub

Generated from codebase analysis (2026-06-06)

---

## Language & Runtime

| Aspect | Convention |
|--------|------------|
| **Language** | TypeScript 6.0 (strict mode) |
| **Runtime** | Bun (primary), Node.js compatible |
| **Module System** | ES Modules (`"type": "module"`) |
| **Imports** | Package imports via `#/*` → `./src/*`, `@/*` → `./src/*` |

---

## Project Structure

```
src/
├── components/ui/       # Shared UI primitives (Button, Banner, etc.)
├── features/            # Feature-specific components (servers, telegram, providers, etc.)
├── lib/                 # Shared client utilities (auth-client, session, utils, etc.)
├── routes/              # TanStack Start file-based routes (thin, delegate to features)
└── server.ts            # Server entrypoint (API vs SSR routing)

server/
├── app.ts               # Hono API router (all /api/* routes)
├── auth.ts              # Better Auth lazy initialization
├── db/                  # Drizzle DB connection + schema
├── install/             # Install orchestration + SSE streaming
├── ssh/                 # SSH connection, host keys, error normalization
├── *.ts                 # Domain modules (servers, providers, telegram, etc.)
└── *.test.ts            # Unit/integration tests alongside source
```

---

## TypeScript Conventions

### Strictness (tsconfig.json)
```json
{
  "strict": true,
  "noUnusedLocals": true,
  "noUnusedParameters": true,
  "noFallthroughCasesInSwitch": true,
  "noUncheckedSideEffectImports": true,
  "verbatimModuleSyntax": true
}
```

### Type Patterns
- **Zod for runtime validation** — used at API boundaries (`server/providers.ts`, `server/servers.ts`)
- **Explicit return types** on exported functions
- **Type imports** with `import type` where possible
- **Discriminated unions** for action results (`status: "succeeded" | "failed"`)

### Naming
| Entity | Convention | Example |
|--------|------------|---------|
| Files | kebab-case | `server-detail.tsx`, `ssh/connection.test.ts` |
| Components | PascalCase | `ServerDetail`, `TelegramSettings` |
| Functions | camelCase | `getServerDetailSnapshot`, `normalizeSshError` |
| Types/Interfaces | PascalCase | `ServerDetailSnapshot`, `TelegramSettingsSummary` |
| Constants | UPPER_SNAKE_CASE | `MODEL_VALIDATION_REGEX` |
| Enums | PascalCase | `SshConnectErrorCode` |
| Database tables | snake_case | `audit_logs`, `ai_providers` |

---

## Frontend Patterns

### Route Structure (TanStack Start)
```tsx
// src/routes/dashboard.tsx
export const Route = createFileRoute("/dashboard")({
  beforeLoad: async ({ location }) => {
    const session = await requireSession(location.href);
    const dashboardStatus = await loadDashboardStatus(); // createServerFn
    return { session, dashboardStatus };
  },
  component: DashboardPage,
});
```

- **Route loaders**: Use `createServerFn` for authenticated data fetching
- **Thin routes**: Delegate UI to `src/features/*`
- **Shared layout**: `AppShell` from `dashboard.tsx` reused by authenticated pages

### Component Patterns
- **Feature components** in `src/features/{domain}/`
- **Compound components** for complex UI (e.g., `TelegramSettings` composes `TelegramConnectSection`, `TelegramDeploySection`, etc.)
- **Custom hooks** for state/logic separation (`useServerActions`, `useServerBasics`)

### State & Data Fetching
| Pattern | Usage |
|---------|-------|
| `createServerFn` | Route-level authenticated loaders |
| `fetch` in `useMountEffect` | Component-level data (e.g., `servers.$id.tsx`) |
| `useState` + handlers | Local UI state (forms, dialogs, loading) |
| TanStack Router `Link` | Client-side navigation |

### Styling
- **Tailwind CSS v4** with CSS variables (`--sea-ink`, `--lagoon`, `--foam`, etc.)
- **Class variance** via `class-variance-authority` (CVA) for component variants
- **`cn()` utility** for class merging: `twMerge(clsx(inputs))`
- **Semantic color tokens** — no raw colors in components

### UI Primitives (`src/components/ui/`)
- `Button` — CVA variants (default, secondary, ghost, link, destructive, icon)
- `Banner` — Success/error/info tones
- `Card`, `Input`, `Dialog` — Composed from Radix UI + Tailwind
- **Accessibility**: `aria-*` attributes, `role`, `label` outside inputs

---

## Backend Patterns

### API Layer (Hono)
```ts
// server/app.ts
export const apiApp = new Hono().basePath("/api");

// Middleware
const httpsMiddleware = createMiddleware(async (c, next) => {
  const result = requireHttps(c);
  if (result) return result;
  await next();
});

// Route with middleware
apiApp.post("/servers/connect", httpsMiddleware, connectServer);
```

- **Base path**: `/api` for all backend routes
- **Middleware**: `requireHttps()` on mutating endpoints in production
- **Error responses**: `{ error: string }` with appropriate HTTP status

### Auth (Better Auth)
- **Lazy initialization** — `getAuth()` creates instance on first use (avoids crash when `DATABASE_URL` unset)
- **Session retrieval**: `getAuthSession(headers)` → `null` if no session
- **Magic link** rate limiting via `rate-limiter-flexible`

### Database (Drizzle ORM)
- **Schema**: `server/db/schema.ts` — pg-core tables with `text().primaryKey().default(sql\`gen_random_uuid()::text\`)`
- **Indexes**: Explicit on foreign keys (`user_id`, `server_id`)
- **Connection**: Singleton `getDb()` in `server/db/index.ts`

### Transaction Boundaries
Use `db.transaction()` when secondary write coupled to primary:
```ts
// server/install/sse-stream.ts
await db.transaction(async (tx) => {
  await tx.insert(installEvents).values(...);
  await tx.update(installs).set(...).where(...);
});
```
**Do not** use transactions for pure audit logs (absence doesn't affect correctness).

### SSH Operations
- **`withSshConnection`** — Centralized connection lifecycle, host key verification
- **Error normalization** — `normalizeSshError()` maps raw errors to typed `SshConnectError`
- **Host key handling** — Always installs `hostVerifier`, never `hostHash`

### Encryption (AES-256-GCM)
```ts
// server/crypto.ts
encryptSecret(value: string): string // iv.authTag.cipher (base64url)
decryptSecret(payload: string): string
```
- Key derived from `ENCRYPTION_KEY` via SHA-256
- Legacy fallback for unencrypted `apiServerKey`

---

## Error Handling

### Server Errors
- **Typed errors**: `SshConnectError` with `code`, `UnsupportedOsError`
- **API responses**: `{ error: string }` + status (400, 401, 404, 500, 502, 503)
- **Auth unavailable**: 503 when `DATABASE_URL` missing
- **HTTPS required**: 426 in production without TLS signal

### Client Errors
- **Banner component** — `tone="success" | "error"` for toast-like messages
- **Form validation** — Zod schemas, errors displayed via `Banner`
- **Confirmation dialogs** — Delete requires typing server label

---

## Security Conventions

| Area | Convention |
|------|------------|
| Credentials | Encrypted at rest (AES-256-GCM), never logged |
| API keys | Stored encrypted, last 4 chars shown in UI |
| Model IDs | Regex validation — reject shell metacharacters, whitespace, >120 chars |
| HTTPS | `requireHttps()` middleware on all mutating endpoints |
| Rate limiting | Magic link: 3 req / 5 min per email |
| Host keys | Verified on every SSH connection, pinned after first connect |

---

## Code Organization Principles

1. **Colocate tests** — `*.test.ts` alongside source
2. **Single responsibility** — Modules export focused functions
3. **Explicit dependencies** — Mock at module boundaries (`vi.mock`)
4. **Lazy auth** — Never initialize Better Auth at module scope
5. **Type-safe boundaries** — Zod at API entry, types shared via `src/lib/*.ts`
6. **No dead code** — Remove unused exports, imports, branches

---

## File-Specific Conventions

| File | Convention |
|------|------------|
| `src/routeTree.gen.ts` | Generated — do not edit |
| `biome.json` | Excludes `src/routeTree.gen.ts`, `drizzle/`, `dist/` |
| `vite.config.ts` | Excludes `node-ssh`, `ssh2`, `cpu-features` from optimizeDeps |
| `.env.example` | Documents all required env vars |

---

## Git & CI

- **Commit style**: Conventional (implied by `just ci` order)
- **CI pipeline**: `lint` → `typecheck` → `test` → `build`
- **Pre-commit**: Biome check (via `.pre-commit-config.yaml`)
- **Commands**: `just check` runs typecheck + test in parallel
