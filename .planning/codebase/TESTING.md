# Testing Patterns

**Analysis Date:** 2026-05-28

## Test Framework

**Runner:**
- Vitest 4.1.5
- Config: `vite.config.ts` (inline `test` block)
- Environment: `jsdom` (set globally in config and via `@vitest-environment jsdom` pragma in component tests)

**Assertion Library:**
- Vitest built-in (`expect` from `vitest`)

**Run Commands:**
```bash
bun run test            # Run all tests (vitest run --passWithNoTests)
bunx vitest             # Watch mode (do NOT use `bun test`)
```

**Important:** Never use `bun test` directly. The repo uses Vitest configured through `vite.config.ts`, and the test command is `bun run test`.

## Test File Organization

**Location:**
- Co-located with source files using `.test.ts` or `.test.tsx` suffix
- Server tests live alongside their source in `server/`: `server/ssh.test.ts`, `server/telegram.test.ts`
- Frontend tests live alongside their feature component: `src/features/dashboard/status-overview.test.tsx`
- Shared library tests live in `src/lib/`: `src/lib/session.test.ts`

**Naming:**
- Mirror the source file name exactly with `.test.` inserted: `ssh.ts` -> `ssh.test.ts`
- Component tests use `.test.tsx` for JSX: `status-overview.tsx` -> `status-overview.test.tsx`
- Pure logic tests use `.test.ts`: `install-progress.tsx` contains pure helpers tested in `install-progress.test.tsx`

**Structure:**
```
server/
  ssh.ts                    # Source
  ssh.test.ts               # Co-located test
  app.ts
  app.test.ts
  db/
    schema.ts

src/
  features/
    dashboard/
      status-overview.tsx
      status-overview.test.tsx
    servers/
      server-detail.tsx
      server-detail.test.tsx
      install-progress.test.tsx
      connection-wizard.test.tsx
  lib/
    session.ts
    session.test.ts
```

## Test Structure

**Suite Organization:**
```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("feature name", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Additional setup
	});

	it("describes behavior in plain English", async () => {
		// Arrange, Act, Assert
	});
});
```

**Patterns:**
- `describe()` blocks group related tests by feature or handler
- `beforeEach()` resets mocks with `vi.clearAllMocks()` and sets up default mock implementations
- `afterEach()` calls `cleanup()` for React component tests and restores timers with `vi.useRealTimers()`
- Descriptive `it()` names written as complete sentences: `"stores encrypted credentials when requested"`, `"returns unauthorized when connect runs without a session"`
- Nested `describe()` blocks for integration vs unit tests: `describe("dashboard helpers")` and `describe("dashboard snapshot integration")`

**Import Pattern:**
```typescript
// Vitest imports first
import { beforeEach, describe, expect, it, vi } from "vitest";

// Then type imports
import type { Context } from "hono";

// Then the module under test (dynamic import after mocks are set up)
// The actual import is done inside the test via dynamic import:
// const { functionUnderTest } = await import("./module");
```

## Mocking

**Framework:** Vitest built-in (`vi.mock`, `vi.fn`, `vi.stubGlobal`, `vi.hoisted`)

**Module Mocking Pattern (Top of file):**
```typescript
// Declare mock functions at module scope
const getAuthSession = vi.fn();
const dbSelect = vi.fn();
const selectFrom = vi.fn();
const selectWhere = vi.fn();
const selectOrderBy = vi.fn();
const selectLimit = vi.fn();

// Mock modules before any imports
vi.mock("./auth", () => ({
	getAuthSession,
}));

vi.mock("./db", () => ({
	getDb: () => ({
		select: dbSelect,
	}),
}));

// Dynamic import of the module under test inside each test
// This ensures mocks are applied before the module is loaded
it("test case", async () => {
	const { functionUnderTest } = await import("./module");
	// ... test code
});
```

**Hoisted Mocks Pattern (for complex setups):**
```typescript
const { getAuthSession, withSshConnection, dbSelect } = vi.hoisted(() => ({
	getAuthSession: vi.fn(),
	withSshConnection: vi.fn(),
	dbSelect: vi.fn(),
}));

vi.mock("./auth", () => ({ getAuthSession }));
vi.mock("./ssh", () => ({ withSshConnection }));

// Import after mocks
import { getDashboardStatusSnapshot } from "./dashboard";
```

**Global Fetch Mocking:**
```typescript
const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

// In beforeEach, set default response
beforeEach(() => {
	fetchMock.mockResolvedValue(
		new Response(JSON.stringify({ data: [] }), {
			status: 200,
			headers: { "content-type": "application/json" },
		}),
	);
});
```

**DB Chain Mocking:**
```typescript
// Drizzle query builder is mocked as a fluent chain
dbSelect.mockReturnValue({ from: selectFrom });
selectFrom.mockReturnValue({ where: selectWhere });
selectWhere.mockReturnValue({ orderBy: selectOrderBy });
selectOrderBy.mockReturnValue({ limit: selectLimit });
selectLimit.mockResolvedValue([{ id: "server_123", /* ... */ }]);
```

**What to Mock:**
- External modules: `./auth`, `./db`, `./ssh`, `./crypto`, `./credentials`
- Global `fetch` for HTTP calls in component tests
- `navigator.clipboard` for clipboard API tests
- Hono streaming: `hono/streaming` for SSE tests
- Database schema symbols: `./db/schema` for table references

**What NOT to Mock:**
- The module under test itself
- Pure utility functions (`cn`, `parseAndValidateOs`, `normalizeInstallStatus`)
- React hooks and components being tested
- Internal helper functions within the same module

## Fixtures and Factories

**Test Data Pattern:**
```typescript
// Factory functions for complex test data
function createSnapshot(
	overrides?: Partial<DashboardStatusSnapshot>,
): DashboardStatusSnapshot {
	return {
		generatedAt: "2026-05-26T03:00:00.000Z",
		server: {
			id: "server_123",
			label: "Production VPS",
			host: "203.0.113.10",
			status: "connected",
			osName: "Ubuntu",
			osVersion: "24.04",
			supportLevel: "supported",
		},
		agent: { status: "online", /* ... */ },
		vps: { status: "warning", cpu: 85, memory: 62, disk: 44, /* ... */ },
		provider: { status: "connected", provider: "openai", model: "gpt-4o-mini", /* ... */ },
		telegram: { status: "connected", botUsername: "hermes_helper_bot", /* ... */ },
		...overrides,
	};
}

function createDetail(): ServerDetailSnapshot {
	return {
		server: { id: "server_123", label: "Production VPS", /* ... */ },
		install: { status: "succeeded", version: "latest", /* ... */ },
		actionHistory: [/* ... */],
		rollbackTarget: "latest",
	};
}

function createLogs(): LogsSnapshot {
	return {
		installLogs: [/* ... */],
		actionLogs: [/* ... */],
	};
}
```

**Response Factories:**
```typescript
function createStatusResponse(snapshot: DashboardStatusSnapshot) {
	return new Response(JSON.stringify({ dashboard: snapshot }), {
		status: 200,
		headers: { "content-type": "application/json" },
	});
}

function createErrorResponse(error: string) {
	return new Response(JSON.stringify({ error }), {
		status: 502,
		headers: { "content-type": "application/json" },
	});
}
```

**Hono Context Factories:**
```typescript
function createContext(body: unknown) {
	return {
		req: {
			raw: new Request("http://localhost/api/servers/connect", {
				method: "POST",
				body: JSON.stringify(body),
				headers: { "content-type": "application/json" },
			}),
			json: () => Promise.resolve(body),
			header: () => null,
			param: (name: string) => (name === "id" ? "server_123" : undefined),
		},
		json: (payload: unknown, status = 200) =>
			new Response(JSON.stringify(payload), {
				status,
				headers: { "content-type": "application/json" },
			}),
	} as never;
}
```

**Location:** Factory functions are defined at the bottom of each test file, not shared across files.

## Coverage

**Requirements:** None enforced

**View Coverage:**
```bash
bunx vitest --coverage    # If coverage provider is configured
```

## Test Types

**Unit Tests:**
- Pure function tests: `parseAndValidateOs`, `normalizeSshError`, `normalizeInstallStatus`, `quantizeInstallProgress`
- Helper function tests: `toAgentSummary`, `getHealthTone`, `toProviderSummary`
- Credential lifecycle tests: `storeSessionCredential`, `getSessionCredential`
- No mocking needed for pure functions; direct input/output assertions

**Integration Tests:**
- Hono route handler tests: mock DB/auth/SSH, test full request flow through `apiApp.request()`
- Server action tests: test `runServerAction`, `startServerInstall`, `connectServer` with mocked dependencies
- Dashboard snapshot tests: test full data aggregation with mocked DB and SSH
- Install SSE stream tests: test event emission, DB persistence, and listener notification
- DB query chain tests: verify correct Drizzle query builder calls

**Component Tests:**
- React component tests using `@testing-library/react`: `render`, `screen`, `fireEvent`, `waitFor`
- Tests verify user-facing behavior: rendering, form submission, error states, polling
- Mock `fetch` for API calls; mock `navigator.clipboard` for clipboard operations
- Use `// @vitest-environment jsdom` pragma at top of file

**E2E Tests:** Not used

## Common Patterns

**Async Testing:**
```typescript
// Testing async operations with waitFor
it("shows success message after API call", async () => {
	render(<Component />);
	fireEvent.click(screen.getByRole("button", { name: /submit/i }));

	await waitFor(() => {
		expect(screen.getByText(/success/i)).toBeTruthy();
	});

	expect(fetchMock).toHaveBeenCalledWith("/api/endpoint", expect.objectContaining({
		method: "POST",
	}));
});

// Testing with fake timers for polling
it("polls at the configured interval", async () => {
	vi.useFakeTimers();
	render(<DashboardStatusOverview initialStatus={createSnapshot()} />);

	await advancePollingTime(30_000);
	expect(fetchMock).toHaveBeenCalledTimes(1);

	await advancePollingTime(30_000);
	expect(fetchMock).toHaveBeenCalledTimes(2);
});

// Helper for advancing fake timers with async work
async function advancePollingTime(ms: number) {
	await act(async () => {
		vi.advanceTimersByTime(ms);
		await Promise.resolve();
		await Promise.resolve();
	});
}
```

**Error Testing:**
```typescript
// Testing error responses
it("returns validation error when credentials are missing", async () => {
	selectLimit.mockResolvedValueOnce([{ /* server with null credential */ }]);

	const { startServerInstall } = await import("./install");
	const response = await startServerInstall(createContext("POST"));

	expect(response.status).toBe(400);
	expect(await response.json()).toEqual({
		error: "Temporary credential expired. Reconnect the server first.",
	});
});

// Testing thrown errors
it("rejects non-Linux operating systems", () => {
	expect(() =>
		parseAndValidateOs('NAME="FreeBSD"\nVERSION_ID="13.2"', "x86_64"),
	).toThrowError(UnsupportedOsError);
});

// Testing error normalization
it("maps auth errors to invalid credentials", () => {
	const err = new Error("All configured authentication methods failed");
	const normalized = normalizeSshError(err);
	expect(normalized).toBeInstanceOf(SshConnectError);
	expect(normalized.message).toBe("invalid credentials");
});
```

**Mock Chain Reset:**
```typescript
// Reset mock chains between tests to avoid stale _onceImpl chains
beforeEach(() => {
	vi.clearAllMocks();
	selectLimit.mockReset();
	// Then set up fresh default implementations
	selectLimit
		.mockResolvedValueOnce([serverRecord])
		.mockResolvedValueOnce([installRecord])
		.mockResolvedValueOnce([]);
});
```

**Component Cleanup:**
```typescript
// Always clean up React components after each test
afterEach(() => {
	cleanup();
	vi.clearAllMocks();
	vi.useRealTimers(); // Restore real timers if fake timers were used
});
```

---
*Testing analysis: 2026-05-28*
