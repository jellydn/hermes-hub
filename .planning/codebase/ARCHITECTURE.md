# Architecture

**Analysis Date:** 2026-08-25

## Pattern Overview

**Overall:** Full-stack monolith with clear frontend/backend separation

**Key Characteristics:**
- File-based routing (TanStack Start) for pages
- Server-side rendering (SSR) with client-side hydration
- REST API layer (Hono) for backend operations
- SSH-based remote execution for VPS management
- In-memory state for session credentials and real-time streams

## Layers

**Frontend (React/TypeScript):**
- Purpose: User interface, routing, state management
- Location: `src/`
- Contains: Pages (`src/routes/`), components, hooks, utilities
- Depends on: Server API endpoints, auth client
- Used by: Browser (client-side), SSR renderer

**API Layer (Hono):**
- Purpose: REST endpoints for all backend operations
- Location: `server/app.ts`
- Contains: Route handlers, middleware, request/response logic
- Depends on: Server modules (auth, DB, SSH, crypto)
- Used by: Frontend routes, external integrations

**Server Modules (TypeScript):**
- Purpose: Business logic, external integrations
- Location: `server/`
- Contains: Auth, DB, SSH, install orchestration, providers, Telegram
- Depends on: PostgreSQL, external APIs, SSH
- Used by: API layer

**Shared (TypeScript):**
- Purpose: Cross-boundary types and contracts
- Location: `shared/`
- Contains: Type definitions, interfaces
- Depends on: Nothing (leaf module)
- Used by: Both frontend and server

## Data Flow

**Authentication (Magic Link):**
1. User enters email on `/login`
2. Frontend calls `POST /api/auth/send-magic-link`
3. Server generates token, sends email (via Resend or logs to console)
4. User clicks link, frontend calls `GET /api/auth/verify-magic-link`
5. Server creates session, sets cookie
6. Subsequent requests include session cookie

**VPS Connection:**
1. User enters SSH credentials on `/servers`
2. Frontend calls `POST /api/servers` with host/port/credentials
3. Server stores encrypted credentials in DB
4. Server verifies connection via SSH
5. Server returns connection status

**Hermes Deployment:**
1. User clicks "Install" on server detail page
2. Frontend calls `POST /api/servers/:id/install`
3. Server starts SSE stream for progress
4. Server executes remote commands via SSH
5. Server streams progress events to frontend
6. Server updates install status in DB

**Provider Configuration:**
1. User selects provider on `/ai-provider`
2. Frontend calls `POST /api/providers` with credentials
3. Server encrypts API key with AES-256-GCM
4. Server stores encrypted credentials in DB
5. Server verifies provider connection
6. Credentials deployed to Hermes via SSH

## Key Abstractions

**Server Record:**
- Purpose: Represents a managed VPS
- Examples: `server/servers.ts`, `server/db/schema.ts` (`servers` table)
- Pattern: CRUD operations with encrypted credentials

**Install Event:**
- Purpose: Tracks deployment progress and history
- Examples: `server/install/`, `server/db/schema.ts` (`install_events` table)
- Pattern: Append-only log with SSE streaming

**Provider Config:**
- Purpose: Stores AI provider credentials
- Examples: `server/providers/`, `server/db/schema.ts` (`ai_providers` table)
- Pattern: Encrypted storage with versioning

**Action Log:**
- Purpose: Audit trail for server operations
- Examples: `server/audit-log-actions.ts`, `server/db/schema.ts` (`audit_logs` table)
- Pattern: Structured logging with metadata

## Entry Points

**Development Server:**
- Location: `src/server.ts`
- Triggers: `bun run dev`
- Responsibilities: Serves frontend (SSR) and API routes

**Production Server:**
- Location: `scripts/start-production.mjs`
- Triggers: `node scripts/start-production.mjs`
- Responsibilities: Runs migrations, serves static assets and SSR bundle

**API Router:**
- Location: `server/app.ts`
- Triggers: HTTP requests to `/api/*`
- Responsibilities: Route matching, middleware, handler dispatch

**Docker Build:**
- Location: `Dockerfile`
- Triggers: `docker build`
- Responsibilities: Builds production bundle, creates container image

## Error Handling

**Strategy:** Structured error responses with HTTP status codes

**Patterns:**
- Middleware-level error catching (httpsMiddleware, authMiddleware)
- Try-catch blocks in route handlers
- Structured error responses: `{ error: "message" }`
- SSE error events for streaming operations

## Cross-Cutting Concerns

**Logging:** Pino structured logging (`server/lib/logger.ts`)

**Validation:** Zod schemas for request validation, react-hook-form for forms

**Authentication:** Better Auth with magic-link flow, session cookies

**Encryption:** AES-256-GCM for credentials (`server/crypto.ts`)

**Rate Limiting:** In-memory rate limiter for magic-link endpoint

---

*Architecture analysis: 2026-08-25*
