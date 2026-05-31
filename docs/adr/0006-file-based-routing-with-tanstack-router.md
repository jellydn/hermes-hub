# 6. File-Based Routing with TanStack Router

Date: 2026-05-31

## Status

Accepted

## Context

The application has multiple pages: landing, login, dashboard, server management (list, detail, new, install), logs, AI provider settings, Telegram configuration, and settings. Each page needs data loading, authentication guards, and consistent layout (AppShell for authenticated pages).

The routing solution must support:

- SSR with streaming for initial page loads
- Route-level authentication (beforeLoad guards)
- Shared layouts for authenticated pages
- Route-based code splitting

## Decision

Use TanStack Router with file-based routing via TanStack Start.

Key design patterns:

- **Route files** live in `src/routes/` — each file maps to a URL path
- **Authenticated pages** use the `beforeLoad` hook to call `requireSession()`, which redirects to `/login` if no session exists
- **Shared layout** is implemented via `AppShell` component defined in `src/routes/dashboard.tsx` and imported by each authenticated route
- **Server function loaders** (`createServerFn`) provide type-safe data loading at the route level — the route fetches data in `beforeLoad` and passes it to the component via route context
- **Exception pattern**: `src/routes/servers.$id.tsx` fetches `/api/servers/:id` from the component with `useMountEffect` instead of a route loader, because it needs polling-capable data fetching
- **Route tree** is auto-generated to `src/routeTree.gen.ts` and excluded from lint and git diffs
- **Scroll restoration** is enabled globally

## Consequences

### Positive

- Route file location maps intuitively to URL structure
- `beforeLoad` guards prevent unauthorized access before the component renders
- Type-safe route context — route data flows from loader to component with full TypeScript types
- Code splitting is automatic per route file
- `AppShell` reuse keeps the authenticated layout consistent without duplication
- SSR streaming provides fast initial page loads

### Negative

- The auto-generated `routeTree.gen.ts` must be regenerated when routes change (handled by the Vite dev server, but requires a build step in CI)
- The `servers.$id.tsx` exception pattern (fetching in component instead of route loader) is inconsistent and requires manual state management for loading/error states
- Route-level loaders cannot easily share cached data between routes without additional query client setup
- The redirect-based auth guard creates a flash of the login page before redirecting if the session check is slow
