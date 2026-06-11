# Test Coverage Review

Generated: 2026-05-26

> **58 tests** across **16 test files**. All tests pass.
> **34 source files** total (server + src).

---

## Coverage by Module

### Server-side: `server/`

| Module             | Lines | Tests | Coverage | Gaps                                                                                                                                                                  |
| ------------------ | ----- | ----- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| app.ts             | 100   | 16    | ✓ Full   | Route dispatch only (all handlers are mocked)                                                                                                                         |
| ssh.ts             | 164   | 2     | Partial  | Only `parseAndValidateOs` tested; no `verifyServerConnection`, `withSshConnection`, `normalizeSshError`                                                               |
| install.ts         | 590   | 3     | Partial  | Core workflow logic untested; only start + SSE replay checked                                                                                                         |
| logs.ts            | 148   | 3     | ✓ Full   | Unauth, get, clear                                                                                                                                                    |
| dashboard.ts       | 439   | 3     | Partial  | Pure helper functions tested (`toAgentSummary`, `getHealthTone`, `toProviderSummary`, `toTelegramSummary`); `getDashboardStatusSnapshot` and `getVpsSummary` untested |
| providers.ts       | 167   | 2     | ✓ Full   | Save + test with stored key                                                                                                                                           |
| servers.ts         | 195   | 3     | ✓ Full   | Stored creds, ephemeral creds, unsupported OS error                                                                                                                   |
| server-actions.ts  | 534   | 3     | Partial  | Restart, expired ephemeral, detail snapshot tested; update + rollback commands untested                                                                               |
| telegram.ts        | 152   | 4     | ✓ Full   | Unauth, valid connect, invalid token, disconnect                                                                                                                      |
| **crypto.ts**      | 51    | **0** | **None** | AES-256-GCM encrypt/decrypt — fully untested                                                                                                                          |
| **auth.ts**        | 42    | **0** | **None** | Lazy auth init, session retrieval — exercised via mocks in app.test.ts but no direct tests                                                                            |
| **credentials.ts** | 37    | **0** | **None** | In-memory credential map — partially exercised by servers.test.ts                                                                                                     |
| **db/index.ts**    | 17    | **0** | **None** | DB connection singleton — no tests                                                                                                                                    |
| **db/health.ts**   | 6     | **0** | **None** | Health check query — exercised via app.test.ts                                                                                                                        |

### Client-side: `src/features/`

| Feature module                    | Tests | Coverage |
| --------------------------------- | ----- | -------- |
| `servers/connection-wizard.tsx`   | 3     | ✓ Full   |
| `servers/install-progress.tsx`    | 2     | ✓ Full   |
| `servers/server-detail.tsx`       | 3     | ✓ Full   |
| `dashboard/status-overview.tsx`   | 2     | ✓ Full   |
| `providers/provider-settings.tsx` | 3     | ✓ Full   |
| `telegram/telegram-settings.tsx`  | 3     | ✓ Full   |
| `logs/logs-viewer.tsx`            | 3     | ✓ Full   |

### Client-side: `src/lib/`

| Library               | Lines | Logic? | Coverage                                                                                                 |
| --------------------- | ----- | ------ | -------------------------------------------------------------------------------------------------------- |
| `ai-providers.ts`     | 69    | ✓ Yes  | **None** — pure validation functions (`isAiProviderId`, `isValidAiModel`, `formatAiProviderLabel`, etc.) |
| `session.ts`          | 23    | ✓ Yes  | **None** — `requireSession`, `getCurrentSession`                                                         |
| `utils.ts`            | 5     | ✓ Yes  | **None** — `cn()` wrapper                                                                                |
| `use-mount-effect.ts` | 6     | ✓ Yes  | **None** — `useMountEffect` hook                                                                         |
| `auth-client.ts`      | 14    | No     | Config only, low test value                                                                              |
| `dashboard-status.ts` | 48    | No     | Types only, no logic                                                                                     |
| `logs.ts`             | 21    | No     | Types only, no logic                                                                                     |
| `server-detail.ts`    | 27    | No     | Types only, no logic                                                                                     |

### Client-side: `src/routes/` and `src/components/`

12 route files and 4 component files — **zero tests**. These are mostly thin pages that delegate to feature components, but have no test coverage for rendering or error/edge-case states.

---

## Summary: Untested Modules by Priority

### High priority — security-critical or pure logic with no coverage

| Module                    | Why it matters                                                                                  |
| ------------------------- | ----------------------------------------------------------------------------------------------- |
| `server/crypto.ts`        | AES-256-GCM encrypt/decrypt — security-critical. A bug here means credential leak or data loss. |
| `src/lib/ai-providers.ts` | Pure validation functions used by both frontend and backend. Low effort, high value.            |

### Medium priority — partial coverage, important paths untested

| Module                     | What's missing                                                                                 |
| -------------------------- | ---------------------------------------------------------------------------------------------- |
| `server/ssh.ts`            | `verifyServerConnection`, `withSshConnection`, `normalizeSshError` error classification        |
| `server/install.ts`        | Full install workflow (Docker → Compose → Pull → Up), error handling, concurrent install guard |
| `server/server-actions.ts` | Update and rollback command building; `getRollbackTarget` resolution logic                     |
| `server/dashboard.ts`      | `getDashboardStatusSnapshot`, `getVpsSummary` with live SSH metrics and error paths            |

### Low priority — thin wrappers, config, or scaffolding

| Module                        | Why low priority                                           |
| ----------------------------- | ---------------------------------------------------------- |
| `server/auth.ts`              | Lazy init + session retrieval. Stable library boilerplate. |
| `server/credentials.ts`       | Simple Map get/set. Partially exercised by servers tests.  |
| `server/db/index.ts`          | DB singleton. Requires live database.                      |
| `server/db/health.ts`         | Trivial SQL query. Exercised via app.test.ts.              |
| `src/lib/session.ts`          | Thin TanStack Start server function wrapper.               |
| `src/lib/utils.ts`            | Simple `cn()` passthrough.                                 |
| `src/lib/use-mount-effect.ts` | One-liner `useEffect` wrapper.                             |
| `src/routes/*`                | Thin layout/presentation. Feature components are tested.   |

---

## Coverage by API Endpoint

All 14 API endpoints defined in `server/app.ts` are **routing-tested** (verifying the Hono wire-up calls the correct handler). The handler-level tests vary:

| Endpoint                              | Route test | Handler tests | Notes                        |
| ------------------------------------- | ---------- | ------------- | ---------------------------- |
| `GET /api/health`                     | ✓          | ✓             | Real (not mocked) call       |
| `POST /api/auth/send-magic-link`      | ✓          | —             | Delegates to Better Auth     |
| `GET /api/auth/verify-magic-link`     | ✓          | —             | Delegates to Better Auth     |
| `GET /api/auth/callback`              | ✓          | —             | Delegates to Better Auth     |
| `GET POST /api/auth/*`                | —          | —             | Catch-all proxy              |
| `POST /api/servers/connect`           | ✓          | ✓             | 3 handler tests              |
| `GET /api/servers/:id`                | ✓          | ✓             | Tested via detail snapshot   |
| `POST /api/servers/:id/install`       | ✓          | ✓             | 2 handler + 1 SSE test       |
| `GET /api/servers/:id/install/events` | ✓          | ✓             | SSE replay test              |
| `POST /api/servers/:id/actions`       | ✓          | ✓             | 1 restart + 1 expired cred   |
| `POST /api/servers/:id/health-check`  | ✓          | ✓             | 6 handler tests              |
| `GET /api/dashboard/status`           | ✓          | —             | Only helper functions tested |
| `GET /api/logs`                       | ✓          | ✓             | 1 unauthorized + 1 get       |
| `POST /api/logs/clear`                | ✓          | ✓             | 1 test                       |
| `POST /api/providers`                 | ✓          | ✓             | 1 save test                  |
| `POST /api/providers/test`            | ✓          | ✓             | 1 test with stored key       |
| `POST /api/telegram/connect`          | ✓          | ✓             | 1 valid + 1 invalid token    |
| `POST /api/telegram/disconnect`       | ✓          | ✓             | 1 test                       |

---

## Recommendations

1. **Add tests for `server/crypto.ts`** — Roundtrip encrypt/decrypt (happy path), invalid payload format (error path), missing `ENCRYPTION_KEY` (error path). This is security-critical encryption code with no tests.
2. **Add tests for `src/lib/ai-providers.ts`** — Pure logic functions: `isAiProviderId`, `isValidAiModel` (valid/invalid models per provider), `getDefaultAiModel`, `formatAiProviderLabel`. Quick win — no mocking needed.
3. **Fill partial coverage gaps** — `ssh.ts` error classification, `dashboard.ts` full snapshot pipeline, `install.ts` workflow error handling, `server-actions.ts` update/rollback commands.
