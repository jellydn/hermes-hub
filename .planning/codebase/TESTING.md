# Testing Conventions — HermesHub

Generated from codebase analysis (2026-06-06)

---

## Test Stack

| Tool | Version | Purpose |
|------|---------|---------|
| **Vitest** | 4.1.5 | Test runner (node + happy-dom) |
| **@testing-library/react** | 16.3.0 | Component testing |
| **@testing-library/dom** | 10.4.1 | DOM queries |
| **happy-dom** | 20.10.1 | DOM environment for React tests |
| **jsdom** | 28.1.0 | Alternative DOM environment |

---

## Test Configuration

### vitest.config.ts (via vite.config.ts)
```ts
test: {
  environment: "node",           // default for server tests
  include: [
    "src/**/*.{test,spec}.{js,ts,jsx,tsx}",
    "server/**/*.{test,spec}.{js,ts,jsx,tsx}",
  ],
}
```

### Environment Selection
| Test Type | Environment | Directive |
|-----------|-------------|-----------|
| Server (unit/integration) | `node` | Default |
| Client (React components) | `happy-dom` | `// @vitest-environment happy-dom` |

---

## Test Structure

### File Organization
```
server/
├── *.test.ts              # Unit tests alongside source
├── ssh/
│   ├── connection.test.ts
│   └── host-key-fingerprint.test.ts
└── install/
    └── sse-stream.test.ts

src/
├── lib/
│   ├── session.test.ts
│   └── ai-providers.test.ts
└── features/
    └── {domain}/
        └── *.test.tsx     # Component tests
```

### Naming
- **File**: `{source}.test.{ts,tsx}`
- **Describe blocks**: Module/function name (`describe("requireSession", ...)`)
- **Test cases**: Behavioral (`it("redirects to /login when there is no active session", ...)`)

---

## Mocking Patterns

### Global Mock Setup (vi.hoisted)
```ts
const { selectLimit, dbInsert, dbUpdate } = vi.hoisted(() => ({
  selectLimit: vi.fn(),
  dbInsert: vi.fn(),
  dbUpdate: vi.fn(),
}));

vi.mock("./db", () => ({
  getDb: () => ({
    select: vi.fn().mockReturnValue({ from: ... }),
    insert: dbInsert,
    update: dbUpdate,
  }),
}));
```

### Module Mocking
```ts
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, ...props }) => <a href={to} {...props}>{children}</a>,
}));

vi.mock("lucide-react", () => ({
  LoaderCircle: (props) => <svg {...props} />,
}));
```

### Fetch Mocking
```ts
const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

beforeEach(() => {
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ ... }), { status: 200, headers: { "content-type": "application/json" } })
  );
});
```

### Hono Context Factory
```ts
function createContext(url: string, body: unknown) {
  return {
    req: {
      raw: new Request(url, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
      json: () => Promise.resolve(body),
      header: () => null,
    },
    json: (payload, status = 200) => new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } }),
  } as never;
}
```

### Timer Mocking (for SSE, time-based logic)
```ts
vi.useFakeTimers();
vi.setSystemTime(new Date("2026-05-29T12:00:00.000Z"));
// ...
vi.useRealTimers();
```

---

## Server-Side Testing Patterns

### 1. Route Dispatch Tests (`server/app.test.ts`)
- Mock all handlers via `vi.hoisted` + `vi.mock`
- Test `apiApp.request()` returns correct status + calls correct handler
- Verify middleware (HTTPS, rate limiting, auth unavailable)

### 2. Handler Unit Tests (`server/providers.test.ts`, `server/server-actions.test.ts`)
- Mock: `getAuthSession`, `db`, `ssh`, `crypto`, `fetch`
- Test: Happy path, error paths, validation, edge cases
- Verify: DB calls, audit logs, SSH commands, response shape

### 3. Utility/Logic Tests (`server/ssh/connection.test.ts`)
- Mock `node-ssh` at module level
- Test: Host key verification, error normalization, connection flow

### 4. Database Transaction Tests (`server/install/sse-stream.test.ts`)
- Mock `db.transaction` to capture tx operations
- Verify: Both insert + update called in same transaction

---

## Client-Side Testing Patterns

### 1. Component Tests (`src/features/servers/server-detail.test.tsx`)
- **Environment**: `// @vitest-environment happy-dom`
- **Render**: `@testing-library/react` `render()`, `screen`
- **Interactions**: `fireEvent.click()`, `fireEvent.change()`
- **Async**: `flushAsyncWork()` helper (double `Promise.resolve()` in `act`)

### 2. Mocking Strategy
| Dependency | Mock Approach |
|------------|---------------|
| `@tanstack/react-router` | `Link` → `<a>`, `useNavigate` → mock fn |
| `lucide-react` | SVG components |
| `@/components/ui/*` | Simplified HTML equivalents |
| Child features | Minimal stubs (`data-testid` for queries) |
| `fetch` | `vi.stubGlobal("fetch", fetchMock)` |

### 3. Test Data Factories
```ts
function createDetail(overrides?: { server?: ..., install?: ... }): ServerDetailSnapshot {
  return {
    server: { id: "server_123", label: "Production VPS", host: "203.0.113.10", ... },
    install: { status: "succeeded", version: "latest", updatedAt: "..." },
    actionHistory: [ ... ],
    rollbackTarget: "latest",
    webUi: null,
  };
}
```

---

## Common Test Helpers

### flushAsyncWork
```ts
async function flushAsyncWork() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}
```

### createContext (Hono)
```ts
function createContext(payload: Record<string, unknown>) {
  return {
    req: {
      raw: new Request("http://localhost/api/...", { method: "POST", body: JSON.stringify(payload), headers: { "content-type": "application/json" } }),
      header: () => null,
      param: (name) => name === "id" ? "server_123" : undefined,
      json: async () => payload,
    },
    json: (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }),
  } as never;
}
```

### Mock Reset Pattern
```ts
beforeEach(() => {
  vi.clearAllMocks();
  // Reset specific mocks with fresh implementations
  fetchMock.mockResolvedValue(...);
  selectLimit.mockResolvedValue([...]);
});
```

---

## Assertion Patterns

### Response Assertions
```ts
expect(response.status).toBe(200);
expect(await response.json()).toMatchObject({ status: "succeeded", action: "restart" });
```

### Mock Call Assertions
```ts
expect(fetchMock).toHaveBeenCalledWith("/api/servers/server_123/actions", expect.objectContaining({ method: "POST" }));
expect(insertAuditValues).toHaveBeenNthCalledWith(1, expect.objectContaining({ action: "server.action.restart.started" }));
expect(decryptSecret).toHaveBeenCalledWith("encrypted-secret");
```

### DOM Assertions (React Testing Library)
```ts
expect(screen.getByRole("button", { name: /restart agent/i })).toBeTruthy();
expect(screen.getByText(/are you sure\?/i)).toBeTruthy();
expect(screen.getByLabelText(/server label/i)).toBeTruthy();
expect(screen.getByRole("textbox", { name: /confirm server label/i })).toBeTruthy();
```

---

## Coverage Expectations

### Current State (from docs/test-coverage-review.md)
- **58 tests** across **16 test files**
- **34 source files** total

### Priority Gaps
| Priority | Module | Reason |
|----------|--------|--------|
| High | `server/crypto.ts` | Security-critical encryption, zero tests |
| High | `src/lib/ai-providers.ts` | Pure validation logic, zero tests |
| Medium | `server/ssh.ts` | Error classification, connection logic |
| Medium | `server/install.ts` | Full workflow untested |
| Medium | `server/server-actions.ts` | Update/rollback commands |
| Medium | `server/dashboard.ts` | Snapshot pipeline |

### Well-Covered Areas
- API route dispatch (`server/app.test.ts` — 16 tests)
- Provider save/test (`server/providers.test.ts` — 12 tests)
- Server actions restart/expired cred (`server/server-actions.test.ts` — 8 tests)
- SSE stream hydration/emit (`server/install/sse-stream.test.ts` — 5 tests)
- All feature components (`src/features/*/test.tsx` — 22 tests)

---

## Running Tests

```bash
# All tests (CI mode)
bun run test

# With coverage (if configured)
bun run test --coverage

# Watch mode
bun run test --watch

# Single file
bun run test server/providers.test.ts
```

### Parallel Execution (just check)
```bash
# Runs typecheck + test in parallel
CPU=$(sysctl -n hw.ncpu 2>/dev/null || nproc 2>/dev/null || echo 4)
VITEST_MAX_WORKERS=$CPU bun run test &
wait $T1 $T2
```

---

## Test Maintenance Guidelines

1. **Colocate** — Test file next to source
2. **Mock at boundaries** — Don't mock internal functions, mock external deps (DB, SSH, fetch, auth)
3. **Test behavior, not implementation** — Assert on response shape, side effects (audit logs, DB calls)
4. **Reset mocks** — `vi.clearAllMocks()` in `beforeEach`
5. **Use factories** — Reusable test data builders for complex objects
6. **No flaky timers** — `vi.useFakeTimers()` for time-dependent logic
7. **Clean up** — `afterEach(() => cleanup())` for React tests
8. **Describe error paths** — Test validation, auth failures, network errors, shell injection attempts
