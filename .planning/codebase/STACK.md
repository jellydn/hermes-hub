# Technology Stack

## Language & Runtime

- **TypeScript** v6.0.2 — strict mode enabled (`noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`)
- **Bun** v1.1.26 — package manager and local dev runtime
- **Node.js** 22-alpine — production runtime (via Docker multi-stage build)

## Frameworks

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| **SSR Framework** | TanStack Start | ^1.168.20 | Full-stack React framework with SSR |
| **Router** | TanStack React Router | ^1.170.11 | File-based routing |
| **API Server** | Hono | ^4.12.23 | HTTP API framework for `/api/*` endpoints |
| **UI** | React | ^19.2.0 | Component library |
| **Styling** | Tailwind CSS | ^4.1.18 | Utility-first CSS |
| **UI Components** | Shadcn UI (new-york style) | — | Primitive components via Radix UI |
| **Icons** | Lucide React | ^1.16.0 | Icon library |

## Database & ORM

- **PostgreSQL** 17-alpine (dev via Docker Compose, production on VPS/Dokku)
- **Drizzle ORM** ^0.45.2 — type-safe SQL query builder
- **Drizzle Kit** ^0.31.10 — migration generation
- **postgres** ^3.4.9 — PostgreSQL JS client (used by Drizzle)

## Authentication

- **Better Auth** ^1.6.11 — authentication library with magic link support
- **@better-auth/drizzle-adapter** ^1.6.11 — Drizzle ORM adapter
- **Plugins:** `magicLink`, `tanstackStartCookies`

## Infrastructure & SSH

- **node-ssh** ^13.2.1 — SSH client for remote server management
- **docker** — Multi-stage builds, Compose orchestration
- **Dokku** — PaaS deployment target

## Form Handling

- **react-hook-form** ^7.76.1 — form state management
- **@hookform/resolvers** ^5.4.0 — Zod resolver integration
- **Zod** ^4.4.3 — schema validation

## Styling Utilities

- **class-variance-authority** ^0.7.1 — component variant management
- **tailwind-merge** ^3.6.0 — Tailwind class deduplication
- **clsx** ^2.1.1 — conditional class names

## Build & Dev Tooling

| Tool | Version | Purpose |
|------|---------|---------|
| Vite | ^8.0.0 | Bundler and dev server |
| @vitejs/plugin-react | ^6.0.1 | React fast-refresh |
| @tailwindcss/vite | ^4.1.18 | Tailwind CSS Vite plugin |
| @tanstack/react-router-devtools | ^1.167.0 | Router dev tools |
| TypeScript | ^6.0.2 | Type checking (`tsc --noEmit`) |

## Testing

- **Vitest** ^4.1.5 — test runner
- **@testing-library/react** ^16.3.0 — React component testing
- **@testing-library/dom** ^10.4.1 — DOM testing utilities
- **happy-dom** ^20.10.1 — DOM environment (fast)
- **jsdom** ^28.1.0 — DOM environment (comprehensive)

## Code Quality

- **Biome** — linting and formatting (`@biomejs/biome`)
- **React Doctor** ^0.4.0 — code quality scanning (security, performance, architecture)
- **Pre-commit** — hooks for Biome, typechecking, React Doctor

## Scripts

| Command | Script |
|---------|--------|
| `dev` | `vite dev --port 3000` |
| `build` | `vite build` |
| `test` | `vitest run --passWithNoTests --reporter=dot` |
| `typecheck` | `tsc --noEmit` |
| `db:generate` | `drizzle-kit generate` |
| `db:migrate` | `node scripts/db-migrate.mjs` |
| `doctor` | `react-doctor` |
| `brand:assets` | `bun run scripts/generate-brand-assets.ts` |

## Path Aliases

| Alias | Target |
|-------|--------|
| `#/*` | `./src/*` |
| `#server/*` | `./server/*` |
| `#shared/*` | `./shared/*` |

Configured in both `tsconfig.json` (`paths`) and `package.json` (`imports`). Vite uses `resolve.tsconfigPaths: true`.
