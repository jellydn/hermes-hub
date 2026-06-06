# Testing

Generated: 2026-06-06

## Framework

| Component | Choice |
|-----------|--------|
| Test runner | Vitest ^4.1.5 |
| DOM environment | happy-dom ^20.10.1 |
| React testing | @testing-library/react ^16.3.0 |
| DOM queries | @testing-library/dom ^10.4.1 |
| Timers | Vitest fake timers (`vi.useFakeTimers()`) |

**Config:** `vite.config.ts` (Vitest plugin)

**Run:** `bun run test` (not `bun test`)

## Test Structure

**48 test files, 308 tests** (all passing). Tests co-located with source:

```
server/
├── app.test.ts                   # API route dispatch (mocked handlers)
├── compose.test.ts               # Docker Compose builder
├── credentials.test.ts           # Credential cache
├── dashboard.test.ts             # Dashboard aggregation helpers
├── install.test.ts               # Install workflow + SSE
├── logs.test.ts                  # Log queries
├── providers.test.ts             # Provider flow + transaction mocking
├── server-actions.test.ts        # Server actions + audit
├── server-compose.test.ts        # Compose deployment
├── server-detail-snapshot.test.ts # Server detail snapshot
├── servers.test.ts               # VPS connection + credentials
├── ssh.test.ts                   # SSH connection + OS validation
├── telegram.test.ts              # Telegram flow
└── web-ui/
    ├── deploy.test.ts            # Deploy orchestration + background work
    ├── handlers.test.ts          # Web UI HTTP handler wiring
    ├── snapshot.test.ts          # Snapshot builder
    ├── records.test.ts           # Record persistence + stale deploy
    ├── reachability.test.ts      # Proxy error formatting
    ├── ssh-pool.test.ts          # SSH connection pooling
    ├── proxy-http.test.ts        # Header/path rewriting
    └── proxy-http.integration.test.ts # Proxy HTTP integration

src/features/
├── dashboard/
│   └── status-overview.test.tsx  # Dashboard status UI
├── logs/
│   └── logs-viewer.test.tsx      # Logs viewer UI
├── providers/
│   ├── provider-settings.test.tsx # Provider settings UI
│   └── custom-provider.test.tsx   # Custom provider UI
├── servers/
│   ├── connection-wizard.test.tsx # Connection wizard UI
│   ├── delete-server-dialog.tsx   # (no dedicated test file)
│   ├── hermes-web-ui-card.test.tsx # Web UI card UI
│   ├── install-progress.test.tsx  # Install progress UI
│   ├── server-detail.test.tsx     # Server detail UI
│   ├── server-detail-aside.test.tsx # Server detail aside
│   ├── server-list.test.tsx       # Server list UI
│   └── use-hermes-web-ui.test.ts  # Web UI state hook
└── telegram/
    └── telegram-settings.test.tsx # Telegram settings UI
```

## Mocking Patterns

**Vitest mocking** (`vi.mock`, `vi.fn`, `vi.spyOn`):
- Database: `vi.mock("../db")` → `getDb` returns mock with `select`, `insert`, `update`, `delete`, `transaction`
- SSH: `vi.mock("../ssh/connection")` → mock `verifyServerConnection`, `withSshConnection`
- Auth: `vi.mock("../auth")` → mock `getAuthSession`
- Crypto: `vi.mock("../crypto")` → mock `encryptSecret`, `decryptSecret`

**Common test patterns:**
```ts
// Mock all handlers to test route dispatch
vi.mock("../servers", () => ({ connectServer: vi.fn() }));

// Fake timers for stale deploy tests
vi.useFakeTimers();
vi.setSystemTime(new Date("2026-06-06T12:00:00.000Z"));

// Mock SVG icons (used across all UI tests)
const MockIcon = (props: Record<string, unknown>) => <svg {...props} />;
```

## Testing Conventions

1. **Co-located tests**: Test files are in the same directory as source (not a separate `__tests__` dir)
2. **No global test setup**: Each test file imports what it needs
3. **Happy-dom**: Used for speed (lighter than jsdom for most tests)
4. **Real timers by default**: `vi.useRealTimers()` in `afterEach`
5. **Semantic queries**: Testing Library queries rely on accessible names — helper text kept outside `<label>` elements
6. **Route dispatch tests**: `server/app.test.ts` verifies all API routes are wired to correct handlers with mocked implementations

## What's Not Tested

See `docs/test-coverage-review.md` for detailed coverage analysis. Key gaps:

| Priority | Module | Reason |
|----------|--------|--------|
| High | `server/crypto.ts` | Security-critical AES-256-GCM — zero tests |
| High | `src/lib/ai-providers.ts` | Pure validation functions — zero tests |
| Medium | `server/ssh.ts` | Error classification, `withSshConnection` |
| Medium | `server/dashboard.ts` | `getDashboardStatusSnapshot`, `getVpsSummary` |
| Medium | `server/server-actions.ts` | Update and rollback command paths |
| Low | `server/auth.ts` | Stable library boilerplate |
| Low | `src/routes/*` | Thin layout/presentation |
