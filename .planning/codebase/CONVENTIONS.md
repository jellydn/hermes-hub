# Coding Conventions

**Analysis Date:** 2026-08-25

## Code Style

**Formatter:** Biome (auto-format on save)
- Run `bunx @biomejs/biome check .` to verify
- Run `bun run format` to auto-fix

**TypeScript Strictness:**
- `noUnusedLocals: true`
- `noUnusedParameters: true`
- `verbatimModuleSyntax: true`
- Use `import type` for type-only imports

**Naming:**
- `camelCase` for variables and functions
- `PascalCase` for types, interfaces, and React components
- `kebab-case` for file names
- `SCREAMING_SNAKE_CASE` for constants

## Import Patterns

**Path Aliases:**
- `#/*` → `./src/*` (frontend code)
- `#server/*` → `./server/*` (server code)
- `#shared/*` → `./shared/*` (cross-boundary)

**Import Order:**
1. External packages
2. Internal aliases (`#/*`, `#server/*`, `#shared/*`)
3. Relative imports

**Examples:**
```typescript
import { Hono } from "hono";
import { auth } from "#server/auth";
import { db } from "#server/db";
import { cn } from "#lib/utils";
import { Button } from "../ui/button";
```

## React Patterns

**Component Structure:**
- Functional components only (no class components)
- React 19 features allowed (hooks, server components)
- File-based routing via TanStack Start

**Hooks:**
- `useMountEffect` - Mount-only side effects (escape hatch)
- `useStaleRef` - Read latest state in async handlers
- `react-hook-form` + `zod` for forms

**State Management:**
- React state (`useState`, `useReducer`)
- No global state library (Redux, Zustand, etc.)
- Server state via TanStack Router loaders

**Styling:**
- TailwindCSS utility classes
- `cn()` helper for conditional classes
- shadcn/ui components in `src/components/ui/`

## Server Patterns

**API Routes:**
- Hono handlers in `server/app.ts`
- Middleware for auth, HTTPS, rate limiting
- Structured error responses: `{ error: "message" }`

**Database:**
- Drizzle ORM for queries
- Schema in `server/db/schema.ts`
- Migrations in `drizzle/` directory

**SSH:**
- `node-ssh` for remote execution
- Credentials encrypted with AES-256-GCM
- Connection pooling via `server/credentials.ts`

**Encryption:**
- AES-256-GCM for credentials
- Keyring with versioning (`v1`, `v2`)
- Wire format: `v1.iv.authTag.cipher`

## Error Handling

**Frontend:**
- Try-catch blocks for async operations
- Error boundaries for component errors
- User-friendly error messages

**Server:**
- Middleware error catching
- Structured error responses
- Pino logging for debugging

**Database:**
- Transaction rollback on errors
- Idempotent operations where possible

## Testing Patterns

**Unit Tests:**
- Vitest with node environment
- Co-located test files (`*.test.ts`)
- Mock external dependencies

**Integration Tests:**
- Testing Library for React components
- Mock API responses
- Test user interactions

**Coverage:**
- Minimum thresholds: 45% lines, 40% functions
- Exclude generated files (`routeTree.gen.ts`)

## Documentation

**Code Comments:**
- JSDoc for public APIs
- Inline comments for complex logic
- No unnecessary comments

**README:**
- Project overview and quick start
- Environment variable reference
- Architecture overview

**AGENTS.md:**
- Developer guide for AI assistants
- Verified gotchas and conventions
- Architecture patterns

## Git Conventions

**Commit Messages:**
- Conventional commits format
- Examples: `feat:`, `fix:`, `docs:`, `chore:`

**Branch Naming:**
- `feature/description`
- `fix/description`
- `docs/description`

**PR Description:**
- Summary of changes
- Related issues
- Verification steps

---

*Conventions analysis: 2026-08-25*
