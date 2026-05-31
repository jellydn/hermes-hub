# Testing Patterns

**Analysis Date:** 2026-05-31

## Test Framework

**Runner:**
- Vitest `^4.1.5` (`package.json`)
- Config: `vite.config.ts` (`test.environment = "node"`, include patterns for `src/**/*.{test,spec}.*` and `server/**/*.{test,spec}.*`)

**Assertion Library:**
- Vitest `expect` API (`server/ssh.test.ts`, `src/lib/session.test.ts`, all `*.test.ts(x)` files)
- UI tests pair `expect` with Testing Library queries (`src/features/*/*.test.tsx`)

**Run Commands:**
```bash
bun run test                      # Run all tests (script in `package.json`, mirrored in `justfile`)
bunx vitest                       # Watch mode (no dedicated watch script in `package.json`)
bunx vitest run --coverage        # Coverage run (no dedicated coverage script in `package.json`)
```

## Test File Organization

**Location:**
- Co-located tests next to source in both frontend and backend (`src/features/servers/server-list.tsx` + `src/features/servers/server-list.test.tsx`, `server/install.ts` + `server/install.test.ts`).

**Naming:**
- `*.test.ts` and `*.test.tsx` naming (`server/providers.test.ts`, `src/features/providers/provider-settings.test.tsx`).

**Structure:**
```text
server/<module>.ts
server/<module>.test.ts
src/features/<feature>/<component>.tsx
src/features/<feature>/<component>.test.tsx
src/lib/<module>.ts
src/lib/<module>.test.ts
```

## Test Structure

**Suite Organization:**
```typescript
describe("server handlers", () => {
	beforeEach(() => {
		vi.resetAllMocks();
		// mock wiring...
	});

	it("stores encrypted credentials when requested", async () => {
		const { connectServer } = await import("./servers");
		const response = await connectServer(createContext({...}));
		expect(response.status).toBe(200);
		expect(encryptSecret).toHaveBeenCalledWith("secret");
	});
});
```
(From `server/servers.test.ts`)

**Patterns:**
- Setup pattern: per-suite `beforeEach` to reset mocks and set default stubs (`server/servers.test.ts`, `server/providers.test.ts`, `src/features/logs/logs-viewer.test.tsx`).
- Teardown pattern: UI tests use `afterEach(cleanup + clearAllMocks)` (`src/features/server-detail.test.tsx`, `src/features/dashboard/status-overview.test.tsx`, `src/features/providers/provider-settings.test.tsx`).
- Assertion pattern: response status + payload object checks for server handlers; role/text-based assertions for UI (`server/app.test.ts`, `server/servers.test.ts`, `src/features/servers/server-list.test.tsx`).

## Mocking

**Framework:** Vitest (`vi.mock`, `vi.fn`, `vi.stubGlobal`)

**Patterns:**
```typescript
vi.mock("./db", () => ({
	getDb: () => ({ select: dbSelect, update: dbUpdate, insert: dbInsert }),
}));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

beforeEach(() => {
	vi.clearAllMocks();
	fetchMock.mockResolvedValue(new Response(JSON.stringify({ status: "connected" }), { status: 200 }));
});
```
(From `server/providers.test.ts`, `src/features/providers/provider-settings.test.tsx`)

**What to Mock:**
- Network and external boundaries (`fetch`, auth/session, DB adapters, SSH layer) in `server/providers.test.ts`, `server/servers.test.ts`, `server/app.test.ts`, `src/features/*` tests with `vi.stubGlobal("fetch", ...)`.
- Router primitives for component tests (`@tanstack/react-router` `Link` mocks in `src/features/servers/server-list.test.tsx`, `src/features/servers/server-detail.test.tsx`).

**What NOT to Mock:**
- Pure computation/parsing behavior is tested directly without module mocks (`parseAndValidateOs`, `normalizeSshError` in `server/ssh.test.ts`).
- Session redirect helper behavior is tested against actual promise outcomes (`src/lib/session.test.ts`).

## Fixtures and Factories

**Test Data:**
```typescript
function createServer(overrides?: Partial<ServerListSummary>): ServerListSummary {
	return {
		id: "server_123",
		label: "Production VPS",
		host: "203.0.113.10",
		// ...
		...overrides,
	};
}
```
(From `src/features/servers/server-list.test.tsx`)

**Location:**
- Fixtures/factories are local helper functions inside each test file (`createContext` in `server/servers.test.ts`, `createSnapshot` in `src/features/dashboard/status-overview.test.tsx`, `createLogs` in `src/features/logs/logs-viewer.test.tsx`, `createDetail` in `src/features/servers/server-detail.test.tsx`).

## Coverage

**Requirements:** None enforced (no threshold config found in `vite.config.ts` or `package.json`).

**View Coverage:**
```bash
bunx vitest run --coverage
```

## Test Types

**Unit Tests:**
- Pure function/unit behavior tests without I/O mocks for parser/normalizer logic (`server/ssh.test.ts`, `src/lib/session.test.ts`).

**Integration Tests:**
- Handler/component integration with mocked dependencies and full request/response flows (`server/app.test.ts`, `server/servers.test.ts`, `server/providers.test.ts`, `src/features/servers/server-detail.test.tsx`, `src/features/dashboard/status-overview.test.tsx`).

**E2E Tests:**
- Not used (no Playwright/Cypress config found; no e2e scripts/deps in `package.json`).

## Common Patterns

**Async Testing:**
```typescript
await waitFor(() => {
	expect(screen.getByText(/provider connected/i)).toBeTruthy();
});

await expect(
	requireSession("/dashboard", async () => null as never),
).rejects.toEqual({ to: "/login", search: { redirect: "/dashboard" } });
```
(From `src/features/providers/provider-settings.test.tsx`, `src/lib/session.test.ts`)

**Error Testing:**
```typescript
expect(() => parseAndValidateOs("\n", "x86_64\n")).toThrowError(UnsupportedOsError);

const response = await updateServer(createContext({ host: "198.51.100.25" }, {...}));
expect(response.status).toBe(400);
expect(await response.json()).toEqual({
	error: "Temporary credential expired. Reconnect the server first.",
});
```
(From `server/ssh.test.ts`, `server/servers.test.ts`)

---

*Testing analysis: 2026-05-31*

