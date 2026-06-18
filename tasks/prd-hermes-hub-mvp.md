> **Stacked PRs — merge in order:** [#48 `feat: introduce pino structured logger`](/pull/48) first, then [#47 `refactor: split large files, drop health_checks, add failure observability`](/pull/47). PR #47 adds `server/lib/handler-error-log.ts` which imports from `server/lib/logger.ts` shipped in #48 — merging them in the wrong order (or in parallel) breaks the build. PR #47's base is `feat/logger` (PR #48's branch), so the GitHub UI blocks the order; this note covers local merges, which GitHub can't catch.

# PRD: HermesHub MVP

## Introduction

HermesHub is a web application that enables non-technical users to deploy and manage a self-hosted Hermes AI Agent on a VPS without using the terminal, Docker, or Linux commands. Users connect a VPS, click install, add an AI provider API key, and start chatting with their personal AI agent through Telegram or the web dashboard.

The core promise: _"Your personal AI agent in 5 minutes — zero terminal required."_

## Goals

- Allow users to deploy Hermes Agent to a VPS in under 10 minutes with zero terminal usage
- ≥80% successful first-time deployments
- No SSH or Docker knowledge required from the user
- Support Ubuntu 22.04+ and Debian 12+
- Provide real-time install progress so users never stare at a blank screen
- Enable Telegram integration through a simple guided wizard
- Allow one-click update and restart of the running agent

## User Stories

### US-001: Project scaffolding

**Description:** As a developer, I want the TanStack Start project scaffolded with TailwindCSS, shadcn/ui, Drizzle ORM, Better Auth (magic link), and Hono API so I can start building features.

**Acceptance Criteria:**

- [ ] TanStack Start project boots with `npm run dev`
- [ ] TailwindCSS + shadcn/ui configured with a button component working
- [ ] Drizzle ORM connected to PostgreSQL with migration runner
- [ ] Better Auth configured with magic link only (no OAuth, no passwords)
- [ ] Hono API route returns 200 on `/api/health`
- [ ] Typecheck passes

### US-002: Magic link authentication

**Description:** As a user, I want to sign in with my email via a magic link so I don't need to remember another password.

**Acceptance Criteria:**

- [ ] Login page with email input field
- [ ] "Send magic link" button sends email with login link
- [ ] Clicking magic link authenticates and redirects to dashboard
- [ ] Unauthenticated users are redirected to login for any protected route
- [ ] Session persists across browser refresh
- [ ] Logout button works (clears session, redirects to login)
- [ ] Typecheck/lint passes
- [ ] Verify in browser using dev-browser skill

### US-003: Database schema (VPS, install, providers, audit)

**Description:** As a developer, I want the database schema defined for servers, installs, AI providers, Telegram config, and audit logs so all features have a data layer.

**Acceptance Criteria:**

- [ ] `servers` table: id, user_id, label, host, port, username, auth_method (password|key), encrypted_credential, store_credential (boolean), status, os_info, created_at, updated_at
- [ ] `installs` table: id, server_id, status (pending|installing|completed|failed), step, log, version, created_at, updated_at
- [ ] `ai_providers` table: id, user_id, provider (openai|anthropic|openrouter), encrypted_api_key, model, label, is_active, created_at
- [ ] `telegram_configs` table: id, user_id, bot_token, chat_id, is_active, created_at
- [ ] `audit_logs` table: id, user_id, action, details, ip_address, created_at
- [ ] Drizzle migration generates and runs cleanly
- [ ] Typecheck passes

### US-004: Dashboard shell

**Description:** As a user, I want a clean dashboard layout so I can see my agent's status and access all features.

**Acceptance Criteria:**

- [ ] Sidebar navigation with links: Dashboard, Servers, AI Provider, Telegram, Settings
- [ ] Active route highlighted in sidebar
- [ ] Header shows user email and logout button
- [ ] Main content area renders the active page
- [ ] Empty state when no server is connected ("Connect your first VPS to get started" with CTA button)
- [ ] Responsive layout works on desktop (1024px+)
- [ ] Typecheck/lint passes
- [ ] Verify in browser using dev-browser skill

### US-005: VPS connection wizard — UI

**Description:** As a user, I want a step-by-step wizard to enter my VPS connection details so I can connect my server.

**Acceptance Criteria:**

- [ ] Multi-step wizard: (1) Server label & host, (2) Authentication, (3) Review & Connect
- [ ] Step 1: server label (friendly name), host (IP/domain), port (default 22)
- [ ] Step 2: choose auth method (password or SSH key) with radio buttons, conditional input fields
- [ ] SSH key option: paste private key textarea
- [ ] Password option: password input
- [ ] Toggle: "Save credentials for future operations" (default: on)
- [ ] Step 3: summary of entered info, "Connect" button
- [ ] Back button available on steps 2-3
- [ ] Form validation: required fields, valid host format, valid port range
- [ ] Typecheck/lint passes
- [ ] Verify in browser using dev-browser skill

### US-006: VPS connection — backend & SSH verification

**Description:** As a system, I want to verify VPS access by SSHing in, checking OS compatibility, and returning server info so the user knows their server is ready.

**Acceptance Criteria:**

- [ ] POST `/api/servers/connect` endpoint receives connection details
- [ ] If `store_credential` is true, AES-256 encrypt credential before storing in `servers` table
- [ ] If `store_credential` is false, keep credential in memory for session, do not persist
- [ ] SSH into server with provided credentials using ssh2 or similar library
- [ ] Run `cat /etc/os-release` to detect OS and version
- [ ] Validate OS is Ubuntu 22.04+ or Debian 12+
- [ ] Return server info: host, os name, os version, architecture
- [ ] If SSH fails, return clear error message ("Could not connect: invalid credentials" or "Could not connect: host unreachable")
- [ ] If OS unsupported, return "Unsupported OS: [name]. Requires Ubuntu 22.04+ or Debian 12+"
- [ ] Server record created with status: connected on success
- [ ] Audit log entry created for connect attempt
- [ ] Typecheck/lint passes

### US-007: One-click Hermes install — backend

**Description:** As a system, I want to install Docker, Docker Compose, and Hermes on the connected VPS so the user has a running AI agent.

**Acceptance Criteria:**

- [ ] POST `/api/servers/:id/install` initiates the install workflow
- [ ] Install steps executed sequentially via SSH:
  - Install Docker if not present (`apt-get install docker.io`)
  - Install Docker Compose if not present
  - Create Hermes directory
  - Generate `docker-compose.yml` with environment configuration
  - Pull Hermes Docker image
  - Start containers via `docker compose up -d`
- [ ] Each step emits a progress event via SSE: `{ step: "installing_docker", progress: 25, message: "Installing Docker..." }`
- [ ] On any step failure: emit `{ step: "<failed_step>", status: "failed", error: "<message>" }` and stop
- [ ] Install record created with status tracking
- [ ] Retry: POST `/api/servers/:id/install` resets failed install and starts from step 1
- [ ] All credentials retrieved from DB (if stored) or passed from session
- [ ] Audit log entry for install start, success, and failure
- [ ] Typecheck/lint passes

### US-008: Install progress UI

**Description:** As a user, I want to see real-time install progress with a progress bar and live logs so I know what's happening.

**Acceptance Criteria:**

- [ ] After clicking "Install", navigate to install progress page
- [ ] Progress bar advances per step (25% increments: Docker, Docker Compose, Config, Start)
- [ ] Live log pane streams step messages with timestamps
- [ ] On completion: green success banner with "Your Hermes agent is live!" and "Go to Dashboard" button
- [ ] On failure: red error banner with error message and "Retry Install" button
- [ ] Loading spinner during install
- [ ] User can leave page and return — install continues in background, status shown on dashboard
- [ ] Typecheck/lint passes
- [ ] Verify in browser using dev-browser skill

### US-009: AI provider setup

**Description:** As a user, I want to select my AI provider, paste my API key, and choose a model so my agent can respond to messages.

**Acceptance Criteria:**

- [ ] "AI Provider" page accessible from sidebar
- [ ] Provider selection: OpenAI, Anthropic, OpenRouter (radio/select)
- [ ] API key input (masked, paste-friendly)
- [ ] Model dropdown populated based on provider:
  - OpenAI: gpt-4o (default), gpt-4o-mini, gpt-4-turbo
  - Anthropic: claude-sonnet-4-20250514 (default), claude-haiku-3-5
  - OpenRouter: custom model selector with text input
- [ ] Recommended default model pre-selected per provider
- [ ] "Save" button stores encrypted API key via POST `/api/providers`
- [ ] "Test Connection" button verifies key works (calls provider's models list or a lightweight endpoint)
- [ ] Success state: green checkmark with "Provider connected"
- [ ] Error state: red message with "Invalid API key" or "Connection failed"
- [ ] Edit flow: existing keys masked (show only last 4 chars), can replace
- [ ] Typecheck/lint passes
- [ ] Verify in browser using dev-browser skill

### US-010: Telegram integration wizard

**Description:** As a user, I want to connect my Telegram bot so I can chat with my Hermes agent from Telegram.

**Acceptance Criteria:**

- [ ] "Telegram" page accessible from sidebar
- [ ] Step 1: Instructions to create a bot via BotFather and get the token
- [ ] Step 2: Bot token input field (masked)
- [ ] "Connect" button sends POST `/api/telegram/connect` with token
- [ ] Backend validates token by calling `getMe` on Telegram API
- [ ] On success: green banner "Telegram bot connected! Send /start to your bot to begin."
- [ ] On failure: clear error message
- [ ] Connected state shows bot username and disconnect button
- [ ] Disconnect sends POST `/api/telegram/disconnect`
- [ ] Audit log entry for connect and disconnect
- [ ] Typecheck/lint passes
- [ ] Verify in browser using dev-browser skill

### US-011: Dashboard status display

**Description:** As a user, I want my dashboard to show my agent's online/offline status, VPS health, and AI provider status at a glance.

**Acceptance Criteria:**

- [ ] Dashboard is the home page after login
- [ ] Agent status card: green "Online" or red "Offline" with last-checked timestamp
- [ ] VPS health card: CPU usage %, memory usage %, disk usage % (fetched via SSH)
- [ ] AI provider card: provider name, model, status (Connected / Disconnected)
- [ ] Telegram card: bot username, status (Connected / Disconnected)
- [ ] Data refreshes every 30 seconds via polling
- [ ] Cards show loading skeleton while fetching
- [ ] Error state for any card: "Unable to fetch" with retry button
- [ ] Empty state when no server connected: prompt to connect first VPS
- [ ] Typecheck/lint passes
- [ ] Verify in browser using dev-browser skill

### US-012: Update & restart controls

**Description:** As a user, I want to update my Hermes agent or restart it with one click so I can keep it running smoothly.

**Acceptance Criteria:**

- [ ] Settings/Server detail page shows server status and action buttons
- [ ] "Restart Agent" button: SSH `docker compose restart`, shows spinner during, success/error result
- [ ] "Update Hermes" button: SSH `docker compose pull && docker compose up -d`, shows progress during, success/error result
- [ ] "Rollback" button: SSH re-pulls previous Docker image tag, success/error result
- [ ] Confirmation dialog before each action: "Are you sure you want to [action]?"
- [ ] Action history section below buttons showing last 5 actions with timestamp and result
- [ ] Error handling: if SSH fails, show "Action failed: [reason]" with retry option
- [ ] Audit log entry for each action
- [ ] Typecheck/lint passes
- [ ] Verify in browser using dev-browser skill

### US-013: Install & action logs viewer

**Description:** As a user, I want to view the install logs and action history so I can debug or understand what happened.

**Acceptance Criteria:**

- [ ] Logs page accessible from sidebar
- [ ] Shows install log (if install was run) with timestamps and step labels
- [ ] Shows action history (restart, update, rollback) with timestamps and results
- [ ] Logs are read-only, displayed in a monospace scrolling container
- [ ] "Copy logs" button copies all log text to clipboard
- [ ] "Clear logs" button (with confirmation) clears display logs
- [ ] Empty state: "No logs yet. Logs will appear here after your first install or action."
- [ ] Typecheck/lint passes
- [ ] Verify in browser using dev-browser skill

## Functional Requirements

- FR-1: The system must authenticate users via email magic link only (Better Auth)
- FR-2: The system must allow users to connect a VPS by entering host, port, username, and password or SSH key
- FR-3: The system must encrypt SSH credentials with AES-256 before storing in the database when `store_credential` is true
- FR-4: The system must support ephemeral credentials (not stored) when `store_credential` is false
- FR-5: The system must verify VPS connectivity via SSH before creating a server record
- FR-6: The system must validate the VPS OS is Ubuntu 22.04+ or Debian 12+
- FR-7: The system must install Docker, Docker Compose, and Hermes on the VPS via automated SSH commands
- FR-8: The system must emit real-time install progress via SSE events
- FR-9: The system must allow retrying a failed install from the beginning
- FR-10: The system must support configuring AI providers: OpenAI, Anthropic, OpenRouter
- FR-11: The system must encrypt AI provider API keys with AES-256 before storing
- FR-12: The system must validate Telegram bot tokens against the Telegram API before saving
- FR-13: The system must display agent online/offline status on the dashboard
- FR-14: The system must fetch and display VPS CPU, memory, and disk usage
- FR-15: The system must support one-click restart, update, and rollback of the agent
- FR-16: The system must show a confirmation dialog before executing destructive actions (restart, update, rollback)
- FR-17: The system must log all significant actions (connect, install, update, restart, rollback, disconnect) to the audit log
- FR-18: The system must only allow HTTPS connections in production

## Non-Goals

- No multi-agent orchestration or management
- No workflow builder or custom agent behaviors
- No native mobile app (responsive web only)
- No marketplace or plugin system
- No billing, subscriptions, or payment processing
- No managed hosting (user provides their own VPS)
- No multi-user or team collaboration per server
- No Windows VPS support (Ubuntu/Debian only)
- No automatic updates or scheduled maintenance
- No backup/restore functionality for agent data
- No custom domain configuration for the Hermes web interface

## Design Considerations

- Use shadcn/ui components throughout for consistent look and feel
- Wizard pattern: step indicator at top (1-2-3-4), content in middle, back/next buttons at bottom
- Progress bar for install with animated fill and step labels
- Color coding: green for success/online, red for error/offline, yellow for warning/pending
- Dashboard cards in a 2x2 grid on desktop, stacked on mobile
- Empty states with illustration + CTA button for all list pages
- Toast notifications for action results (success/error)
- Skeleton loading states for all data-fetching components
- Confirmation dialogs use shadcn AlertDialog component

## Technical Considerations

- **Auth:** Better Auth with magic link only. Resend email template for magic link emails.
- **Database:** PostgreSQL with Drizzle ORM. Encrypted columns using `pgcrypto` or application-level AES-256.
- **SSH:** Use `node-ssh` or `ssh2` library for SSH connections. Connection pooling for repeated operations.
- **SSE:** Use Hono's SSE helper for real-time install progress. Client connects to `/api/servers/:id/install/events`.
- **Encryption:** AES-256-GCM for credential encryption. Encryption key stored as environment variable `ENCRYPTION_KEY`.
- **Session state for ephemeral creds:** Store in an in-memory Map keyed by server ID + session ID. Lost on server restart — user re-enters creds.
- **Rate limiting:** Apply rate limiting on magic link email sending (max 3 per 5 minutes per email).
- **File structure:**
  - `app/` — TanStack Start routes and components
  - `app/components/` — shared UI components
  - `app/routes/` — page routes
  - `server/` — Hono API routes
  - `server/db/` — Drizzle schema and migrations
  - `server/ssh/` — SSH connection and command execution utilities
  - `server/install/` — Hermes install orchestration
  - `server/services/` — business logic (providers, telegram, etc.)
- **Deployment:** Cloudflare for frontend, VPS for backend + PostgreSQL, or all-in-one VPS for MVP simplicity.

## Success Metrics

| Metric                                  | Target                             |
| --------------------------------------- | ---------------------------------- |
| Deployment success rate (first attempt) | >80%                               |
| Average setup time (signup to chatting) | <10 minutes                        |
| Telegram activation rate                | >60% of users who complete install |
| 7-day retention                         | >40% of users                      |
| Dashboard page load time                | <2 seconds                         |
| Install SSE latency (event to display)  | <500ms                             |

## Open Questions

- Should we support password-based sudo for VPS users who aren't root?
- Should the Telegram bot webhook be configured automatically, or does the user need to set it up via BotFather?
- What's the rollback strategy for Hermes versions — tag-based or keep N previous images?
- Should we auto-detect the VPS's public IP and pre-fill the host field?
- For ephemeral credentials, how long should the in-memory session last before requiring re-entry?
- Should we offer a self-contained all-in-one deployment option (backend + DB on same VPS as Hermes) for the MVP?
