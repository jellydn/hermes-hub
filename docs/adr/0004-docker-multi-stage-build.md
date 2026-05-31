# 4. Docker Multi-Stage Build with Production Node.js Runtime

Date: 2026-05-31

## Status

Accepted

## Context

The application needs to be deployed as a single self-contained unit. The build pipeline produces client bundles (Vite), a server bundle (TanStack Start SSR), and requires Node.js runtime dependencies (node-ssh, ssh2 with native modules). The development toolchain uses Bun for package management and local development.

A Docker image is the standard deployment artifact for containerized environments (fly.io, Railway, etc.).

## Decision

Use a three-stage Docker build:

1. **`deps` stage** (`oven/bun:1-alpine`) — Install production dependencies with `bun install --frozen-lockfile`. Bun is faster for installs and produces a consistent lockfile.

2. **`build` stage** (`oven/bun:1-alpine`) — Copy all source files and run `bun run build` (which invokes `vite build`). This produces `dist/client/` and `dist/server/` bundles.

3. **`runtime` stage** (`node:22-alpine`) — Copy production `node_modules` from the `deps` stage and the compiled `dist/` from the `build` stage. Run with Node.js (not Bun) because native modules like `ssh2`/`cpu-features` are better supported in the Node.js runtime and the Bun runtime is not needed for production.

The runtime uses a custom `start-production.mjs` script that:

- Runs `drizzle-kit migrate` on startup to apply any pending migrations
- Creates a plain `http.createServer` that serves static files from `dist/client/` and proxies everything else to the TanStack Start server entrypoint

## Consequences

### Positive

- Single deployable artifact — `docker build -t hermes-hub . && docker run hermes-hub`
- Smaller runtime image — `node:22-alpine` (no Bun runtime overhead)
- Native modules (ssh2, cpu-features) work reliably in the Node.js runtime
- Database migrations run automatically on container start via the production entrypoint script

### Negative

- The `ENV NODE_ENV=production` in the Dockerfile affects the Vite build, causing `process.env.NODE_ENV` to be replaced at build time — this required workarounds in auth and HTTPS check code using `globalThis.process?.env`
- `bun install --frozen-lockfile` in the `deps` stage means `bun.lock` must be committed and in the Docker build context
- Startup time includes migration execution (can be 5-15 seconds depending on migration count)
- No built-in process manager — if the Node.js process crashes, Docker restarts it via `restart: unless-stopped`
