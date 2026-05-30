# Technology Stack

**Analysis Date:** 2026-05-28

## Languages
**Primary:**
- TypeScript 6.0.2 - All application code (frontend routes, backend logic, database schema, tests)

**Secondary:**
- JavaScript (ESM) - Vite configuration, build tooling

## Runtime
**Environment:**
- Bun - Primary runtime and package manager (used for dev, build, test, typecheck)
- Node.js compatibility layer via Bun for production deployment (Docker)

**Package Manager:**
- Bun (latest) - `bun install`, `bun run` scripts
- Lockfile: `bun.lock` (present)

## Frameworks
**Core:**
- TanStack Start 1.168.13 - Full-stack React framework with SSR, file-based routing
- TanStack React Router 1.170.8 - Client-side routing
- Hono 4.12.23 - Lightweight web framework for `/api/*` endpoints
- React 19.2.0 - UI library
- Drizzle ORM 0.45.2 - TypeScript ORM for PostgreSQL

**Testing:**
- Vitest 4.1.5 - Unit and integration testing
- Testing Library 16.3.0 (React) - Component testing utilities
- jsdom 28.1.0 - Browser environment simulation

**Build/Dev:**
- Vite 8.0.0 - Build tool and dev server
- @vitejs/plugin-react 6.0.1 - React Fast Refresh
- @tailwindcss/vite 4.1.18 - Tailwind CSS integration
- TypeScript 6.0.2 - Type checking with strict mode

**UI/Styling:**
- Tailwind CSS 4.1.18 - Utility-first CSS framework
- class-variance-authority 0.7.1 - Component variant management
- clsx 2.1.1 - Conditional class names
- tailwind-merge 3.6.0 - Tailwind class deduplication
- lucide-react 1.16.0 - Icon library
- Radix UI (via @radix-ui/react-slot 1.2.4) - Primitive components

**Database:**
- Drizzle Kit 0.31.10 - Database migrations and schema management
- postgres 3.4.9 - PostgreSQL client (via postgres.js)

## Key Dependencies
**Critical:**
- better-auth 1.6.11 - Authentication with magic link support
- @better-auth/drizzle-adapter 1.6.11 - Drizzle ORM adapter for Better Auth
- node-ssh 13.2.1 - SSH client for remote server management
- rate-limiter-flexible 11.1.0 - Rate limiting for API endpoints

**Infrastructure:**
- @tanstack/react-start/plugin/vite - Vite plugin for TanStack Start SSR
- @tanstack/devtools-vite 0.7.0 - Development tools integration
- @tanstack/react-devtools 0.10.5 - React DevTools integration

## Configuration
**Environment:**
- `.env` file for local development (copy from `.env.example`)
- Required variables:
  - `DATABASE_URL` - PostgreSQL connection string (required for all operations)
  - `ENCRYPTION_KEY` - 32-byte hex key for AES-256 credential encryption
  - `BETTER_AUTH_SECRET` - Secret for session signing
  - `BETTER_AUTH_URL` - Public URL (defaults to `http://localhost:3000` in dev)
  - `RESEND_API_KEY` - Optional email service for magic links (falls back to console in dev)
  - `RESEND_FROM` - Optional sender email address

**Build:**
- `vite.config.ts` - Vite configuration with TanStack Start, Tailwind, and React plugins
- `tsconfig.json` - TypeScript configuration (ES2022, strict mode, bundler resolution)
- `drizzle.config.ts` - Drizzle Kit configuration (requires `DATABASE_URL`)
- `biome.json` - Biome linter/formatter configuration (excludes generated files)
- `app.json` - Empty scripts placeholder for deployment

## Platform Requirements
**Development:**
- Bun runtime (latest version)
- PostgreSQL database (local or remote)
- Port 3000 (default for Vite dev server)

**Production:**
- Docker container (built from Dockerfile)
- PostgreSQL 14+ (managed or self-hosted)
- Reverse proxy (Caddy/nginx) for HTTPS termination
- Deployment targets: VPS with Docker Compose, or Dokku

## CI/CD Pipeline
**GitHub Actions:**
- `ci.yml` - Runs on PRs and pushes to main/master
  - Bun setup, dependency install, Biome check, typecheck, test, build
- `deploy.yml` - Deploys to VPS or Dokku on push to main/master
  - VPS: Docker image build -> GHCR push -> SSH deploy with Docker Compose
  - Dokku: Git push deployment with config sync

**Quality Gates:**
1. Biome code formatting and linting
2. TypeScript type checking
3. Vitest test suite
4. Production build verification

---
*Stack analysis: 2026-05-28*
