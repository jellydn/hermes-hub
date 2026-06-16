# Directory Structure

## Root Layout

```
.
├── src/                    # Frontend source (TanStack Start)
├── server/                 # Backend source (Hono API)
├── shared/                 # Cross-boundary types
├── drizzle/                # Database migrations
├── docs/                   # Documentation
├── scripts/                # Utility scripts
├── .github/workflows/      # CI/CD pipelines
└── .planning/              # Codebase mapping
```

## `server/` — Backend

```
server/
├── app.ts                  # Hono API app — all route mounting
├── auth.ts                 # Better Auth setup (lazy)
├── constants.ts            # Shared constants
├── crypto.ts               # AES-256-GCM encryption
├── credentials.ts          # Session credential management
├── compose.ts              # Docker Compose operations
├── deploy.ts               # General deploy orchestration
├── managed-compose-deploy.ts  # Managed VPS deploy
├── compose-deploy-ssh.ts   # SSH-based Compose deploy
├── dashboard.ts            # Dashboard API handler
├── install.ts              # Server install API handler
├── logs.ts                 # Log viewing API handler
├── providers.ts            # AI provider management
├── servers.ts              # Server CRUD operations
├── server-actions.ts       # Server action execution
├── server-records.ts       # Server record queries
├── server-detail-snapshot.ts  # Server detail queries
├── settings.ts             # Settings management
├── telegram.ts             # Telegram integration
├── ssh.ts                  # SSH connection management
├── request-guards.ts       # HTTPS enforcement middleware
├── web-ui.ts               # Web UI proxy API handlers
├── health-check.ts         # Health check API handlers
├── db/
│   ├── index.ts            # Database connection (lazy)
│   ├── schema.ts           # All Drizzle table definitions
│   └── health.ts           # Database health check
├── ssh/
│   ├── connection.ts       # SSH connection logic
│   ├── connection.test.ts  # Connection tests
│   ├── key.ts              # SSH key management
│   ├── metrics.ts          # Server metrics collection
│   ├── os.ts               # OS detection
│   └── quoting.ts          # Shell quoting utilities
├── install/
│   ├── workflow.ts         # Install orchestration
│   ├── records.ts          # Install event persistence
│   ├── sse-stream.ts       # SSE event streaming
│   └── sse-stream.test.ts  # SSE stream tests
├── telegram/
│   ├── pairings.ts         # Telegram-server pairings
│   ├── records.ts          # Telegram config persistence
│   ├── model-access.ts     # Model access management
│   └── model-switch.ts     # Model/provider switching
├── providers/
│   ├── records.ts          # Provider persistence
│   ├── model-access-persistence.ts  # Model access DB layer
│   ├── subscription-records.ts  # Subscription persistence
│   └── codex-auth/
│       └── handler.ts      # OpenAI Codex OAuth flow
├── hermes/
│   ├── auth-json.ts        # Auth JSON generation
│   ├── deploy.ts           # Hermes deploy orchestration
│   ├── deploy-context.ts   # Deploy context building
│   ├── deploy-targets.ts   # Deploy target resolution
│   ├── diagnostics-formatting.ts  # Diagnostics formatting
│   ├── mcp-config.ts       # MCP configuration
│   ├── persona.ts          # Persona (SOUL.md) management
│   ├── runtime.ts          # Runtime status/management
│   ├── skills-list.ts      # Skills listing
│   ├── telegram-deploy.ts  # Telegram deploy orchestration
│   ├── telegram-deploy-context.ts  # Telegram deploy context
│   └── with-server-ssh.ts  # SSH context helper
├── web-ui/
│   ├── proxy.ts            # SSH TCP proxy (464 lines)
│   ├── deploy.ts           # Web UI deploy orchestration
│   ├── records.ts          # Web UI record persistence
│   ├── ssh-pool.ts         # SSH connection pool
│   ├── handlers.ts         # Web UI API handlers
│   └── handlers.test.ts    # Handler tests (393 lines)
├── settings/
│   ├── records.ts          # Settings persistence
│   ├── mcp.ts              # MCP server manager
│   ├── agent-skills.ts     # Agent skills manager
│   ├── mcp/
│   │   └── records.ts      # MCP records persistence
│   └── agent-skills/
│       ├── records.ts      # Agent skill persistence
│       ├── deploy.ts       # Agent skill deploy
│       └── remote.ts       # Remote agent skill ops
├── dashboard/
│   ├── records.ts          # Dashboard record queries
│   ├── metrics.ts          # Metrics aggregation+caching
│   └── handlers.ts         # Dashboard API handlers
├── health-check/
│   ├── handler.ts          # Health check orchestrator
│   ├── commands.ts         # Check command definitions
│   └── run.ts              # SSH-based check execution
├── lib/
│   ├── get-client-ip.ts    # IP extraction utility
│   ├── host-key-error-response.ts  # Error response helpers
│   └── send-magic-link-email.ts    # Magic link email via Resend
└── audit-log-actions.ts    # Audit log action types
```

## `src/` — Frontend

```
src/
├── server.ts               # Unified server entrypoint
├── router.tsx              # TanStack Router setup
├── routeTree.gen.ts        # Auto-generated route tree
├── styles.css              # Global Tailwind CSS
├── components/
│   ├── brand-mark.tsx      # Brand logo component
│   ├── Footer.tsx          # Site footer
│   ├── Header.tsx          # Site header
│   ├── root-document.tsx   # Root HTML document
│   ├── ThemeToggle.tsx     # Dark/light theme toggle
│   └── ui/
│       ├── alert-panel.tsx
│       ├── alert-panel-class.ts
│       ├── button.tsx
│       ├── button-variants.ts
│       ├── form-feedback.tsx
│       ├── host-key-trust-panel.tsx
│       ├── input-class.ts
│       └── status-icon.tsx
├── routes/
│   ├── __root.tsx          # Root layout route
│   ├── index.tsx           # Landing page
│   ├── login.tsx           # Login page
│   ├── dashboard.tsx       # Dashboard (with AppShell)
│   ├── servers.index.tsx   # Servers list
│   ├── servers.$id.tsx     # Server detail (uses useMountEffect)
│   ├── servers.$id.install.tsx  # Server install flow
│   ├── servers.new.tsx     # New server form
│   ├── settings.tsx        # Settings page
│   ├── telegram.tsx        # Telegram page
│   ├── logs.tsx            # Logs page
│   ├── ai-provider.tsx     # AI provider settings
│   └── about.tsx           # About page
├── features/
│   ├── auth/login-page.tsx
│   ├── landing/
│   │   ├── landing-page.tsx
│   │   ├── landing-card.tsx
│   │   ├── landing-content.ts
│   │   └── landing-ctas.tsx
│   ├── dashboard/
│   │   ├── app-shell.tsx
│   │   ├── dashboard-page.tsx
│   │   ├── status-overview.tsx
│   │   └── status-overview.test.tsx
│   ├── servers/ (43 files)
│   ├── telegram/ (13 files)
│   ├── providers/ (19 files)
│   ├── settings/ (26 files)
│   ├── logs/
│   │   ├── logs-page.tsx
│   │   ├── logs-viewer.tsx
│   │   └── logs-viewer.test.tsx
│   └── about/about-page.tsx
├── lib/
│   ├── auth-client.ts      # Better Auth client
│   ├── session.ts          # Session management
│   ├── session.test.ts
│   ├── server.ts           # Server API helpers
│   ├── servers.ts          # Server data helpers
│   ├── logs.ts             # Log data helpers
│   ├── utils.ts            # cn() utility
│   ├── dashboard-status.ts # Dashboard status helpers
│   ├── ai-providers.ts     # AI provider helpers
│   ├── provider-labels.ts  # Provider label constants
│   ├── user-subscriptions.ts  # Subscription helpers
│   ├── user-subscriptions.test.ts
│   ├── status-pill.ts      # Status display helpers
│   ├── server-detail.ts    # Server detail helpers
│   ├── brand-mark-graphic.ts    # Brand graphic generation
│   ├── brand-mark-graphic.test.ts
│   ├── parse-theme-css.ts       # Theme CSS parsing
│   ├── parse-theme-css.test.ts
│   ├── wcag-contrast.ts         # WCAG contrast utilities
│   ├── wcag-contrast.test.ts
│   ├── dark-mode-contrast.test.ts
│   ├── dark-theme-tokens-sync.test.ts
│   ├── use-mount-effect.ts      # Mount-only effect hook
│   ├── hermes-community.ts      # Hermes community helpers
│   └── load-hermes-deployment-targets.ts  # Deploy target loader
└── scripts/
    └── theme-init.js       # Theme initialization script
```

## `shared/contracts/` — Cross-Boundary Types

```
shared/contracts/
├── agent-skills.ts
├── agent-skills.test.ts
├── codex-auth.ts
├── host-key-error.ts
├── model-access.ts
├── server-health-check.ts
├── server-web-ui.ts
└── telegram-model-access.ts
```

## `drizzle/` — Database Migrations

```
drizzle/
├── 0000_swift_luckman.sql  through  0018_*.sql
└── meta/
    ├── _journal.json
    └── 0000_snapshot.json  through  0017_snapshot.json
```

## `docs/` — Documentation

```
docs/
├── api-reference.md        # Full HTTP API reference
├── test-coverage-review.md # Test coverage gap analysis
└── adr/
    ├── 0001-tanstack-start-with-hono-api.md
    ├── 0002-postgresql-with-drizzle-orm.md
    ├── 0003-better-auth-with-magic-link.md
    ├── 0004-docker-multi-stage-build.md
    ├── 0005-aes-256-gcm-credential-encryption.md
    ├── 0006-file-based-routing-with-tanstack-router.md
    ├── 0007-tailwind-css-v4-with-island-components.md
    ├── 0008-react-hook-form-with-zod.md
    ├── 0009-single-instance-boundary-for-operational-state.md
    ├── 0010-hermes-runtime-management-from-telegram-page.md
    ├── 0011-hermes-web-ui-with-ssh-tcp-proxy.md
    └── 0012-cross-directory-path-aliases.md
```

## Key Naming Conventions

| Convention | Example |
|------------|---------|
| **Co-located tests** | `server/foo.ts` + `server/foo.test.ts` |
| **Feature modules** | `src/features/<domain>/` |
| **DB table names** | snake_case plural (`servers`, `install_events`, `audit_logs`) |
| **Route files** | `src/routes/<name>.tsx` (TanStack file-based) |
| **Config files** | Root-level: `vite.config.ts`, `tsconfig.json`, `drizzle.config.ts`, `compose.yaml` |
