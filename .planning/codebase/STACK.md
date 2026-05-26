# Technology Stack
**Analysis Date:** 2026-05-26

## Languages
**Primary:** TypeScript ^6.0.2 - All application code (server, client, API routes, migrations, tests)
**Secondary:** CSS (Tailwind CSS v4 directives) - Custom design system in `src/styles.css` with CSS custom properties, gradients, animations

## Runtime
**Environment:** Bun 1.3.14 - JavaScript runtime used for development, building, testing, and running the app
**Package Manager:** Bun (lockfile: `bun.lock` present, `package-lock.json` not used)

## Frameworks
**Core:**
- **React** ^19.2.0 - UI component library
- **TanStack Start** (latest) - React-based SSR / full-stack meta-framework built on TanStack Router; runs on Vite
- **TanStack Router** (latest) - File-based client routing with auto-generated `routeTree.gen.ts`
- **Hono** ^4.12.23 - Lightweight HTTP framework used for all `/api/*` routes (mounted in `server/app.ts`)
- **Drizzle ORM** ^0.45.2 - Type-safe SQL ORM for PostgreSQL; schema in `server/db/schema.ts`

**Testing:** Vitest ^4.1.5 - Unit and integration tests with jsdom environment for React component tests

**Build/Dev:**
- **Vite** ^8.0.0 - Dev server and production bundler
- **@tanstack/router-plugin** ^1.132.0 - Vite plugin for route tree generation
- **@tanstack/react-start** (latest) - TanStack Start entry points and server bundle
- **@vitejs/plugin-react** ^6.0.1 - React Fast Refresh support
- **@tailwindcss/vite** ^4.1.18 - Tailwind CSS Vite integration
- **drizzle-kit** ^0.31.10 - Migration generation and DB push
- **Biome** (via biome.json) - Fast linter and formatter

## Key Dependencies

### Critical
| Package | Version | Why It Matters |
|---------|---------|---------------|
| `better-auth` | ^1.6.11 | Magic-link authentication; session management; Drizzle adapter |
| `drizzle-orm` | ^0.45.2 | All DB interactions (users, servers, installs, audit logs, AI providers, Telegram configs) |
| `hono` | ^4.12.23 | Every `/api/*` endpoint; streaming SSE for install progress |
| `node-ssh` | ^13.2.1 | SSH connectivity to target VPS; remote command execution; OS verification |
| `postgres` | ^3.4.9 | Native PostgreSQL client used by Drizzle |

### Infrastructure
| Package | Version | Purpose |
|---------|---------|---------|
| `tailwindcss` | ^4.1.18 | Utility-first CSS with the `@tailwindcss/typography` plugin |
| `lucide-react` | ^1.16.0 | Icon component library for UI |
| `class-variance-authority` | ^0.7.1 | Component variant management (shadcn-style) |
| `clsx` + `tailwind-merge` | ^2.1.1 / ^3.6.0 | Class name merging via shared `cn()` utility |
| `@radix-ui/react-slot` | ^1.2.4 | Polymorphic component primitives |
| `@tanstack/react-devtools` | latest | Dev-time React component inspection |
| `@tanstack/react-router-devtools` | latest | Dev-time router state inspection |

### Dev Dependencies
| Package | Version | Purpose |
|---------|---------|---------|
| `@testing-library/react` | ^16.3.0 | React component testing |
| `@testing-library/dom` | ^10.4.1 | DOM query utilities |
| `jsdom` | ^28.1.0 | DOM environment for Vitest |
| `postcss` + `autoprefixer` | ^8.5.15 / ^10.5.0 | PostCSS pipeline via `postcss.config.mjs` |
| `@types/node` + `@types/react` + `@types/react-dom` | various | TypeScript definitions |

## Configuration
**Environment:** 4 required env vars (see `.env.example`):
- `DATABASE_URL` — PostgreSQL connection string
- `ENCRYPTION_KEY` — 32-byte hex key for AES-256-GCM credential encryption
- `BETTER_AUTH_SECRET` — Signing secret for Better Auth session cookies
- `BETTER_AUTH_URL` — Public URL for magic link generation (defaults to `http://localhost:3000`)

**Build Config Files:**
- `vite.config.ts` — Vite + Vitest configuration with Tailwind, TanStack Start, and React plugins
- `drizzle.config.ts` — Drizzle Kit config (PostgreSQL dialect, schema path at `./server/db/schema.ts`, output to `./drizzle/`)
- `tsconfig.json` — TypeScript strict mode, `ES2022` target, `ESNext` modules, `bundler` resolution, `@/*` path alias
- `postcss.config.mjs` — Autoprefixer plugin
- `components.json` — shadcn/ui aliases (`@/components/ui`, `@/lib/utils`, `@/hooks`)
- `biome.json` — Linter rules with Tailwind CSS parser support
- `.pre-commit-config.yaml` — Pre-commit hooks (whitespace, YAML/JSON check, Biome lint, TypeScript typecheck)

## Platform Requirements
**Development:**
- Bun 1.3.14+
- PostgreSQL instance (local or remote) set as `DATABASE_URL`
- `openssl` for generating `ENCRYPTION_KEY` (`openssl rand -hex 32`)
- Port 3000 for dev server

**Production:**
- Node.js or Bun runtime with PostgreSQL access
- Same 4 env vars as development
- No Dockerfile or container config found — deployment is ad-hoc
- No CI/CD pipeline (no `.github/workflows/` directory)
- Static assets served via TanStack Start's production build
