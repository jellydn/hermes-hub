# 12. Cross-Directory Path Aliases for Server and Shared Modules

Date: 2026-06-07

## Status

Accepted

## Context

The project has three top-level TypeScript directories: `src/` (frontend), `server/` (backend), and `shared/` (contracts). Frontend code in `src/routes/` and `src/features/` imports backend modules via relative paths:

```ts
// Before
import { getAuthSession } from "../../server/auth";
import { getCurrentPersonaSettings } from "../../server/settings";
import type { McpServerSummary } from "../../../server/settings/mcp/config";
```

These relative paths are brittle — moving a file requires recalculating the `../` depth. They are also hard to scan: `../../../server/settings/mcp/config` requires the reader to count directory levels to understand which module is being imported.

The project already had two `src/`-scoped aliases (`@/*` and `#/*` both resolving to `./src/*`) configured in `tsconfig.json` `paths`. There were no aliases for `server/` or `shared/`, forcing all cross-directory imports to use relative paths.

## Decision

Add two new path aliases in `tsconfig.json` `paths` and `package.json` `imports`:

- `#server/*` → `./server/*`
- `#shared/*` → `./shared/*`

Replace all cross-directory relative imports (patterns like `../../server/...` and `../../../shared/...`) with the corresponding aliases:

```ts
// After
import { getAuthSession } from "#server/auth";
import { getCurrentPersonaSettings } from "#server/settings";
import type { McpServerSummary } from "#server/settings/mcp/config";
```

The replacement was automated across ~72 files using a regex pattern, then manually verified. All imports from inside `server/` and `shared/` that previously used relative paths to reach across directories were updated.

### Alias consolidation

The existing `@/*` alias (173 files as of June 2026) was consolidated into `#/*` immediately after the initial PR landed. Both aliases resolved to `./src/*`, so this was a mechanical `sed` replacement with zero behavioral change, reducing the alias table from 4 entries to 3.

### Current alias configuration

| Alias | Target | Files |
|-------|--------|-------|
| `#/*` | `./src/*` | 175 |
| `#server/*` | `./server/*` | 40 |
| `#shared/*` | `./shared/*` | 35 |

Both `tsconfig.json` `paths` and `package.json` `imports` were updated so that both TypeScript (`tsc`) and the bundler (Vite, which reads `package.json` `imports` via `resolve.tsconfigPaths: true`) resolve the new aliases.

## Consequences

### Positive

- Cross-directory imports are now location-independent — moving a file within `src/` no longer requires updating its `../../server/` imports
- Imports are self-documenting: `#server/auth` immediately tells the reader this is a backend module, without counting `../` levels
- The `#` prefix convention visually distinguishes project-internal cross-directory imports from npm packages and from intra-src imports
- The alias configuration in `package.json` `imports` ensures Vite resolves them correctly in development and production builds
- `server/` modules never use the aliases (they still use `../` for internal server imports), keeping the convention: aliases are only for cross-directory imports

### Negative

- The alias configuration is now 3 entries instead of 4 after `@/*` → `#/*` consolidation
- The regex-based migration may have missed edge cases in dynamically constructed import paths
- New contributors must learn the alias conventions before understanding the import graph
- The `package.json` `imports` field must stay in sync with `tsconfig.json` `paths` for Vite resolution to work correctly
