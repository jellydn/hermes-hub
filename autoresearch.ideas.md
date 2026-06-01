# 💡 Deferred Optimization Ideas

Items that are genuine improvements but were deferred to focus on higher-impact work first.

## Done (not actionable)

- **Parallelize CI/CD checks** — ✅ Done via `just check` shebang recipe
- **Exclude Vite Plugins selectively** — ✅ Done via lazy `await import()` in async config factory
- **Cache Vitest** — ✅ Done via default Vite `cacheDir`
- **Transpile-only Typechecks** — Partially done (incremental tsbuildinfo); full `ts-blank-space` integration is a larger project
- **Replace deterministic `waitFor` polling in jsdom tests** — ✅ Done across the remaining React test files; test suites now use targeted microtask flushing instead of polling where async work is only resolved fetch/state updates.

## Database

- **`health_checks` table defined but never queried**: `server/db/schema.ts` defines a `healthChecks` table that is never imported or referenced by any server or client code. The health check endpoint (`server/db/health.ts`) uses `SELECT 1` instead. A migration to drop this table would clean up the database schema. Not urgent — the table has no FK dependencies and occupies negligible space.
