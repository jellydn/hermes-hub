# HermesHub API Reference

Base path: `/api`

All endpoints except `/api/health` require authentication via Better Auth session cookie.

---

## Authentication

Better Auth is mounted at `/api/auth/*`. The following routes proxy to Better Auth's built-in magic-link flow.

### POST `/api/auth/send-magic-link`

Sends a magic-link email to the given address. Requires `DATABASE_URL` to be configured.

**Request body:**

```json
{
  "email": "user@example.com"
}
```

**Response (200):**

```json
{
  "status": true
}
```

**Response (503 — DATABASE_URL not configured):**

```json
{
  "error": "DATABASE_URL is required"
}
```

### GET `/api/auth/verify-magic-link`

Verifies a magic-link token. Delegates to Better Auth's `/api/auth/magic-link/verify`.

**Query parameters:**

- `token` — the magic link token
- `email` — the user's email

### GET `/api/auth/callback`

Callback handler for magic-link verification. Also delegates to Better Auth's `/api/auth/magic-link/verify`.

### GET | POST `/api/auth/*`

Catch-all proxy for any other Better Auth routes (session, user management, etc.).

**Response (503 — DATABASE_URL not configured):**

```json
{
  "error": "DATABASE_URL is required"
}
```

---

## Health

### GET `/api/health`

Returns the health status of the server and database connection. No auth required.

**Response (200 — database connected):**

```json
{
  "status": "ok",
  "database": "connected",
  "timestamp": "2026-05-26T12:00:00.000Z"
}
```

**Response (200 — database disconnected):**

```json
{
  "status": "degraded",
  "database": "disconnected",
  "error": "<error message>",
  "timestamp": "2026-05-26T12:00:00.000Z"
}
```

---

## Servers

### POST `/api/servers/connect`

Connects to a VPS, verifies SSH access and OS compatibility, and creates a server record.

**Auth required:** Yes

**Request body:**

```json
{
  "label": "My VPS",
  "host": "192.168.1.100",
  "port": 22,
  "username": "root",
  "authMethod": "password",
  "password": "s3cret",
  "storeCredential": true
}
```

**Fields:**

| Field             | Type    | Description                                                  |
| ----------------- | ------- | ------------------------------------------------------------ |
| `label`           | string  | Friendly name for the server                                 |
| `host`            | string  | IP address or domain name                                    |
| `port`            | integer | SSH port (1–65535)                                           |
| `username`        | string  | SSH username                                                 |
| `authMethod`      | string  | `"password"` or `"ssh-key"`                                  |
| `password`        | string  | Required if `authMethod` is `"password"`                     |
| `privateKey`      | string  | Required if `authMethod` is `"ssh-key"` (PEM-encoded key)    |
| `storeCredential` | boolean | If true, encrypts credential in DB; if false, in-memory only |

**Response (201):**

```json
{
  "server": {
    "id": "uuid",
    "label": "My VPS",
    "host": "192.168.1.100",
    "port": 22,
    "username": "root",
    "status": "connected",
    "osInfo": {
      "name": "Ubuntu 24.04 LTS",
      "version": "24.04",
      "architecture": "x86_64",
      "raw": { ... }
    }
  },
  "verification": {
    "host": "192.168.1.100",
    "osName": "Ubuntu 24.04 LTS",
    "osVersion": "24.04",
    "architecture": "x86_64"
  }
}
```

**Error responses:**

| Status | Condition                                                      |
| ------ | -------------------------------------------------------------- |
| 400    | Invalid JSON body                                              |
| 400    | Missing required fields                                        |
| 400    | Invalid port range                                             |
| 400    | Unsupported auth method                                        |
| 400    | SSH connection failed / host unreachable / invalid credentials |
| 400    | Unsupported OS (requires Ubuntu 22.04+ or Debian 12+)          |
| 401    | Unauthorized                                                   |
| 500    | Failed to save server connection                               |

---

### GET `/api/servers/:id`

Returns a detailed snapshot of a server, including its install status and action history.

**Auth required:** Yes

**Response (200):**

```json
{
  "serverDetail": {
    "server": {
      "id": "uuid",
      "label": "My VPS",
      "host": "192.168.1.100",
      "port": 22,
      "username": "root",
      "authMethod": "password",
      "status": "connected",
      "osName": "Ubuntu 24.04 LTS",
      "osVersion": "24.04",
      "architecture": "x86_64"
    },
    "install": {
      "status": "succeeded",
      "version": "latest",
      "updatedAt": "2026-05-26T12:00:00.000Z"
    },
    "actionHistory": [
      {
        "id": "uuid",
        "action": "restart",
        "result": "succeeded",
        "createdAt": "2026-05-26T12:00:00.000Z",
        "message": "Restarted Hermes successfully.",
        "imageRef": null
      }
    ],
    "rollbackTarget": null,
    "webUi": {
      "enabled": true,
      "port": 8787,
      "proxyPath": "/api/servers/uuid/web-ui/proxy/",
      "deployStatus": "succeeded",
      "deployError": null,
      "deployStartedAt": "2026-05-26T11:59:00.000Z",
      "updatedAt": "2026-05-26T12:00:00.000Z"
    }
  }
}
```

`webUi` is `null` when the Hermes Web UI has not been deployed on this server.

**Error responses:**

| Status | Condition         |
| ------ | ----------------- |
| 400    | Server ID missing |
| 401    | Unauthorized      |
| 404    | Server not found  |

---

### POST `/api/servers/:id/install`

Initiates a Hermes install workflow on the connected server. Runs install steps sequentially via SSH:

1. Install Docker
2. Install Docker Compose
3. Create Hermes workspace directory
4. Write `docker-compose.yml`
5. Pull Hermes Docker image
6. Start containers

Returns immediately with status `202`; progress is streamed via SSE (see below). Only one install can run per server at a time.

**Auth required:** Yes

**Response (202 — accepted):**

```json
{
  "install": {
    "id": "uuid",
    "serverId": "uuid",
    "status": "pending",
    "step": "install-docker"
  }
}
```

**Error responses:**

| Status | Condition                                   |
| ------ | ------------------------------------------- |
| 400    | Server ID missing / unsupported auth method |
| 400    | Install credential unavailable / expired    |
| 401    | Unauthorized                                |
| 404    | Server not found                            |
| 409    | Install already in progress                 |

---

### GET `/api/servers/:id/install/events`

Server-Sent Events (SSE) stream for real-time install progress. Replaying clients receive past events first, then listen for new ones.

**Auth required:** Yes

**Response (SSE stream):**

Content-Type: `text/event-stream`

```
event: install-progress
data: {
  "installId": "uuid",
  "serverId": "uuid",
  "step": "install-docker",
  "progress": 15,
  "message": "Installing Docker",
  "status": "running",
  "timestamp": "2026-05-26T12:00:00.000Z"
}
```

**Install steps and progress:**

| Step                      | Progress | Description                |
| ------------------------- | -------- | -------------------------- |
| `install-docker`          | 15%      | Installing Docker          |
| `install-compose`         | 30%      | Installing Docker Compose  |
| `create-hermes-directory` | 45%      | Creating Hermes workspace  |
| `write-compose-file`      | 60%      | Writing docker-compose.yml |
| `pull-image`              | 80%      | Pulling Hermes image       |
| `start-containers`        | 100%     | Starting Hermes containers |

**Terminal events:**

```json
// On success
{
  "step": "start-containers",
  "progress": 100,
  "message": "Starting Hermes containers: ...",
  "status": "succeeded"
}

// On failure
{
  "step": "install-docker",
  "progress": 100,
  "message": "Install failed",
  "status": "failed",
  "error": "Command failed: <step>"
}
```

**Error responses:**

| Status | Condition         |
| ------ | ----------------- |
| 400    | Server ID missing |
| 401    | Unauthorized      |
| 404    | Server not found  |

---

### POST `/api/servers/:id/actions`

Runs a destructive action (restart, update, or rollback) on the Hermes agent.

**Auth required:** Yes

**Request body:**

```json
{
  "action": "restart",
  "targetVersion": "v1.0.0"
}
```

**Fields:**

| Field           | Type   | Description                                                                 |
| --------------- | ------ | --------------------------------------------------------------------------- |
| `action`        | string | `"restart"`, `"update"`, or `"rollback"`                                    |
| `targetVersion` | string | Optional for `update` (a sha256 digest or an image tag); required for `rollback` (defaults to previous install version then `"latest"`) |

**Commands executed:**

| Action   | SSH Command                                                                                  |
| -------- | -------------------------------------------------------------------------------------------- |
| restart  | `cd ~/hermes && sudo docker compose restart hermes`                                          |
| update   | `cd ~/hermes && sudo docker compose pull && sudo docker compose up -d`                       |
| rollback | Pulls `ghcr.io/hermes-agent/hermes:<tag>`, updates compose file, runs `docker compose up -d` |

**Response (200 — succeeded):**

```json
{
  "status": "succeeded",
  "action": "restart",
  "message": "Restarted Hermes successfully.",
  "imageRef": null
}
```

**Response (400 — failed):**

```json
{
  "error": "Action failed: <error message>"
}
```

**Error responses:**

| Status | Condition                    |
| ------ | ---------------------------- |
| 400    | Invalid JSON body            |
| 400    | Invalid action type          |
| 400    | Unsupported auth method      |
| 400    | Credential expired / missing |
| 400    | SSH action failed            |
| 401    | Unauthorized                 |
| 404    | Server not found             |

For `update`, the response's `imageRef` records the image reference the remote actually pulled (default `"latest"` when no `targetVersion` is given).

---

### GET `/api/servers/:id/hermes-update-info`

Returns the currently running Hermes image, the latest published image, and the latest GitHub release — powering the version/changelog display and the **Update Hermes** button on the server detail page. Each lookup degrades to `null` independently, so a single failure does not break the response.

**Auth required:** Yes (same ownership/SSH guards as other server routes)

**Response (200):**

```json
{
  "current": {
    "image": "nousresearch/hermes-agent@sha256:...",
    "imageId": "sha256:...",
    "repoDigests": ["sha256:..."]
  },
  "latest": {
    "tag": "v1.0.0",
    "digest": "sha256:...",
    "pushedAt": "2026-08-01T00:00:00Z"
  },
  "release": {
    "tagName": "v1.0.0",
    "name": "Hermes v1.0.0",
    "publishedAt": "2026-08-01T00:00:00Z",
    "body": "Release notes...",
    "htmlUrl": "https://github.com/..."
  },
  "updateAvailable": true
}
```

**Fields:**

| Field             | Type    | Description                                                            |
| ----------------- | ------- | ---------------------------------------------------------------------- |
| `current`         | object? | Running image ref from `docker inspect` on the server (or `null`)      |
| `latest`          | object? | Latest published image ref + manifest digest from the registry          |
| `release`         | object? | Latest GitHub release (tag, title, notes, published date, URL)          |
| `updateAvailable` | boolean | True when the running digest differs from the latest manifest digest    |

**Error responses:**

| Status | Condition                                                         |
| ------ | ----------------------------------------------------------------- |
| 400    | SSH or registry/release lookup failed (body `{ "error": "..." }`) |
| 401    | Unauthorized                                                      |
| 404    | Server not found                                                  |

---

### POST `/api/servers/:id/health-check`

Runs a manual **VPS setup check** on the connected server. HermesHub connects over SSH (read-only diagnostics), verifies that the VPS has enough resources and that the Hermes install harness is in place, and returns grouped results with plain-language guidance. Results are not persisted — only audit log entries are written.

Use this from the server detail page (**Check setup**) when you need to confirm Docker, the `~/hermes` workspace, and the running Hermes agent without interpreting security hardening settings.

**Auth required:** Yes (HTTPS enforced in production)

**Request body:** None

**Response (200):**

```json
{
  "healthCheck": {
    "status": "warning",
    "checkedAt": "2026-06-06T12:00:00.000Z",
    "groups": [
      {
        "label": "Server resources",
        "items": [
          {
            "label": "Server uptime",
            "status": "healthy",
            "detail": "up 2 days, 3 hours"
          },
          {
            "label": "CPU",
            "status": "healthy",
            "detail": "24% in use. This server has enough cpu for Hermes right now."
          },
          {
            "label": "Memory",
            "status": "warning",
            "detail": "88% in use. Hermes may run slower until memory usage comes down."
          },
          {
            "label": "Disk space",
            "status": "healthy",
            "detail": "55% in use. This server has enough disk space for Hermes right now."
          }
        ]
      },
      {
        "label": "Hermes setup",
        "items": [
          {
            "label": "Docker installed",
            "status": "healthy",
            "detail": "Docker is installed on this VPS."
          },
          {
            "label": "Docker running",
            "status": "healthy",
            "detail": "Docker is running and ready for Hermes containers."
          },
          {
            "label": "Docker Compose ready",
            "status": "healthy",
            "detail": "Docker Compose is available for managing Hermes."
          },
          {
            "label": "Hermes folder",
            "status": "healthy",
            "detail": "The ~/hermes workspace folder is present."
          },
          {
            "label": "Hermes configuration",
            "status": "healthy",
            "detail": "docker-compose.yml is present in ~/hermes."
          },
          {
            "label": "Hermes agent running",
            "status": "healthy",
            "detail": "The Hermes agent container is running on this VPS."
          },
          {
            "label": "Hermes agent responding",
            "status": "healthy",
            "detail": "The Hermes agent is responding on this VPS."
          }
        ]
      }
    ]
  }
}
```

**Overall and per-item status values:** `"healthy"`, `"warning"`, or `"critical"`. The overall status is the most severe item status in the result.

**Resource thresholds:** CPU, memory, and disk usage use the same thresholds as the dashboard VPS card — warning at ≥85%, critical at ≥95%.

**Hermes setup checks:**

| Item                    | What it verifies                                               |
| ----------------------- | -------------------------------------------------------------- |
| Docker installed        | `docker` CLI is available                                      |
| Docker running          | `sudo docker info` succeeds                                    |
| Docker Compose ready    | `sudo docker compose version` succeeds                         |
| Hermes folder           | `~/hermes` directory exists                                    |
| Hermes configuration    | `~/hermes/docker-compose.yml` exists                           |
| Hermes agent running    | Hermes container is running                                    |
| Hermes agent responding | Gateway responds on localhost (only when container is running) |

**Audit log events:** `server.health_check.started`, `server.health_check.succeeded`, `server.health_check.failed`

**Error responses:**

| Status | Condition                                               |
| ------ | ------------------------------------------------------- |
| 400    | Server ID missing / credential unavailable / SSH failed |
| 401    | Unauthorized                                            |
| 404    | Server not found                                        |

**Response (400 — SSH or remote check failed):**

```json
{
  "error": "Setup check failed: Host key mismatch"
}
```

---

### POST `/api/servers/:id/host-key/accept`

Accepts a new host key fingerprint for a server. Use this when a deploy or action returns a 409 host key error — trust the observed fingerprint to store it as the new pin, then retry the operation.

**Auth required:** Yes (HTTPS enforced in production)

**Request body:**

```json
{
  "fingerprint": "SHA256:abc123def456",
  "algorithm": "ssh-ed25519"
}
```

**Fields:**

| Field         | Type   | Description                                           |
| ------------- | ------ | ----------------------------------------------------- |
| `fingerprint` | string | Required. SHA256-prefixed host key fingerprint.       |
| `algorithm`   | string | Optional. Algorithm of the host key (e.g. `ssh-ed25519`). |

**Response (200):**

```json
{
  "ok": true,
  "fingerprint": "SHA256:abc123def456"
}
```

**Error responses:**

| Status | Condition                   |
| ------ | --------------------------- |
| 400    | Invalid JSON body           |
| 400    | Missing or invalid fingerprint (must be `SHA256:`-prefixed) |
| 401    | Unauthorized                |
| 404    | Server not found            |

---

### Host Key Recovery Flow

When a deploy or switch endpoint connects to a server via SSH and encounters a host key error, it returns a **409** with a structured recovery payload instead of a generic 502. The client surfaces a trust panel so the user can accept the observed fingerprint and retry.

**409 response shape:**

```json
{
  "code": "host_key_missing",
  "error": "Host key fingerprint not stored for this server. Trust the host key and retry.",
  "serverId": "uuid",
  "serverHost": "192.168.1.100",
  "hostKey": {
    "observedFingerprint": "SHA256:abc123def456",
    "observedAlgorithm": "ssh-ed25519"
  }
}
```

**Error codes:**

| Code               | Meaning                                                |
| ------------------ | ------------------------------------------------------ |
| `host_key_missing` | No host key fingerprint is stored for this server.     |
| `host_key_mismatch`| The observed fingerprint doesn't match the stored pin. |

When `code` is `host_key_mismatch`, the `hostKey` object also includes `expectedFingerprint` (the previously stored pin).

**Recovery flow:**

1. Client receives 409 → displays `HostKeyTrustPanel` showing the observed fingerprint and algorithm
2. User reviews the fingerprint and clicks "Trust host key and retry"
3. Client calls `POST /api/servers/:id/host-key/accept` with the observed fingerprint
4. On success, the original operation is retried automatically

**Endpoints that return 409 for host key errors:**

| Endpoint                              | Covered by                           |
| ------------------------------------- | ------------------------------------ |
| `POST /api/telegram/deploy`           | Direct host key catch                |
| `POST /api/telegram/test`             | Direct host key catch                |
| `POST /api/telegram/model-switch`     | Direct host key catch                |
| `POST /api/providers/deploy`          | Direct host key catch                |
| `POST /api/settings/persona/deploy`   | Via `deployToHermesAgent`            |
| `POST /api/settings/mcp-servers/deploy` | Via `deployToHermesAgent`         |
| `POST /api/settings/agent-skills/deploy` | Via `deployToHermesAgent`         |
| `POST /api/servers/:id/web-ui/deploy` | Via `deployToHermesAgent`            |

---

## Dashboard

### GET `/api/dashboard/status`

Returns an aggregated status snapshot of the user's Hermes setup, including server, agent, VPS metrics, AI provider, and Telegram status. VPS health metrics (CPU, memory, disk) are fetched live over SSH.

**Auth required:** Yes

**Response (200):**

```json
{
  "dashboard": {
    "generatedAt": "2026-05-26T12:00:00.000Z",
    "server": {
      "id": "uuid",
      "label": "My VPS",
      "host": "192.168.1.100",
      "status": "connected",
      "osName": "Ubuntu 24.04 LTS",
      "osVersion": "24.04"
    },
    "agent": {
      "status": "online",
      "updatedAt": "2026-05-26T12:00:00.000Z",
      "detail": "Hermes finished installing successfully on the connected VPS."
    },
    "vps": {
      "status": "healthy",
      "updatedAt": "2026-05-26T12:00:00.000Z",
      "cpu": 23,
      "memory": 45,
      "disk": 12,
      "uptime": "up 3 hours",
      "detail": "The connected VPS is responding to live health checks.",
      "error": null
    },
    "provider": {
      "status": "connected",
      "provider": "openai",
      "model": "gpt-4o-mini",
      "detail": "OpenAI is ready to power Hermes responses."
    },
    "telegram": {
      "status": "connected",
      "botUsername": "my_hermes_bot",
      "detail": "@my_hermes_bot is ready for chat delivery."
    }
  }
}
```

**VPS status values:** `"healthy"` (all resources <85%), `"warning"` (any resource ≥85%), `"disconnected"` (no server), `"error"` (metrics fetch failed).

**Agent status values:** `"online"` (install succeeded + server connected), `"offline"` (everything else — no install, running, failed, or no server).

---

## Logs

### GET `/api/logs`

Returns aggregated install logs and action history for the authenticated user.

**Auth required:** Yes

**Action field values:**

| Value          | Description                    |
| -------------- | ------------------------------ |
| `restart`      | Hermes agent restart           |
| `update`       | Hermes version update          |
| `rollback`     | Hermes version rollback        |
| `mcp`          | MCP server deployment          |
| `agent_skills` | Agent skills deployment        |
| `persona`      | Persona (`SOUL.md`) deployment |

Settings deploy actions (`mcp`, `agent_skills`, `persona`) produce concise messages that include the target server name and resource count, e.g. `"MCP servers: Deployed to Production VPS (3 MCP servers)."`.

**Response (200):**

```json
{
  "logs": {
    "installLogs": [
      {
        "id": "uuid",
        "serverLabel": "My VPS",
        "status": "succeeded",
        "step": "start-containers",
        "createdAt": "2026-05-26T12:00:00.000Z",
        "updatedAt": "2026-05-26T12:05:00.000Z",
        "lines": [
          "2026-05-26T12:00:00.000Z [install-docker] Installing Docker",
          "2026-05-26T12:01:00.000Z [start-containers] Starting Hermes containers"
        ]
      }
    ],
    "actionLogs": [
      {
        "id": "uuid",
        "serverLabel": "My VPS",
        "action": "restart",
        "result": "succeeded",
        "createdAt": "2026-05-26T12:00:00.000Z",
        "message": "Restarted Hermes successfully."
      },
      {
        "id": "uuid",
        "serverLabel": "My VPS",
        "action": "mcp",
        "result": "succeeded",
        "createdAt": "2026-05-26T13:00:00.000Z",
        "message": "MCP servers: Deployed to My VPS (3 MCP servers)."
      }
    ]
  }
}
```

### POST `/api/logs/clear`

Deletes the user's persisted `install_events` rows and finished action audit entries. Install log text shown in the UI is derived from those events.

**Auth required:** Yes

**Response (200):**

```json
{
  "status": "cleared"
}
```

---

## Command Code Translation Proxy

The Coding Plan integration uses an OpenAI-compatible translation proxy because Command Code Go-plan keys cannot call the direct Provider API. These routes do not require a Hermes Hub session; the Command Code `user_*` key in the bearer header authenticates generation upstream. HTTPS is enforced in production.

### POST `/api/commandcode-proxy/v1/chat/completions`

Accepts an OpenAI chat-completions request and forwards it to `https://api.commandcode.ai/alpha/generate` using Command Code's CLI protocol.

**Auth required:** `Authorization: Bearer user_...` (Command Code key)

**Protocol translation:**

- System/developer messages become the Command Code `params.system` prompt; user, assistant, paired tool-call, and tool-result messages become Command Code content blocks.
- OpenAI function tools become Command Code `{ type: "function", name, description, input_schema }` tools.
- The upstream NDJSON stream is returned as OpenAI `text/event-stream` chunks. Command Code `text-delta`, `tool-call`, `finish`, and `error` events map to OpenAI content/tool chunks, finish reasons, usage, and error events. Reasoning deltas are omitted.
- When the request uses `"stream": false` or omits `stream`, the proxy collects the upstream event stream and returns one OpenAI chat completion JSON object.
- Upstream non-2xx statuses and bodies are preserved. Generation requests time out after 120 seconds.

### GET `/api/commandcode-proxy/v1/models`

Proxies unauthenticated model discovery to the Command Code Provider API models endpoint so Hermes can use the same proxy base URL for model lookup and generation.

---

## AI Providers

### POST `/api/providers`

Saves an AI provider configuration. Deactivates any existing provider config first, then inserts a new active record. API keys are encrypted with AES-256-GCM.

The `commandcode` API-provider entry connects directly to `https://api.commandcode.ai/provider/v1` and requires a Command Code Provider plan ($15/month) or higher. Go-plan users should select the Command Code Coding Plan subscription instead; Hermes Hub routes that subscription through the translation proxy.

**Auth required:** Yes

**Request body:**

```json
{
  "provider": "openai",
  "model": "gpt-4o-mini",
  "apiKey": "sk-..."
}
```

**Fields:**

| Field      | Type   | Description                                                                                      |
| ---------- | ------ | ------------------------------------------------------------------------------------------------ |
| `provider` | string | `"openai"`, `"anthropic"`, `"openrouter"`, `"ollama"`, `"deepseek"`, `"commandcode"`, or `"custom"`              |
| `model`    | string | Model ID (defaults to provider's default if omitted)                                             |
| `apiKey`   | string | API key. Required for `openai`, `anthropic`, `openrouter`, `deepseek`, `commandcode`, and `custom` (unless re-saving existing credentials). Optional for `ollama`. |
| `baseUrl`  | string | Required for `ollama`, `deepseek`, `commandcode`, and `custom`. Optional for other API-key providers.          |

**Supported models:**

All providers accept any valid model ID via free-text input — the listed models are quick-pick suggestions, not a strict allowlist. You can type any model ID your provider supports (alphanumerics, `.`, `_`, `:`, `/`, `-`; 1–120 chars).

| Provider     | Suggested models                                                                                                                   | Default                          |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| openai       | `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`, `gpt-5.5`, `gpt-5.5-pro`, `gpt-5.4`, `gpt-5.4-mini`, `gpt-5.4-nano`                | `gpt-5.6-terra`                  |
| anthropic    | `claude-fable-5`, `claude-opus-5`, `claude-sonnet-5`, `claude-haiku-4-5`, `claude-opus-4-8`, `claude-sonnet-4-6`                   | `claude-sonnet-5`                |
| openrouter   | _(no suggestions — enter any routed model ID)_                                                                                     | `openai/gpt-4o-mini`             |
| ollama       | _(no suggestions — enter any local model ID)_                                                                                      | `llama3`                         |
| deepseek     | `deepseek-v4-flash`, `deepseek-v4-pro`                                                                                             | `deepseek-v4-flash`              |
| commandcode  | _(no suggestions — enter any Command Code model ID)_                                                                               | `deepseek/deepseek-v4-flash`     |
| custom       | _(no suggestions — enter any model ID)_                                                                                            | _(empty)_                        |
**Response (200):**

```json
{
  "provider": {
    "provider": "openai",
    "model": "gpt-4o-mini",
    "keyLast4": "abcd",
    "hasStoredKey": true
  }
}
```

**Error responses:**

| Status | Condition                                                                           |
| ------ | ----------------------------------------------------------------------------------- |
| 400    | Invalid JSON body / invalid provider / invalid model / API key or base URL required |
| 401    | Unauthorized                                                                        |
| 500    | Failed to save provider settings                                                    |

---

### POST `/api/providers/test`

Tests an AI provider connection by calling the provider's models list endpoint. Does not persist any data.

**Auth required:** Yes

**Request body:** Same shape as POST `/api/providers`.

**Response (200 — connected):**

```json
{
  "status": "connected"
}
```

**Error responses:**

| Status | Condition                                                                                 |
| ------ | ----------------------------------------------------------------------------------------- |
| 400    | Invalid JSON body / invalid provider / invalid model / API key required / invalid API key |
| 401    | Unauthorized                                                                              |
| 502    | Connection failed (provider unreachable)                                                  |

---

### POST `/api/providers/deploy`

Deploys the current AI provider configuration to a Hermes VPS. Requires a Telegram bot to already be deployed to a server. Over SSH, writes a new `docker-compose.yml` with provider env vars, restarts the Hermes container (with `--force-recreate`), and runs `hermes config set model.provider` plus `hermes config set model` inside the container.

When a ChatGPT subscription is active (saved via `POST /api/providers/subscriptions`), the deploy omits API-key env vars, sets `HERMES_INFERENCE_PROVIDER=openai-codex` and `API_SERVER_MODEL_NAME`, and requires ChatGPT OAuth to already be present in remote `/root/.hermes/auth.json`.

**Auth required:** Yes

**Request body:** None (uses the latest saved provider config)

**Response (200):**

```json
{
  "status": "deployed",
  "provider": "openai",
  "model": "gpt-4o-mini",
  "serverHost": "192.168.1.100"
}
```

**Error responses:**

| Status | Condition                                                |
| ------ | -------------------------------------------------------- |
| 400    | No provider config saved yet                             |
| 400    | No Hermes deployment found (deploy a Telegram bot first) |
| 400    | Codex not authenticated on deployed Hermes server        |
| 400    | Credential unavailable / expired                         |
| 401    | Unauthorized                                             |
| 404    | Deployed server not found                                |
| 409    | Host key missing or mismatch (see Host Key Recovery)     |
| 502    | SSH connect or deploy command failed                     |

---

## Subscriptions

### POST `/api/providers/subscriptions`

Saves a subscription configuration (ChatGPT OAuth, MiMo credential, or Command Code Coding Plan). Deactivates any existing subscription or provider config first, then inserts a new active record. API keys are encrypted with AES-256-GCM.

**Auth required:** Yes (HTTPS enforced in production)

**Request body (ChatGPT — OAuth):**

```json
{
	"subscriptionProvider": "chatgpt",
	"model": "gpt-5.6-terra"
}
```

**Request body (MiMo — credential/api-key):**

```json
{
	"subscriptionProvider": "mimo",
	"model": "mimo-v2.5-pro",
	"apiKey": "tp-...",
	"baseUrl": "https://token-plan-cn.xiaomimimo.com/v1"
}
```

**Request body (Command Code — credential/api-key):**

```json
{
	"subscriptionProvider": "commandcode",
	"model": "deepseek/deepseek-v4-flash",
	"apiKey": "user_..."
}
```

Command Code Coding Plan credentials are stored and deployed with `${BETTER_AUTH_URL}/api/commandcode-proxy/v1` as their effective base URL. Any client-supplied Command Code subscription base URL is replaced with that canonical proxy URL. Existing saved subscriptions are also overridden at deploy time, so they do not need to be re-saved.

**Fields:**

| Field                 | Type   | Description                                                                 |
| --------------------- | ------ | --------------------------------------------------------------------------- |
| `subscriptionProvider` | string | `"chatgpt"`, `"mimo"`, or `"commandcode"`                                  |
| `model`               | string | Required. Must be a valid model for the subscription.                       |
| `apiKey`              | string | Required for `mimo` and `commandcode`. Not used for `chatgpt`.             |
| `baseUrl`             | string | Optional for `mimo` (defaults to its token-plan URL). Ignored for `commandcode`, which uses the Hermes Hub proxy. Not used for `chatgpt`. |

**Supported models:**

| Subscription          | Models                                                                       | Default                    |
| --------------------- | ---------------------------------------------------------------------------- | -------------------------- |
| chatgpt               | `gpt-5.5`, `gpt-5.4-mini`, `gpt-5.4`, `gpt-5.3-codex`, `gpt-5.3-codex-spark` | `gpt-5.5`                  |
| mimo                  | `mimo-v2.5-pro`, `mimo-v2.5`                                                | `mimo-v2.5-pro`            |
| commandcode           | `taste-1`, `deepseek/deepseek-v4-flash`, `deepseek/deepseek-v4-pro`, `minimax/minimax-m3`, `mimo/mimo-v2.5-pro`, `mimo/mimo-v2.5` | `deepseek/deepseek-v4-flash` |

**Response (200):**

```json
{
	"subscription": {
		"subscriptionProvider": "mimo",
		"model": "mimo-v2.5-pro",
		"authMode": "mimo-token-plan"
	}
}
```

**Error responses:**

| Status | Condition                                                                                |
| ------ | ---------------------------------------------------------------------------------------- |
| 400    | Invalid JSON body / invalid subscription provider / invalid model / API key required     |
| 401    | Unauthorized                                                                             |
| 500    | Failed to save subscription settings                                                     |

---

### POST `/api/providers/subscriptions/test`

Tests a subscription connection. MiMo calls its models list endpoint. Command Code performs a one-token generation against `https://api.commandcode.ai/alpha/generate`, which verifies actual Coding Plan inference access rather than the less restrictive models endpoint. ChatGPT (OAuth) skips API-key testing and returns a connected status with guidance to use device-code login instead.

**Auth required:** Yes

**Request body:** Same shape as POST `/api/providers/subscriptions`.

**Response (200 — connected):**

```json
{
	"status": "connected"
}
```

**Error responses:**

| Status | Condition                                                                 |
| ------ | ------------------------------------------------------------------------- |
| 400    | Invalid JSON body / invalid subscription provider / API key required      |
| 401    | Unauthorized                                                              |
| 502    | Connection failed (provider unreachable)                                  |

---

### POST `/api/providers/codex-auth/start`

Starts ChatGPT device-code login for the active Telegram-backed Hermes deployment. HermesHub stores only transient in-memory session metadata; OAuth tokens are never written to the database.

**Auth required:** Yes

**Request body:** None

**Response (200):**

```json
{
  "codexAuth": {
    "userCode": "ABCD-1234",
    "verificationUrl": "https://auth.openai.com/codex/device",
    "expiresAt": "2026-06-06T12:15:00.000Z",
    "pollIntervalSeconds": 5,
    "serverHost": "192.168.1.100"
  }
}
```

**Error responses:**

| Status | Condition                         |
| ------ | --------------------------------- |
| 400    | No Hermes deployment found        |
| 401    | Unauthorized                      |
| 502    | OpenAI device-code request failed |

---

### POST `/api/providers/codex-auth/complete`

Polls OpenAI for device-code approval, exchanges the authorization code, and writes `providers.openai-codex` auth state to remote `/root/.hermes/auth.json` with restrictive permissions.

**Auth required:** Yes

**Request body:** None

**Response (200 — pending):**

```json
{
  "status": "pending"
}
```

**Response (200 — authenticated):**

```json
{
  "status": "authenticated",
  "serverHost": "192.168.1.100",
  "authMode": "chatgpt",
  "lastRefresh": "2026-06-06T12:00:00.000Z"
}
```

**Error responses:**

| Status | Condition                                                 |
| ------ | --------------------------------------------------------- |
| 400    | No active device-code session / timeout / exchange failed |
| 401    | Unauthorized                                              |
| 502    | SSH write or remote auth update failed                    |

---

### GET `/api/providers/codex-auth/status`

Checks remote Hermes Codex auth status without exposing OAuth tokens.

**Auth required:** Yes

**Response (200):**

```json
{
  "codexAuth": {
    "authenticated": true,
    "authMode": "chatgpt",
    "lastRefresh": "2026-06-06T12:00:00.000Z",
    "serverHost": "192.168.1.100"
  }
}
```

**Error responses:**

| Status | Condition                              |
| ------ | -------------------------------------- |
| 400    | No Hermes deployment found             |
| 401    | Unauthorized                           |
| 502    | SSH connect or remote auth read failed |

---

## Telegram

### POST `/api/telegram/connect`

Verifies a Telegram bot token via the Telegram Bot API (`getMe`), then saves the configuration. Deactivates any existing Telegram config first.

**Auth required:** Yes

**Request body:**

```json
{
  "botToken": "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
}
```

**Response (200):**

```json
{
  "telegram": {
    "botUsername": "my_hermes_bot",
    "botTokenLast4": "w11",
    "isActive": true
  }
}
```

**Error responses:**

| Status | Condition                                                  |
| ------ | ---------------------------------------------------------- |
| 400    | Invalid JSON body / bot token required / invalid bot token |
| 401    | Unauthorized                                               |
| 502    | Connection failed (Telegram API unreachable)               |

---

### POST `/api/telegram/disconnect`

Deactivates the currently active Telegram configuration.

**Auth required:** Yes

**Response (200):**

```json
{
  "status": "disconnected"
}
```

**Error responses:**

| Status | Condition                     |
| ------ | ----------------------------- |
| 400    | Telegram bot is not connected |
| 401    | Unauthorized                  |
| 500    | Unable to disconnect Telegram |

---

### POST `/api/telegram/deploy`

Deploys the saved Telegram bot configuration to a Hermes VPS. Requires a server with a successful Hermes install. Over SSH, writes a Docker Compose file with the bot token and API server key, then starts the Hermes container.

**Auth required:** Yes (HTTPS enforced in production)

**Request body:** None (uses the latest saved Telegram config)

**Response (200):**

```json
{
  "status": "deployed",
  "serverHost": "192.168.1.100"
}
```

**Error responses:**

| Status | Condition                                                |
| ------ | -------------------------------------------------------- |
| 400    | No active Telegram config (connect a bot first)          |
| 400    | No server with a successful Hermes install found         |
| 400    | Credential unavailable / expired                         |
| 401    | Unauthorized                                             |
| 409    | Host key missing or mismatch (see Host Key Recovery)     |
| 500    | Failed to decrypt bot token                              |
| 502    | SSH connect or deploy command failed                     |

---

### POST `/api/telegram/test`

Sends a test message to the deployed Hermes agent over SSH. The agent processes the message through the active AI provider and returns a text response.

**Auth required:** Yes (HTTPS enforced in production)

**Request body:**

```json
{
  "message": "What can you do?"
}
```

**Response (200):**

```json
{
  "response": "I can help you with a variety of tasks..."
}
```

**Error responses:**

| Status | Condition                                                       |
| ------ | --------------------------------------------------------------- |
| 400    | Invalid JSON body / message required                           |
| 400    | No active Telegram config / bot not deployed to a server       |
| 400    | Provider config could not be loaded                             |
| 401    | Unauthorized                                                    |
| 404    | Deployed server not found                                       |
| 409    | Host key missing or mismatch (see Host Key Recovery)            |
| 502    | SSH connection failed / Hermes API unreachable / test failed    |

---

### POST `/api/telegram/model-switch`

Switches the active AI model on the deployed Hermes agent without redeploying the full Docker Compose stack. Updates the provider inference config and model inside the Hermes container, then recreates the container.

**Auth required:** Yes (HTTPS enforced in production)

**Request body:**

```json
{
  "optionId": "api-provider:abc123",
  "model": "gpt-4o"
}
```

**Fields:**

| Field      | Type   | Description                                                        |
| ---------- | ------ | ------------------------------------------------------------------ |
| `optionId` | string | Required. Identifies the provider or subscription record to switch.|
| `model`    | string | Required. Model ID to switch to. Must be valid for the option.     |

`optionId` format: `<kind>:<recordId>` where `kind` is one of `api-provider`, `credential-subscription`, or `oauth-subscription`.

**Response (200):**

```json
{
  "status": "switched",
  "optionId": "api-provider:abc123",
  "model": "gpt-4o",
  "provider": "openai"
}
```

**Error responses:**

| Status | Condition                                                       |
| ------ | --------------------------------------------------------------- |
| 400    | Invalid JSON body / `optionId` or `model` missing               |
| 400    | Invalid model string / model not valid for the given option     |
| 400    | Option not found                                                 |
| 401    | Unauthorized                                                    |
| 409    | Host key missing or mismatch (see Host Key Recovery)            |
| 502    | SSH connection failed or model switch command failed            |

---

### GET `/api/telegram/pairings`

Lists pending and approved Telegram pairing records from the deployed Hermes container. Requires Telegram to be deployed to a server.

**Auth required:** Yes

**Response (200):**

```json
{
  "pairings": {
    "pending": [
      {
        "code": "ABCD2345",
        "userId": "123456789",
        "userName": "Example User",
        "ageMinutes": 2
      }
    ],
    "approved": [
      {
        "userId": "123456789",
        "userName": "Example User",
        "approvedAt": 1780272000000
      }
    ]
  }
}
```

**Error responses:**

| Status | Condition                                         |
| ------ | ------------------------------------------------- |
| 400    | Telegram is not deployed / credential unavailable |
| 401    | Unauthorized                                      |
| 404    | Deployed server not found                         |
| 502    | SSH command or Hermes pairing command failed      |

---

### POST `/api/telegram/pairings/approve`

Approves a Telegram pairing code by running Hermes' pairing store approval inside the deployed Hermes container. This is the web UI replacement for running `hermes pairing approve telegram <code>` manually on the VPS.

**Auth required:** Yes

**Request body:**

```json
{
  "code": "ABCD2345"
}
```

**Response (200):**

```json
{
  "approved": {
    "userId": "123456789",
    "userName": "Example User"
  }
}
```

**Error responses:**

| Status | Condition                                                                                       |
| ------ | ----------------------------------------------------------------------------------------------- |
| 400    | Invalid code / code expired / approval lockout / Telegram not deployed / credential unavailable |
| 401    | Unauthorized                                                                                    |
| 404    | Deployed server not found                                                                       |
| 502    | SSH command or Hermes pairing command failed                                                    |

---

## Settings

HermesHub stores agent persona content in the database and can push it to the deployed Hermes container as `SOUL.md`. The Settings page (`/settings`) exposes a markdown editor for save and deploy. Deploy targets any owned VPS with a successful Hermes install. When multiple servers qualify, the UI exposes a **Deploy target** selector; the API accepts an optional `serverId` and otherwise defaults to the server with the most recent successful install.

### POST `/api/settings/persona`

Saves the authenticated user's Hermes agent persona. Content is trimmed, validated, and persisted in `hermes_settings`. Does not write to the VPS until deploy is called.

**Auth required:** Yes (HTTPS enforced in production)

**Request body:**

```json
{
  "agentPersona": "You are Hermes, a thoughtful assistant..."
}
```

**Fields:**

| Field          | Type   | Description                                             |
| -------------- | ------ | ------------------------------------------------------- |
| `agentPersona` | string | Markdown persona content, 1–20,000 characters (trimmed) |

**Response (200):**

```json
{
  "settings": {
    "agentPersona": "You are Hermes, a thoughtful assistant...",
    "updatedAt": "2026-06-06T12:00:00.000Z"
  }
}
```

**Error responses:**

| Status | Condition                                                                        |
| ------ | -------------------------------------------------------------------------------- |
| 400    | Invalid JSON body / persona content required / empty / exceeds 20,000 characters |
| 401    | Unauthorized                                                                     |
| 500    | Failed to save persona settings                                                  |

---

### POST `/api/settings/persona/deploy`

Writes the saved persona to `SOUL.md` on a selected Hermes VPS over SSH, then restarts the Hermes gateway so the new persona takes effect.

**Auth required:** Yes (HTTPS enforced in production)

**Request body (optional):**

```json
{
  "serverId": "uuid"
}
```

| Field      | Type   | Description                                                                                                                           |
| ---------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `serverId` | string | Optional. Owned server with a successful Hermes install. Defaults to the server with the most recent successful install when omitted. |

**Response (200):**

```json
{
  "status": "deployed",
  "serverId": "uuid",
  "serverHost": "192.168.1.100",
  "deployedAt": "2026-06-06T12:00:00.000Z"
}
```

**Error responses:**

| Status | Condition                                                         |
| ------ | ----------------------------------------------------------------- |
| 400    | No persona saved yet                                              |
| 400    | No deployed Hermes agent found (install Hermes on a server first) |
| 400    | Selected server does not have a successful Hermes install         |
| 400    | Credential unavailable / expired                                  |
| 401    | Unauthorized                                                      |
| 404    | Server not found                                                  |
| 409    | Host key missing or mismatch (see Host Key Recovery)            |
| 502    | SSH connect, SOUL.md write, or gateway restart failed             |

---

## MCP Servers

HermesHub stores custom MCP server definitions in `mcp_servers` and can push them to a selected Hermes VPS by replacing only the `mcp_servers` key in `/root/.hermes/config.yaml`. Environment variables and HTTP headers are encrypted at rest; create, update, and settings-page responses return keys with masked `valueLast4` metadata only. Server names are unique per user.

The Settings page (`/settings`) exposes Persona and MCP Servers tabs. Save persists locally; deploy writes over SSH and restarts the gateway. Recommended presets (Memory, Sequential Thinking, GitHub, and others) pre-fill common stdio servers; advanced setup supports custom stdio or HTTP transports. The page loader reads saved MCP servers and eligible deploy targets server-side (same pattern as persona); there is no list GET endpoint for v1. Switching a server between stdio and HTTP clears inactive transport fields (command/args/env vs URL/headers) on save.

### POST `/api/settings/mcp-servers`

Creates a new MCP server for the authenticated user.

**Auth required:** Yes (HTTPS enforced in production)

**Request body (stdio example):**

```json
{
  "name": "github",
  "transport": "stdio",
  "enabled": true,
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-github"],
  "env": [{ "key": "GITHUB_PERSONAL_ACCESS_TOKEN", "value": "ghp_..." }],
  "toolsInclude": ["create_issue"],
  "toolsResources": false,
  "timeout": 120,
  "connectTimeout": 60,
  "supportsParallelToolCalls": false
}
```

**Request body (HTTP example):**

```json
{
  "name": "stripe",
  "transport": "http",
  "url": "https://mcp.stripe.com",
  "headers": [{ "key": "Authorization", "value": "Bearer ..." }],
  "toolsExclude": ["delete_customer"]
}
```

**Response (200):**

```json
{
  "server": {
    "id": "mcp_123",
    "name": "github",
    "transport": "stdio",
    "enabled": true,
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-github"],
    "url": null,
    "env": [
      {
        "key": "GITHUB_PERSONAL_ACCESS_TOKEN",
        "valueLast4": "1234",
        "hasStoredValue": true
      }
    ],
    "headers": [],
    "toolsInclude": [],
    "toolsExclude": [],
    "toolsResources": true,
    "toolsPrompts": true,
    "timeout": null,
    "connectTimeout": null,
    "supportsParallelToolCalls": false,
    "createdAt": "2026-06-06T12:00:00.000Z",
    "updatedAt": "2026-06-06T12:00:00.000Z"
  }
}
```

**Error responses:**

| Status | Condition                                                    |
| ------ | ------------------------------------------------------------ |
| 400    | Invalid JSON body / validation error / duplicate server name |
| 401    | Unauthorized                                                 |
| 500    | Failed to create MCP server                                  |

---

### PUT `/api/settings/mcp-servers/:id`

Updates an owned MCP server. Blank secret values preserve existing encrypted env/header values for the active transport. Changing `transport` clears fields for the inactive transport.

**Auth required:** Yes (HTTPS enforced in production)

**Request body:** Partial MCP server fields (same shape as create)

**Response (200):** Same `server` object shape as create.

**Error responses:**

| Status | Condition                                                    |
| ------ | ------------------------------------------------------------ |
| 400    | Invalid JSON body / validation error / duplicate server name |
| 401    | Unauthorized                                                 |
| 404    | MCP server not found                                         |
| 500    | Failed to update MCP server                                  |

---

### DELETE `/api/settings/mcp-servers/:id`

Deletes an owned MCP server from HermesHub. Remote Hermes config is unchanged until deploy is called.

**Auth required:** Yes (HTTPS enforced in production)

**Response (200):**

```json
{
  "status": "deleted",
  "id": "mcp_123"
}
```

**Error responses:**

| Status | Condition                   |
| ------ | --------------------------- |
| 401    | Unauthorized                |
| 404    | MCP server not found        |
| 500    | Failed to delete MCP server |

---

### POST `/api/settings/mcp-servers/deploy`

Replaces the remote `mcp_servers` section in `/root/.hermes/config.yaml` with the user's saved HermesHub state, preserves all other config keys when the existing file is valid YAML, fixes readable ownership where possible, and restarts the Hermes gateway. If the remote `config.yaml` is missing or unreadable, deploy starts from an empty object and writes only `mcp_servers`. If the file exists but is not valid YAML (or is not a YAML object), deploy fails without writing remotely.

**Auth required:** Yes (HTTPS enforced in production)

**Request body (optional):**

```json
{
  "serverId": "uuid"
}
```

| Field      | Type   | Description                                                                                                                           |
| ---------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `serverId` | string | Optional. Owned server with a successful Hermes install. Defaults to the server with the most recent successful install when omitted. |

**Response (200):**

```json
{
  "status": "deployed",
  "serverId": "uuid",
  "serverHost": "192.168.1.100",
  "serverCount": 2,
  "deployedAt": "2026-06-06T12:00:00.000Z"
}
```

**Error responses:**

| Status | Condition                                                                                 |
| ------ | ----------------------------------------------------------------------------------------- |
| 400    | No deployed Hermes agent found (install Hermes on a server first)                         |
| 400    | Selected server does not have a successful Hermes install                                 |
| 400    | Credential unavailable / expired                                                          |
| 401    | Unauthorized                                                                              |
| 404    | Server not found                                                                          |
| 409    | Host key missing or mismatch (see Host Key Recovery)                                      |
| 502    | SSH connect, invalid existing `config.yaml`, config read/write, or gateway restart failed |

---

## Agent Skills

HermesHub stores custom and community agent skills in `agent_skills` and can push them to a selected Hermes VPS. Skills can be imported from the Hermes Skills Hub (via a Hub install ref such as `browse-sh/weather.gov/get-forecast-1uezib`), from a custom URL (either a GitHub folder URL such as `https://github.com/owner/repo/tree/main/skills/my-skill`, which installs the whole skill folder including scripts, or a direct URL to a single `SKILL.md` file), or authored directly in the UI as markdown. GitHub folder/file URLs are rewritten to the `owner/repo/path` slug the Hermes CLI resolves against the repository's default branch. Deploying skills synchronizes the list to the remote Hermes target, writes custom skill files, and runs `hermes skills install/uninstall` commands inside the Hermes container before restarting the gateway.

Hub skills are installed exactly as published — the installed name is derived from the ref itself (the last path segment), not from the saved display name. URL and custom skills use the saved name as the installed name.

The Settings page (`/settings`) exposes an **Agent Skills** tab. Save persists locally; deploy writes over SSH and restarts the gateway.

### POST `/api/settings/agent-skills`

Creates a new agent skill. Content is validated (including size constraints <= 50,000 characters and valid URL/repository formats) and persisted in the database. Does not write to the VPS until deploy is called.

**Auth required:** Yes (HTTPS enforced in production)

**Request body:**

```json
{
  "name": "my-skill",
  "sourceType": "hub",
  "installRef": "owner/repo",
  "enabled": true
}
```

| Field        | Type    | Description                                                                                                                                                                       |
| ------------ | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`       | string  | Required. Unique name for the skill. Must start with a letter and contain only letters, numbers, underscores, or hyphens.                                                         |
| `sourceType` | string  | Required. Must be one of `"hub"`, `"url"`, or `"custom"`.                                                                                                                         |
| `installRef` | string  | Required if `sourceType` is `"hub"` or `"url"`. Repository/package reference pattern `/^[a-zA-Z0-9_/-]+(?:@[a-zA-Z0-9_.-]+)?$/` for `"hub"`, or valid http/https URL for `"url"`. |
| `content`    | string  | Required if `sourceType` is `"custom"`. Markdown content, up to 50,000 characters.                                                                                                |
| `enabled`    | boolean | Optional. Defaults to `true`.                                                                                                                                                     |

**Response (200):**

```json
{
  "skill": {
    "id": "uuid",
    "name": "my-skill",
    "sourceType": "hub",
    "installRef": "owner/repo",
    "content": null,
    "enabled": true,
    "createdAt": "2026-06-07T12:00:00.000Z",
    "updatedAt": "2026-06-07T12:00:00.000Z"
  }
}
```

**Error responses:**

| Status | Condition                                                           |
| ------ | ------------------------------------------------------------------- |
| 400    | Invalid JSON payload, missing required fields, or validation failed |
| 400    | An agent skill with this name already exists                        |
| 401    | Unauthorized                                                        |
| 500    | Database save failed                                                |

---

### PUT `/api/settings/agent-skills/:id`

Updates an existing agent skill by ID. Only modifies fields sent in the request body.

**Auth required:** Yes (HTTPS enforced in production)

**Request body:**

```json
{
  "enabled": false
}
```

| Field        | Type    | Description                                                                    |
| ------------ | ------- | ------------------------------------------------------------------------------ |
| `name`       | string  | Optional. New name for the skill. Must follow the unique naming constraints.   |
| `installRef` | string  | Optional. Must match format constraints of the skill's original `sourceType`.  |
| `content`    | string  | Optional. Must match content constraints of the skill's original `sourceType`. |
| `enabled`    | boolean | Optional. Updates activation status.                                           |

**Response (200):**

```json
{
  "skill": {
    "id": "uuid",
    "name": "my-skill",
    "sourceType": "hub",
    "installRef": "owner/repo",
    "content": null,
    "enabled": false,
    "createdAt": "2026-06-07T12:00:00.000Z",
    "updatedAt": "2026-06-07T13:00:00.000Z"
  }
}
```

**Error responses:**

| Status | Condition                                                        |
| ------ | ---------------------------------------------------------------- |
| 400    | Validation failed, or attempting to set invalid/empty references |
| 400    | Rename conflict with an existing skill name                      |
| 401    | Unauthorized                                                     |
| 404    | Agent skill not found                                            |
| 500    | Database update failed                                           |

---

### DELETE `/api/settings/agent-skills/:id`

Deletes an agent skill by ID. Does not remove it from connected servers until the next deploy runs.

**Auth required:** Yes (HTTPS enforced in production)

**Request body:** None

**Response (200):**

```json
{
  "success": true
}
```

**Error responses:**

| Status | Condition                |
| ------ | ------------------------ |
| 401    | Unauthorized             |
| 404    | Agent skill not found    |
| 500    | Database deletion failed |

---

### POST `/api/settings/agent-skills/deploy`

Deploys the user's enabled agent skills list to a selected Hermes VPS, uninstalls disabled/removed skills, writes custom skill files, records the changes in a remote manifest file `/root/.hermes/hermeshub-agent-skills.json`, and restarts the Hermes gateway.

**Auth required:** Yes (HTTPS enforced in production)

**Request body (optional):**

```json
{
  "serverId": "uuid"
}
```

| Field      | Type   | Description                                                                                                    |
| ---------- | ------ | -------------------------------------------------------------------------------------------------------------- |
| `serverId` | string | Optional. Deploys to this server. Defaults to the server with the most recent successful install when omitted. |

**Response (200):**

```json
{
  "status": "deployed",
  "serverId": "uuid",
  "serverHost": "192.168.1.100",
  "skillCount": 3,
  "deployedAt": "2026-06-07T13:00:00.000Z"
}
```

**Error responses:**

| Status | Condition                                                                  |
| ------ | -------------------------------------------------------------------------- |
| 400    | Selected server does not have a successful Hermes install                  |
| 401    | Unauthorized                                                               |
| 404    | Server not found                                                           |
| 409    | Host key missing or mismatch (see Host Key Recovery)                         |
| 502    | SSH connection error, command execution failure, or gateway restart failed |

---

### POST `/api/settings/agent-skills/remote-list`

Fetches the list of agent skills currently installed/configured on the remote Hermes container of a selected VPS. This is a read-only endpoint that SSHes into the server and runs `sudo docker exec hermes hermes skills list`.

**Auth required:** Yes (HTTPS enforced in production)

**Request body (optional):**

```json
{
  "serverId": "uuid"
}
```

| Field      | Type   | Description                                                                                                                                  |
| ---------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `serverId` | string | Optional. Server ID from which to fetch the remote skills list. Defaults to the server with the most recent successful install when omitted. |

**Response (200):**

```json
{
  "raw": "Installed Skills\n┏━━━━━━━━━━━━━━━━━━━━━━┳━━━━━━━━━━━━━━━━━━━━━━┳━━━━━━━━━━┳━━━━━━━━━━┳━━━━━━━━━━┓\n┃ Name                 ┃ Category             ┃ Source   ┃ Trust    ┃ Status   ┃\n┡━━━━━━━━━━━━━━━━━━━━━━╇━━━━━━━━━━━━━━━━━━━━━━╇━━━━━━━━━━╇━━━━━━━━━━╇━━━━━━━━━━┩\n│ dogfood              │                      │ builtin  │ builtin  │ enabled  │\n│ claude-code          │ autonomous-ai-agents │ builtin  │ builtin  │ enabled  │\n└──────────────────────┴──────────────────────┴──────────┴──────────┴──────────┘",
  "skills": ["dogfood", "claude-code"],
  "count": 2
}
```

**Error responses:**

| Status | Condition                                                 |
| ------ | --------------------------------------------------------- |
| 400    | Selected server does not have a successful Hermes install |
| 401    | Unauthorized                                              |
| 404    | Server not found                                          |
| 502    | SSH connection error or remote command execution failure  |

---

## Hermes Web UI

HermesHub can deploy the [Hermes Web UI](https://get-hermes.ai/) alongside the Hermes agent on a connected VPS. After setup, the UI is reachable through an authenticated reverse proxy at `/api/servers/:id/web-ui/proxy/` — traffic is forwarded over SSH to the Web UI container on the VPS (default port `8787`). No manual SSH tunnels are required.

The server detail page (`/servers/:id`) exposes setup, open, redeploy, and password-reveal controls when the latest Hermes install has succeeded.

### POST `/api/servers/:id/web-ui/deploy`

Deploys or redeploys the Hermes Web UI service on the connected VPS. The deploy runs in the background: the endpoint returns `202` immediately and the caller polls `GET /api/servers/:id/web-ui` to watch `deployStatus` advance from `"deploying"` to `"succeeded"` or `"failed"`.

On first deploy, generates and encrypts a Web UI password; redeploys reuse the stored password. If a non-stale deploy is already in progress (started within `STALE_DEPLOY_THRESHOLD_MS`, default 10 minutes), the endpoint returns `202` with the current status instead of starting a duplicate deploy. A deploy that exceeds the threshold without completing is treated as stale and will be replaced by a new deploy on the next request.

**Auth required:** Yes (HTTPS enforced in production)

**Request body:** None

**Response (202 — deploying or already deploying):**

`enabled` reflects the Web UI state before this deploy; it flips to `true` once `deployStatus` reaches `"succeeded"`.

```json
{
  "status": "deploying",
  "webUi": {
    "enabled": false,
    "port": 8787,
    "proxyPath": "/api/servers/uuid/web-ui/proxy/",
    "deployStatus": "deploying",
    "deployError": null,
    "deployStartedAt": "2026-05-26T12:00:00.000Z",
    "updatedAt": "2026-05-26T12:00:00.000Z"
  }
}
```

**Error responses:**

| Status | Condition                                                 |
| ------ | --------------------------------------------------------- |
| 400    | Hermes is not installed or the latest install failed      |
| 401    | Unauthorized                                              |
| 404    | Server not found                                          |
| 500    | Password resolution failed before deploy                  |
| 409    | Host key missing or mismatch (see Host Key Recovery)     |
| 502    | SSH connect, compose deploy, or reachability check failed |

---

### GET `/api/servers/:id/web-ui`

Returns the current Hermes Web UI snapshot for a server. Use this lightweight endpoint while a background deploy is running instead of reloading the full server detail payload.

**Auth required:** Yes

**Response (200):**

```json
{
  "webUi": {
    "enabled": true,
    "port": 8787,
    "proxyPath": "/api/servers/uuid/web-ui/proxy/",
    "deployStatus": "succeeded",
    "deployError": null,
    "deployStartedAt": null,
    "updatedAt": "2026-05-26T12:00:00.000Z"
  }
}
```

Returns `"webUi": null` when no Web UI record exists yet.

**Error responses:**

| Status | Condition        |
| ------ | ---------------- |
| 401    | Unauthorized     |
| 404    | Server not found |

---

### GET `/api/servers/:id/web-ui/password`

Returns the decrypted Hermes Web UI password for the authenticated server owner. Use this to sign in when opening the proxied Web UI in a new tab.

**Auth required:** Yes (HTTPS enforced in production)

**Response (200):**

```json
{
  "password": "generated-web-ui-password"
}
```

**Error responses:**

| Status | Condition                                   |
| ------ | ------------------------------------------- |
| 400    | Hermes Web UI is not enabled on this server |
| 401    | Unauthorized                                |
| 404    | Server not found                            |
| 500    | Failed to decrypt stored password           |

---

### ALL `/api/servers/:id/web-ui/proxy` and `/api/servers/:id/web-ui/proxy/*`

Authenticated reverse proxy to the Hermes Web UI running on the VPS. Requests are forwarded over a pooled SSH connection to `127.0.0.1:<port>` on the remote host. Response headers are rewritten so assets and redirects resolve under the proxy path.

A request to `/api/servers/:id/web-ui/proxy` (no trailing slash) returns `308` to `/api/servers/:id/web-ui/proxy/`. The proxy root forwards upstream `/` so the Hermes Web UI shell loads at the proxied landing path.

**Auth required:** Yes (HTTPS enforced in production)

**Response:** Upstream HTTP response from the Hermes Web UI, or JSON error on proxy failure.

**Error responses:**

| Status | Condition                                      |
| ------ | ---------------------------------------------- |
| 400    | Hermes Web UI is not enabled on this server    |
| 401    | Unauthorized                                   |
| 404    | Server not found                               |
| 502    | SSH tunnel failed or remote Web UI unreachable |

---

## Database Schema

The following tables are used by the API:

| Table                                        | Description                                                                                                   |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `servers`                                    | Connected VPS records with encrypted credentials                                                              |
| `installs`                                   | Install workflow state and version tracking                                                                   |
| `install_events`                             | Persisted install progress events (log source)                                                                |
| `server_web_ui`                              | Hermes Web UI deploy state and encrypted password                                                             |
| `ai_providers`                               | AI provider configuration with encrypted API keys                                                             |
| `telegram_configs`                           | Telegram bot connections                                                                                      |
| `audit_logs`                                 | Action audit trail (connect, install, actions, health checks, provider, telegram, persona, MCP, agent_skills) |
| `hermes_settings`                            | Per-user Hermes agent persona (`SOUL.md` source)                                                              |
| `mcp_servers`                                | Per-user MCP server definitions with encrypted secrets                                                        |
| `agent_skills`                               | Per-user Agent Skill configurations                                                                           |
| `user`, `session`, `account`, `verification` | Better Auth user management tables                                                                            |

---

## Common Headers

- **Authentication:** Session cookie set by Better Auth after magic-link login.
- **X-Forwarded-For:** Used to record client IP in audit log entries.

All endpoints return JSON with `Content-Type: application/json` (except SSE streams which use `text/event-stream`).

---

## Error Response Format

All errors return a consistent JSON shape:

```json
{
  "error": "Human-readable error message"
}
```
