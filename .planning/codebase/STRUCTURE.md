# Directory Structure

Generated: 2026-06-06

## Top-Level Layout

```
.
├── server/              # Backend business logic
├── src/                 # Frontend application
│   ├── routes/          # TanStack Start file-based routes
│   ├── features/        # Feature-specific UI components & hooks
│   ├── components/      # Shared UI components
│   ├── lib/             # Shared utilities, types, helpers
│   └── scripts/         # Client-side scripts (theme init)
├── shared/              # Contracts shared between server and client
├── drizzle/             # Database migration SQL files + snapshots
├── docs/                # Documentation (ADR, API reference, test review)
├── scripts/             # Build/deploy utility scripts
├── public/              # Static assets (manifest, robots.txt)
└── .github/             # CI/CD workflows
```

## Server (`server/`)

```
server/
├── app.ts                   # Hono API router (all route bindings)
├── app.test.ts              # API route dispatch tests
├── auth.ts                  # Better Auth instance (lazy)
├── constants.ts             # Image digests, ports, shared constants
├── crypto.ts                # AES-256-GCM encrypt/decrypt
├── credentials.ts           # In-memory ephemeral credential cache
├── dashboard.ts             # Aggregated status snapshot
├── dashboard.test.ts        # Dashboard helper tests
├── install.ts               # Hermes install pipeline + SSE streaming
├── install.test.ts          # Install workflow tests
├── logs.ts                  # Install + action log queries
├── logs.test.ts             # Log query tests
├── providers.ts             # AI provider save, test, deploy
├── providers.test.ts        # Provider flow tests
├── request-guards.ts        # Auth, ownership, HTTPS guards
├── server-actions.ts        # Restart/update/rollback via SSH
├── server-actions.test.ts   # Server action tests
├── servers.ts               # VPS connection + credential handling
├── servers.test.ts          # Server connection tests
├── telegram.ts              # Telegram bot connect/disconnect/deploy
├── telegram.test.ts         # Telegram flow tests
├── compose.ts               # Docker Compose file builder
├── compose.test.ts          # Compose builder tests
├── deploy.ts                # Hermes deployment orchestration
├── db/
│   ├── index.ts             # Database connection singleton
│   ├── health.ts            # Health check query
│   └── schema.ts            # Drizzle ORM table definitions
├── install/
│   ├── workflow.ts          # Install step execution
│   └── sse-stream.ts        # SSE event streaming
├── lib/
│   ├── action-labels.ts     # Server action type + label formatting
│   ├── get-client-ip.ts     # Client IP extraction
│   └── insert-audit-log.ts  # Audit log insertion helper
├── servers/
│   ├── records.ts           # Server record queries
│   └── list.ts              # Server list queries
├── ssh/
│   ├── connection.ts        # SSH connection + verification
│   └── os.ts                # OS info parsing
├── web-ui/
│   ├── handlers.ts          # Deploy, password reveal, proxy handlers
│   ├── background-deploy.ts # Async deploy execution
│   ├── snapshot.ts          # Web UI state snapshot builder
│   ├── snapshot.test.ts     # Snapshot logic tests
│   ├── records.ts           # Web UI record persistence
│   ├── reachability.ts      # Port reachability probes
│   ├── proxy-http.ts        # HTTP proxy logic
│   ├── ssh-forward.ts       # SSH tunnel for proxy
│   ├── ssh-pool.ts          # SSH connection pooling
│   ├── password.ts          # Password generation + resolution
│   └── enabled-context.ts   # Web UI enabled guard
├── providers/
│   └── config.ts            # Provider API key/env derivation
└── __snapshots__/
    └── compose.test.ts.snap # Compose snapshot
```

## Frontend (`src/`)

```
src/
├── server.ts                    # Server entry (dispatches /api/* to Hono)
├── router.tsx                   # TanStack Router setup
├── routeTree.gen.ts             # Generated route tree (do not edit)
├── styles.css                   # TailwindCSS v4 + custom CSS variables
├── routes/
│   ├── __root.tsx               # Root layout (html, head, header, footer)
│   ├── index.tsx                # Landing page
│   ├── login.tsx                # Magic link login
│   ├── dashboard.tsx            # Authenticated dashboard shell
│   ├── servers.index.tsx        # Server list
│   ├── servers.$id.tsx          # Server detail
│   ├── servers.$id.install.tsx  # Live install progress
│   ├── servers.new.tsx          # New server connection wizard
│   ├── ai-provider.tsx          # AI provider configuration
│   ├── telegram.tsx             # Telegram bot management
│   ├── logs.tsx                 # Logs viewer
│   ├── settings.tsx             # Settings page
│   └── about.tsx                # About page
├── features/
│   ├── about/                   # About page component
│   ├── auth/                    # Login page component
│   ├── dashboard/               # Dashboard page, app shell, status overview
│   ├── logs/                    # Logs viewer component
│   ├── providers/               # AI provider settings, panels, state
│   ├── servers/                 # Server detail, connection wizard, install,
│   │                            #   Web UI card, action controls, delete dialog
│   ├── settings/                # Settings page component
│   └── telegram/                # Telegram page, pairing, deploy, sidebar
├── components/
│   ├── root-document.tsx        # Root HTML document (Devtools, Scripts)
│   ├── Header.tsx               # Global header with nav
│   ├── Footer.tsx               # Global footer
│   ├── ThemeToggle.tsx          # Light/dark/auto theme toggle
│   └── ui/
│       ├── button.tsx           # Button with asChild support (Radix Slot)
│       ├── button-variants.ts   # Button variant definitions (cva)
│       └── status-icon.tsx      # Status indicator icon
├── lib/
│   ├── ai-providers.ts          # AI provider validation + formatting
│   ├── auth-client.ts           # Better Auth client
│   ├── dashboard-status.ts      # Dashboard status types
│   ├── logs.ts                  # Log types
│   ├── server-detail.ts         # Server detail snapshot types
│   ├── servers.ts               # Server types
│   ├── session.ts               # Session guard server function
│   ├── status-pill.ts           # Status pill CSS helper
│   ├── use-mount-effect.ts      # Mount-only useEffect hook
│   └── utils.ts                 # cn() utility
└── scripts/
    └── theme-init.js            # Inline theme initialization (prevents FOUC)
```

## Shared Contracts (`shared/`)

```
shared/
└── contracts/
    └── server-web-ui.ts         # ServerWebUiSnapshot, ServerWebUiDeployStatus types
```

## Documentation (`docs/`)

```
docs/
├── adr/                         # Architecture Decision Records (10 ADRs)
│   ├── 0001-tanstack-start-with-hono-api.md
│   ├── 0002-postgresql-with-drizzle-orm.md
│   ├── 0003-better-auth-with-magic-link.md
│   ├── 0004-docker-multi-stage-build.md
│   ├── 0005-aes-256-gcm-credential-encryption.md
│   ├── 0006-file-based-routing-with-tanstack-router.md
│   ├── 0007-tailwind-css-v4-with-island-components.md
│   ├── 0008-react-hook-form-with-zod.md
│   ├── 0009-single-instance-boundary-for-operational-state.md
│   └── 0010-hermes-runtime-management-from-telegram-page.md
├── api-reference.md             # Complete API endpoint documentation
└── test-coverage-review.md      # Test coverage analysis
```

## Naming Conventions

| Convention | Example |
|------------|---------|
| Route files | `servers.$id.tsx` (dynamic segment: `$id`) |
| Route loaders | `beforeLoad` with `createServerFn` for SSR data |
| Feature components | `*-page.tsx` for top-level pages, `*-card.tsx`, `*-section.tsx` for sub-components |
| State files | `*-state.ts` for reducers/state machines |
| Test files | `*.test.ts` or `*.test.tsx`, co-located with source |
| Hooks | `use-*.ts` for custom hooks |
| Server modules | Domain-named: `servers.ts`, `providers.ts`, `telegram.ts` |
| Utilities | `lib/` directory in both `src/` and `server/` |
