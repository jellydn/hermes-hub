# Technology Stack

Generated: 2026-06-06

## Runtime & Package Manager

| Component | Choice | Notes |
|-----------|--------|-------|
| Runtime (production) | Node.js 22 (Alpine) | Multi-stage Docker build |
| Runtime (dev) | Bun | Fast package manager and script runner |
| Package manager | Bun | Lockfile: `bun.lock` |

## Frontend

| Component | Choice | Version |
|-----------|--------|---------|
| Framework | React | ^19.2.0 |
| Full-stack router | TanStack Start | ^1.168.20 |
| Client router | TanStack Router | ^1.170.11 |
| Forms | React Hook Form + Zod | ^7.55.0 / ^4 |
| Form resolvers | @hookform/resolvers | ^5.4.0 |
| UI primitives | Radix UI (react-slot) | ^1.2.4 |
| Icons | Lucide React | ^0.454.0 |
| CSS | TailwindCSS v4 | ^4.0.0 |
| CSS utilities | class-variance-authority, clsx, tailwind-merge | — |
| Typography | @tailwindcss/typography | — |
| Devtools | @tanstack/react-devtools, @tanstack/react-router-devtools | — |

## Backend

| Component | Choice | Version |
|-----------|--------|---------|
| API framework | Hono | ^4.0.0 |
| Server entry | TanStack Start + Hono | — |
| Database | PostgreSQL | — |
| ORM | Drizzle ORM + drizzle-kit | ^0.31.10 |
| Auth | Better Auth (magic link) | ^1.6.11 |
| Auth adapter | @better-auth/drizzle-adapter | — |
| SSH | node-ssh | ^13.0.0 |
| Realtime | Server-Sent Events (Hono streamSSE) | — |
| Encryption | AES-256-GCM (Node built-in crypto) | — |
| Email | Resend (optional) | — |
| Monitoring | @sentry/node | — |

## Build & Tooling

| Component | Choice |
|-----------|--------|
| Bundler | Vite ^8.0.0 |
| TypeScript | ^6.0.2 |
| Linting/formatting | Biome |
| Testing | Vitest ^4.1.5 + @testing-library/react ^16.3.0 |
| DOM environment | happy-dom ^20.10.1 |
| Git hooks | pre-commit (biome-check, typecheck, react-doctor) |
| React quality | react-doctor ^0.4.0 |

## DevOps

| Component | Choice |
|-----------|--------|
| Containerization | Docker (multi-stage: Bun build → Node.js runtime) |
| Orchestration | Docker Compose (app + Postgres + Mailpit for dev) |
| CI | GitHub Actions (biome → typecheck → test → build) |
| CD | GitHub Actions deploy workflow |
| Image registry | GitHub Container Registry (ghcr.io) |
| Migrations | Drizzle Kit (bun run db:migrate) |
| Startup | scripts/start-production.mjs (runs migrations at startup) |

## Configuration Files

| File | Purpose |
|------|---------|
| `package.json` | Dependencies, scripts |
| `tsconfig.json` | TypeScript config (verbatimModuleSyntax, bundler resolution) |
| `vite.config.ts` | Vite build config (SSR, aliases, optimizeDeps exclusions) |
| `biome.json` | Lint + format rules, overrides |
| `drizzle.config.ts` | Drizzle ORM config (PostgreSQL, schema path) |
| `components.json` | shadcn/ui config |
| `compose.yaml` | Docker Compose services |
| `Dockerfile` | Multi-stage container build |
| `.pre-commit-config.yaml` | Git hooks |
| `.github/workflows/ci.yml` | CI pipeline |
| `.github/workflows/deploy.yml` | CD pipeline |
