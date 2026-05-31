# 3. Better Auth with Magic Link Authentication

Date: 2026-05-31

## Status

Accepted

## Context

The application requires user authentication to protect dashboard pages, server management, provider configs, and Telegram integration. The target audience includes non-technical users who should be able to sign in without creating passwords.

The project needs an auth system that integrates with the Postgres database (using Drizzle ORM) and works with the TanStack Start SSR architecture, including server-side session validation for route guards.

## Decision

Use Better Auth with the Magic Link plugin as the sole authentication mechanism.

Key design decisions:

- Better Auth is initialized lazily via `getAuth()` in `server/auth.ts` to avoid crashes when `DATABASE_URL` is unset (e.g., during development without a database)
- Magic link emails are sent via the Resend API when `RESEND_API_KEY` is set, with a `console.log` fallback in development mode
- The magic link `sendMagicLink` callback throws in production without `RESEND_API_KEY` to avoid leaking login URLs into application logs
- Session cookies are set via `tanstackStartCookies()` plugin for compatibility with TanStack Start's server function cookie handling
- Custom rate limiting (3 requests per 5 minutes per email) wraps the Better Auth handler at the Hono route level
- The `/api/auth/send-magic-link` route rewrites the request to `/api/auth/sign-in/magic-link` before passing to Better Auth, while the catch-all `/api/auth/*` passes requests through directly

## Consequences

### Positive

- Passwordless auth — users sign in with just their email, reducing support burden
- Better Auth handles session management, token generation, and verification table management automatically
- Direct Drizzle adapter integration means auth tables share the same connection pool as application tables
- Lazy initialization allows the dev server to start without a database connection
- Custom rate limiting prevents magic link spam without coupling to Better Auth internals

### Negative

- Magic link delivery depends on Resend API availability (downtime means no logins)
- The lazy init pattern means auth is unavailable until the first request that triggers `getAuth()` — all route handlers must check `hasDatabaseUrl()` first
- Better Auth's `process.env.NODE_ENV` replacement at build time (via Vite define) required using `globalThis.process?.env` to preserve the runtime check in production Docker builds
- No support for OAuth, SSO, or password-based auth — all users must use email magic links
- Session revocation requires database access — no offline token validation
