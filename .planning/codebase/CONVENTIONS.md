# Coding Conventions

**Analysis Date:** 2026-05-26

## Naming Patterns

**Files:** kebab-case (`server-detail.tsx`, `connection-wizard.tsx`, `status-overview.tsx`, `use-mount-effect.ts`, `ai-providers.ts`). Test files match source base name: `server-detail.test.tsx` co-located with `server-detail.tsx`. Feature files live under `src/features/<area>/`, lib files under `src/lib/`, UI primitives under `src/components/ui/`.

**Functions:** camelCase for utility/helper/event handlers (`formatOsSummary`, `handleAction`, `refreshStatus`, `goToNextStep`). PascalCase for React component functions (`ServerDetail`, `DashboardStatusOverview`, `ConnectionWizard`). Async event handlers are declared with `function` keyword inside the component (not arrow) for hoisting, then wrapped at call sites with `() => void handleAction()`.

**Variables:** camelCase (`initialDetail`, `actionState`, `fetchMock`, `isConnecting`, `savedConfig`). Boolean prefixes: `is*`, `has*`, `show*` (`isPending`, `hasLogs`, `showConfirmation`). State setters follow `set<StateName>` pattern.

**Types:** PascalCase. Union types use descriptive suffix or none (`ServerActionType`, `ServerActionResult`, `AuthMethod`, `ConnectionDraft`). Object types use descriptive names often with `Summary`, `Snapshot`, or `Config` suffixes (`DashboardStatusSnapshot`, `ProviderSettingsSummary`, `ServerActionHistoryItem`, `LogsSnapshot`). Interface-like object types use `type` keyword consistently (no `interface`).

## Code Style

**Formatting:** Biome. Config at `biome.json` (schema `2.4.15`). No explicit formatter overrides (defaults apply). `css.parser.tailwindDirectives: true` for Tailwind v4 support. Linter rule: `security.noDangerouslySetInnerHtml: "off"`. File exclusion: `src/routeTree.gen.ts` (auto-generated).

**Language:** TypeScript with strict mode (`strict: true`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `noUncheckedSideEffectImports`). `verbatimModuleSyntax: true` requires `import type` for type-only imports. `jsx: "react-jsx"` means no explicit `import React` needed in JSX files. Target `ES2022`.

**Classes:** CSS is entirely utility-first Tailwind v4 with custom `island-shell`, `island-kicker`, `display-title`, `page-wrap`, `dashboard-nav-link` classes. No CSS modules or styled-components. Conditional classes built with inline ternaries, array `.join(" ")`, or `cn()` helper.

## Import Organization

**Order:**
1. Third-party library imports (alphabetically within group): `lucide-react`, `react` / `react-dom`, testing libraries, vitest
2. Blank line
3. `import type` for type-only imports (required by `verbatimModuleSyntax`)
4. Blank line
5. Local imports via `@/*` path alias: `@/components/ui/button`, `@/lib/utils`, `@/features/...`
6. Relative imports (only in routes files importing from `../../server/...`)

Type imports and value imports are separate statements:

```ts
import { useEffect, useState } from "react";
import type { ComponentType, EffectCallback } from "react";
```

**Path Aliases:**
- `@/*` → `./src/*` (preferred, from `tsconfig.json` paths)
- `#/*` → `./src/*` (from `package.json` imports, less common)
- Relative imports (`../../server/auth`) are used in route files for server-side modules

## Error Handling

**Patterns:** Multi-layered approach with three distinct error styles:

1. **API fetch errors** — check `response.ok`, parse JSON with `.catch(() => null)`, fallback messages with `??` operator:
   ```ts
   const payload = (await response.json().catch(() => null)) as {...} | null;
   if (!response.ok || !payload?.message) {
     setError(payload?.error ?? "Action failed.");
     return;
   }
   ```

2. **Component state errors** — tracked as `string | null` state variables alongside `isLoading`, `isSaving`, etc. Set on failure, cleared before new attempts:
   ```ts
   const [error, setError] = useState<string | null>(null);
   setError(null);    // clear before attempt
   setError(msg);     // on failure
   ```

3. **Network/catch errors** — generic try/catch wrapping async operations, with typed narrowing:
   ```ts
   } catch (error) {
     setError(error instanceof Error ? error.message : "Unable to refresh.");
   }
   ```

4. **UI feedback** — success/error messages rendered as styled `<div>` elements with borders and icons (emerald for success, red/amber for error). No toast/notification library. Messages are state-driven, cleared on next action.

5. **Edge cases** — `requestCounterRef` pattern prevents stale updates from out-of-order async responses. `isActive` boolean flag prevents state updates after unmount.

## Function Design

**Size:** Components stay focused — one feature per component file (e.g., `ServerDetail`, `DashboardStatusOverview`, `ConnectionWizard`). Sub-components extracted as private functions within the same file when reused (e.g., `ActionButton`, `ConfirmationCard`, `SummaryCard`, `Field`). Pure helpers extracted as standalone functions at module scope (`formatOsSummary`, `createHistoryEntry`, `formatTimestamp`).

Each component follows a consistent structure:
1. Imports
2. Type definitions (props, state)
3. Component function with state, handlers, JSX
4. Private sub-components (if any)
5. Helper/pure functions (formatters, validators)

**Event handlers:** Defined as `async function handleX()` inside component body, bound at call sites with `() => void handleX()`. Loading/error state managed within the handler with try/catch/finally.

## Module Design

**Exports:** Named exports exclusively (no default exports). Components export as named: `export function ServerDetail(...)` or `export function ProviderSettings(...)`. Pure function helpers are exported when tested directly (`export function mergeInstallSnapshot`, `export function quantizeInstallProgress`). Types exported with `export type`. UI primitives like `Button` export both the component and the `buttonVariants` config.
