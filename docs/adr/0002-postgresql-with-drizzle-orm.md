# 2. PostgreSQL with Drizzle ORM

Date: 2026-05-31

## Status

Accepted

## Context

The application stores user data (auth sessions, server configs, AI provider credentials, install logs, Telegram configs, audit logs). The data model has clear relational constraints: servers belong to users, installs belong to servers, provider configs belong to users, etc.

An ORM or query builder is needed to provide type safety across the TypeScript codebase and to manage schema migrations.

## Decision

Use PostgreSQL as the database and Drizzle ORM as the query builder and migration tool.

Key design decisions:

- `drizzle-orm` with the `postgres` driver (not `pg`) — lightweight, native ESM, supports prepared statements
- `drizzle-kit` for generating and applying migrations
- Schema is defined in a single file (`server/db/schema.ts`) with re-exports to satisfy Better Auth's naming conventions (`user`, `session`, `account`, `verification`)
- Primary keys use `gen_random_uuid()::text` for app-owned tables and `text(...).primaryKey()` for auth tables
- The database connection is lazy-initialized via a singleton `getDb()` function in `server/db/index.ts`

## Consequences

### Positive

- Full type safety — Drizzle infers TypeScript types from the schema definition
- No code generation step — the schema IS the source of truth
- Drizzle's SQL-like API is explicit about what queries are executed
- Migration files are plain SQL, reviewable and auditable
- The `postgres` driver is significantly smaller than `pg` with native ESM support
- The singleton connection pool avoids repeated connection handshake overhead

### Negative

- No automatic migration detection — schema changes require manual `drizzle-kit generate` and review of the generated SQL
- Drizzle's join API can be verbose compared to Prisma's include syntax
- The singleton `getDb()` pattern makes it harder to test with isolated database instances
- The `prepare: false` option on the postgres client skips prepared statement optimization
