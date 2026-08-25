# Testing Patterns

**Analysis Date:** 2026-08-25

## Framework

**Test Runner:** Vitest 4.1.x
- Configuration: `vite.config.ts` (test section)
- Environment: `node` (not DOM)
- Command: `bun run test`

**Test Utilities:**
- Testing Library 16.x (`@testing-library/react`, `@testing-library/dom`)
- happy-dom/jsdom for DOM simulation (server tests)
- Vitest built-in mocking (`vi.mock`, `vi.fn`)

## Test Structure

**File Location:**
- Co-located with source files (`*.test.ts`, `*.test.tsx`)
- Same directory as implementation
- No separate `__tests__` directories

**Test Count:** 116 test files
- `server/` - 73 test files (backend logic)
- `src/` - 42 test files (frontend components)
- `shared/` - 1 test file (types/contracts)

**Naming Convention:**
- `filename.test.ts` for TypeScript tests
- `filename.test.tsx` for React component tests

## Testing Patterns

**Unit Tests:**
- Test individual functions and modules
- Mock external dependencies (DB, SSH, APIs)
- Pure function testing where possible

**Integration Tests:**
- Test API routes with mocked DB
- Test React components with mocked API
- Test SSH operations with mocked `node-ssh`

**Component Tests:**
- Render components with Testing Library
- Test user interactions (click, type, submit)
- Assert DOM output and state changes

## Mocking Strategies

**Database:**
- Mock `getDb()` function
- Use in-memory test data
- Mock Drizzle query builder

**SSH:**
- Mock `node-ssh` module
- Simulate command execution
- Mock connection and authentication

**APIs:**
- Mock fetch/axios for external calls
- Mock Resend for email sending
- Mock AI provider APIs

**File System:**
- Mock `fs` module for file operations
- Use `tmp` directory for test files

## Coverage

**Thresholds:**
- Lines: 45%
- Functions: 40%
- Branches: 35%
- Statements: 45%

**Configuration:**
- Provider: V8
- Reporters: text, lcov, html
- Include: `src/**/*.ts`, `src/**/*.tsx`, `server/**/*.ts`
- Exclude: Generated files, test files, scripts

**Commands:**
- `bun run test` - Run tests
- `bun run test:coverage` - Run with coverage report

## Test Examples

**Server Test:**
```typescript
import { describe, it, expect, vi } from "vitest";
import { handler } from "./app";

describe("API handler", () => {
  it("returns 200 on success", async () => {
    const result = await handler.request("/api/health");
    expect(result.status).toBe(200);
  });
});
```

**Component Test:**
```typescript
import { render, screen, fireEvent } from "@testing-library/react";
import { Button } from "./Button";

describe("Button", () => {
  it("calls onClick when clicked", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Click me</Button>);
    fireEvent.click(screen.getByText("Click me"));
    expect(onClick).toHaveBeenCalled();
  });
});
```

## Running Tests

**Commands:**
```bash
# Run all tests
bun run test

# Run with coverage
bun run test:coverage

# Run specific file
bun vitest run path/to/test.test.ts

# Run in watch mode
bun vitest --watch
```

**CI Integration:**
- Tests run in GitHub Actions CI pipeline
- Coverage uploaded as artifact
- Fail build if thresholds not met

## Test Data

**Fixtures:**
- `server/__snapshots__/` - Snapshot outputs
- `server/*/fixtures/` - Test data files
- Mock data defined inline in tests

**Database:**
- Use in-memory SQLite for unit tests
- Mock DB connection for integration tests
- No shared test database

---

*Testing analysis: 2026-08-25*
