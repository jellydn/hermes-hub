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

| Field            | Type    | Description                                                |
| ---------------- | ------- | ---------------------------------------------------------- |
| `label`          | string  | Friendly name for the server                               |
| `host`           | string  | IP address or domain name                                  |
| `port`           | integer | SSH port (1–65535)                                         |
| `username`       | string  | SSH username                                               |
| `authMethod`     | string  | `"password"` or `"ssh-key"`                                |
| `password`       | string  | Required if `authMethod` is `"password"`                   |
| `privateKey`     | string  | Required if `authMethod` is `"ssh-key"` (PEM-encoded key)  |
| `storeCredential`| boolean | If true, encrypts credential in DB; if false, in-memory only |

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

| Status | Condition                        |
| ------ | -------------------------------- |
| 400    | Invalid JSON body                |
| 400    | Missing required fields          |
| 400    | Invalid port range               |
| 400    | Unsupported auth method          |
| 400    | SSH connection failed / host unreachable / invalid credentials |
| 400    | Unsupported OS (requires Ubuntu 22.04+ or Debian 12+) |
| 401    | Unauthorized                     |
| 500    | Failed to save server connection |

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
    "rollbackTarget": null
  }
}
```

**Error responses:**

| Status | Condition        |
| ------ | ---------------- |
| 400    | Server ID missing |
| 401    | Unauthorized     |
| 404    | Server not found |

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

| Status | Condition                                    |
| ------ | -------------------------------------------- |
| 400    | Server ID missing / unsupported auth method |
| 400    | Install credential unavailable / expired     |
| 401    | Unauthorized                                 |
| 404    | Server not found                             |
| 409    | Install already in progress                  |

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

| Step                    | Progress | Description                |
| ----------------------- | -------- | -------------------------- |
| `install-docker`        | 15%      | Installing Docker          |
| `install-compose`       | 30%      | Installing Docker Compose  |
| `create-hermes-directory`| 45%     | Creating Hermes workspace  |
| `write-compose-file`    | 60%      | Writing docker-compose.yml |
| `pull-image`            | 80%      | Pulling Hermes image       |
| `start-containers`      | 100%     | Starting Hermes containers |

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

| Status | Condition        |
| ------ | ---------------- |
| 400    | Server ID missing |
| 401    | Unauthorized     |
| 404    | Server not found |

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

| Field           | Type   | Description                                                  |
| --------------- | ------ | ------------------------------------------------------------ |
| `action`        | string | `"restart"`, `"update"`, or `"rollback"`                     |
| `targetVersion` | string | Required for rollback; defaults to previous install version then `"latest"` |

**Commands executed:**

| Action    | SSH Command                                                  |
| --------- | ------------------------------------------------------------ |
| restart   | `cd ~/hermes && sudo docker compose restart`                 |
| update    | `cd ~/hermes && sudo docker compose pull && sudo docker compose up -d` |
| rollback  | Pulls `ghcr.io/hermes-agent/hermes:<tag>`, updates compose file, runs `docker compose up -d` |

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

| Status | Condition                                |
| ------ | ---------------------------------------- |
| 400    | Invalid JSON body                        |
| 400    | Invalid action type                      |
| 400    | Unsupported auth method                  |
| 400    | Credential expired / missing             |
| 400    | SSH action failed                        |
| 401    | Unauthorized                             |
| 404    | Server not found                         |

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
      }
    ]
  }
}
```

### POST `/api/logs/clear`

Clears the install logs (log column set to null on user's installs) and deletes finished action audit entries.

**Auth required:** Yes

**Response (200):**
```json
{
  "status": "cleared"
}
```

---

## AI Providers

### POST `/api/providers`

Saves an AI provider configuration. Deactivates any existing provider config first, then inserts a new active record. API keys are encrypted with AES-256-GCM.

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

| Field     | Type   | Description                                    |
| --------- | ------ | ---------------------------------------------- |
| `provider`| string | `"openai"`, `"anthropic"`, or `"openrouter"`   |
| `model`   | string | Model ID (defaults to provider's default if omitted) |
| `apiKey`  | string | API key. Optional if re-saving the same provider (uses stored key) |

**Supported models:**

| Provider    | Models                                                      | Default              |
| ----------- | ----------------------------------------------------------- | -------------------- |
| openai      | `gpt-4o`, `gpt-4o-mini`, `gpt-4-turbo`                     | `gpt-4o-mini`        |
| anthropic   | `claude-sonnet-4-20250514`, `claude-haiku-3-5`             | `claude-sonnet-4-20250514` |
| openrouter  | Any model ID (custom text input)                             | `openai/gpt-4o-mini` |

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

| Status | Condition                                    |
| ------ | -------------------------------------------- |
| 400    | Invalid JSON body / invalid provider / invalid model / API key required |
| 401    | Unauthorized                                 |
| 500    | Failed to save provider settings             |

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

| Status | Condition                               |
| ------ | --------------------------------------- |
| 400    | Invalid JSON body / invalid provider / invalid model / API key required / invalid API key |
| 401    | Unauthorized                            |
| 502    | Connection failed (provider unreachable) |

---

### POST `/api/providers/deploy`

Deploys the current AI provider configuration to a Hermes VPS. Requires a Telegram bot to already be deployed to a server. Over SSH, writes a new `docker-compose.yml` with provider env vars, restarts the Hermes container (with `--force-recreate`), and runs `hermes config set model` inside the container.

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

| Status | Condition                                                    |
| ------ | ------------------------------------------------------------ |
| 400    | No provider config saved yet                                 |
| 400    | No Hermes deployment found (deploy a Telegram bot first)     |
| 400    | Credential unavailable / expired                             |
| 401    | Unauthorized                                                 |
| 404    | Deployed server not found                                    |
| 502    | SSH connect or deploy command failed                         |

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

| Status | Condition                               |
| ------ | --------------------------------------- |
| 400    | Invalid JSON body / bot token required / invalid bot token |
| 401    | Unauthorized                            |
| 502    | Connection failed (Telegram API unreachable) |

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

| Status | Condition                            |
| ------ | ------------------------------------ |
| 400    | Telegram bot is not connected        |
| 401    | Unauthorized                         |
| 500    | Unable to disconnect Telegram        |

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

| Status | Condition                                      |
| ------ | ---------------------------------------------- |
| 400    | Telegram is not deployed / credential unavailable |
| 401    | Unauthorized                                   |
| 404    | Deployed server not found                      |
| 502    | SSH command or Hermes pairing command failed   |

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

| Status | Condition                                      |
| ------ | ---------------------------------------------- |
| 400    | Invalid code / code expired / approval lockout / Telegram not deployed / credential unavailable |
| 401    | Unauthorized                                   |
| 404    | Deployed server not found                      |
| 502    | SSH command or Hermes pairing command failed   |

---

## Database Schema

The following tables are used by the API:

| Table              | Description                                  |
| ------------------ | -------------------------------------------- |
| `servers`          | Connected VPS records with encrypted credentials |
| `installs`         | Install workflow state and logs              |
| `ai_providers`     | AI provider configuration with encrypted API keys |
| `telegram_configs` | Telegram bot connections                     |
| `audit_logs`       | Action audit trail (connect, install, actions, provider, telegram) |
| `user`, `session`, `account`, `verification` | Better Auth user management tables |

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
