# 1. TanStack Start with Hono API dispatch

Date: 2026-05-31

## Status

Accepted

## Context

The application needs to serve both a rich single-page application (SPA) with server-side rendering (SSR) and a RESTful API backend. Using a single framework for both the UI and API would create tight coupling, while maintaining two completely separate services would add deployment complexity.

The project uses TanStack Start (React 19 + TanStack Router + Vite) for the frontend, which provides SSR, file-based routing, and streaming. The API needs to handle SSH connections, database queries, provider configs, and third-party integrations.

## Decision

Use a single Node.js server process with a request dispatch pattern at the TanStack Start entrypoint (`src/server.ts`). Requests starting with `/api/*` are forwarded to a Hono `apiApp`, while all other requests are handled by the TanStack Start SSR handler.

At runtime, the production server (`scripts/start-production.mjs`) creates a plain Node.js HTTP server that converts between Node.js `req`/`res` and Web API `Request`/`Response`, then calls the unified entrypoint.

Key design points:

- Hono handles only `/api/*` routes — it owns no middleware for static files or SSR
- The TanStack Start entrypoint owns the routing decision with a simple `startsWith("/api/")` check
- The production server serves static files directly from `dist/client/` before falling through to the SSR entrypoint
- In development, Vite handles both client and SSR middleware transparently

## Consequences

### Positive

- Single deployment artifact — one Docker image, one process, one port
- Shared auth session handling between UI (server functions) and API (Hono middleware)
- Hono's lightweight middleware stack keeps API routes fast and testable
- The API can be independently tested via unit tests without spinning up the SSR layer
- Static assets are cached aggressively with content-hashed filenames

### Negative

- The `/api/*` prefix is hardcoded — moving the API to a different domain later requires refactoring every API route reference in the client code
- The production server's Node.js-to-Web-API adapter (`Readable.toWeb`) adds subtle complexity around request body consumption, which previously caused a bug where cloned request bodies were consumed before reaching Better Auth
- In development mode, HMR (hot module replacement) must be compatible with the Hono router initialization
