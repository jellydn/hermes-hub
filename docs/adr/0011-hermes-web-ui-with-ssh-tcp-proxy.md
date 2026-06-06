# 11. Hermes Web UI with SSH TCP Proxy

Date: 2026-06-06

## Status

Accepted

## Context

HermesHub needed to expose the Hermes Web UI (a browser-based chat and session interface for the Hermes agent) to users without requiring them to open firewall ports, manage TLS certificates, or set up SSH tunnels manually. The Web UI runs as a Docker container on the user's VPS, binding only to `127.0.0.1`. HermesHub needed a way to route authenticated browser traffic from the HermesHub web app through to that container, while:

- Preserving the Web UI's own auth (cookie-based session with a password)
- Preventing CSRF attacks from unrelated origins
- Rewriting redirects and cookie paths so the Web UI correctly operates under HermesHub's URL namespace
- Supporting any HTTP method (GET, POST, form submissions, etc.)
- Avoiding the need for WebSocket support (the Web UI uses polling, not WebSockets)

## Decision

HermesHub proxies all Web UI traffic through an **SSH TCP forward tunnel** (`ssh2` `forwardOut`), using HermesHub's existing pooled SSH connections.

The architecture has five layers:

### 1. Dynamic Compose Generation (`server/compose.ts`)

The Web UI service is not a standalone Docker Compose file — it is injected into the existing Hermes compose configuration at deploy time. `buildHermesComposeContent()` dynamically adds a `hermes-webui` service scoped with `--no-deps` so only the Web UI container is affected. The service binds `127.0.0.1:<port>:<port>`, mounts the Hermes agent source as a read-only volume, and receives environment variables for the password, port, allowed origins, and trusted proxy headers.

On redeploy, the Web UI container is **force-recreated** (`--force-recreate`) to ensure a clean state regardless of whether the image or configuration changed.

Deployment is dispatched through `server/managed-compose-deploy.ts` with the `web-ui` intent, which also handles the SSH workspace sync (copying Hermes agent source to the host) and reachability verification.

### 2. SSH TCP Forward Tunnel (`server/web-ui/ssh-forward.ts`)

Each proxy request opens a TCP forward stream through the existing SSH connection:

```
Browser → HermesHub (HTTPS) → SSH forwardOut → 127.0.0.1:<webUiPort> on VPS
```

SSH connections are pooled and reused across proxy requests (see ADR #9 for the SSH pool design). The TCP forward stream is scoped to a single HTTP request/response cycle and closed after use.

### 3. HTTP-over-Stream Proxy (`server/web-ui/proxy-http.ts`)

The raw TCP stream is presented to Node's `http.request()` as the connection, so HermesHub acts as an HTTP proxy without parsing the raw bytes. The proxy:

- **Strips hop-by-hop headers** (`Connection`, `Transfer-Encoding`, `Upgrade`, etc.) from both directions
- **Rewrites `Location` headers** — upstream redirects like `/login` become `/api/servers/:id/web-ui/proxy/login`, and absolute redirects to the upstream origin are rewritten to the proxy path
- **Rewrites `Set-Cookie` `Path` attributes** — upstream `Path=/` becomes `Path=/api/servers/:id/web-ui/proxy/` so the Web UI's session cookie is scoped to the proxy path
- **Forwards trusted proxy headers** — `X-Forwarded-Host`, `X-Forwarded-Proto`, and `X-Forwarded-For` are sent to the upstream so the Web UI can construct correct absolute URLs
- **Rejects WebSocket upgrades** — the Web UI does not need WebSocket support; the proxy returns a clear error if an upgrade is attempted

### 4. CSRF Protection via Allowed Origins

The Docker Compose configuration sets `HERMES_WEBUI_ALLOWED_ORIGINS` to HermesHub's public origin (e.g., `https://hermes-hub.example.com`). The Web UI container uses this to validate the `Origin` header on state-changing requests. This is the only mechanism HermesHub uses to prevent CSRF — there is no token-based CSRF because the Web UI is a separate application with its own cookie-based auth.

The Web UI container is also configured with `HERMES_WEBUI_TRUST_FORWARDED_HOST=1` and `HERMES_WEBUI_TRUST_FORWARDED_PROTO=1` so it trusts the forwarded headers from HermesHub's authenticated reverse proxy.

### 5. Authentication Guard

The proxy endpoint (`/api/servers/:id/web-ui/proxy/*`) is guarded by `requireEnabledWebUi`, which performs:

1. HermesHub session authentication, server ownership verification, and SSH credential resolution (all performed by `requireOwnedServerSsh`)
2. Web UI enabled check (the Web UI must have been deployed and not in a failed state)

Only after both checks pass is the proxy request forwarded.

### 6. Async Deploy with Polling

Deploying the Web UI is an async operation (SSH + Docker Compose can take 30+ seconds). `server/web-ui/deploy.ts` owns orchestration: install preconditions, deploy lock acquisition, `deploying` state persistence, and background `deployManagedCompose` execution. `server/web-ui/handlers.ts` is HTTP-only — it calls `startDeploy` and maps `DeployError` to status codes.

The deploy endpoint returns HTTP 202 with the initial `deploying` status. The client polls `/api/servers/:id/web-ui` until the status transitions to `succeeded` or `failed`. A deploy lock (keyed by server ID) prevents concurrent deploys on the same server within a single HermesHub instance. Stale `deploying` records past `STALE_DEPLOY_THRESHOLD_MS` are resolved to `failed` on read via `resolveServerWebUiRecord` in `server/web-ui/records.ts`.

### 7. Password & Port Management

- A random 18-byte (24-character `base64url`) password is generated for the Web UI
- The password is encrypted with AES-256-GCM (reusing the encryption from `server/crypto.ts`, see ADR #5) and stored in the `server_web_ui` table
- The password is also written to the Docker Compose environment (`HERMES_WEBUI_PASSWORD`) so the container can validate logins
- The Web UI port defaults to `8787` and is configurable
- Users can reveal the decrypted password from the HermesHub UI

### 8. Reachability Verification

After `docker compose up`, HermesHub verifies the Web UI is healthy:

- **Container running check** — polls `docker ps` for the `hermes-webui` container (up to 60 attempts, 5-second intervals = 5-minute timeout)
- **HTTP probe** — `curl` to `http://127.0.0.1:<port>/login` to verify the HTTP server is accepting connections
- **`hermes_cli` import verification** — runs `docker exec hermes-webui python -c "import hermes_cli"` to verify the Python environment is intact

If the container stops during startup, the last 80 lines of container logs and the container state are captured in the error message.

### 9. Stale Deploy Detection

If a deploy is stuck in `deploying` status past the `STALE_DEPLOY_THRESHOLD_MS` threshold (configurable via env var, default 10 minutes), the status is automatically resolved to `failed` on next read.

## Consequences

### Positive

- Users can access the Web UI by clicking "Open Web UI" in HermesHub — no SSH tunnels, port forwarding, or TLS setup required
- The Web UI container never exposes a public port; it binds only to `127.0.0.1` and is reachable exclusively through the SSH tunnel
- HermesHub session auth protects the proxy; only the server owner can access the Web UI
- The Web UI's own password-based auth still applies, providing defense in depth
- Cookie path rewriting ensures the Web UI's session cookie works correctly under HermesHub's nested URL namespace
- Async deploy with polling means the UI stays responsive during the 30–300 second deploy window
- Reachability checks catch container startup failures and surface diagnostic information (container state, logs, Python import errors)
- Forced container recreation on redeploy ensures a clean state
- The SSH pool is invalidated before each Web UI deploy (via `invalidatePooledSsh` in the deploy handler), forcing a fresh SSH connection after container recreation — this trades a brief connection overhead for guaranteed correctness

### Negative

- Every HTTP request to the Web UI requires a full SSH round-trip through the proxy, adding latency proportional to network distance to the VPS
- The SSH TCP forward stream is per-request, not a persistent tunnel — connection setup overhead on each request
- WebSocket connections are not supported; the Web UI must use polling for real-time features
- Cookie path rewriting relies on substring matching of `Path=` in `Set-Cookie` headers, which is fragile against unusual cookie attribute formats
- The proxy is tightly coupled to `ssh2`'s `forwardOut` API — switching SSH libraries would require rewriting the tunnel layer
- Container diagnostics capture up to 2000 characters of logs/state, which may truncate long multi-line error messages
- `hermes_cli` import verification is tied to the specific virtualenv path (`/app/venv/bin/python`) inside the hermes-webui container image
