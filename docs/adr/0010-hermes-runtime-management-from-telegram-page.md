# 10. Hermes Runtime Management from Telegram Page

Date: 2026-06-01

## Status

Accepted

## Context

Hermes can reject a Telegram user with a message such as:

```text
Hi~ I don't recognize you yet!

Here's your pairing code: ABCD2345

Ask the bot owner to run:
hermes pairing approve telegram ABCD2345
```

That CLI instruction conflicts with HermesHub's product boundary: the owner should be able to operate a deployed Hermes agent from the web UI without SSHing into the VPS.

The `/telegram` test flow also surfaced a second runtime mismatch for custom OpenAI-compatible providers. HermesHub's provider test can succeed with the saved API key, but the deployed Hermes container may still return provider authentication errors if the container only receives generic OpenAI-style variables. Hermes derives vendor-specific keys from custom provider hosts, so a custom endpoint such as `https://crof.ai/v1` also needs `CROF_API_KEY`.

## Decision

HermesHub will manage these deployed Hermes runtime concerns from the web app:

- The `/telegram` page exposes pairing management so owners can refresh pending and approved Telegram users, paste an 8-character pairing code, and approve it from the UI.
- Pairing APIs execute over SSH against the already deployed Hermes server and call Hermes' `gateway.pairing.PairingStore` inside the running `hermes` container.
- Hermes' PairingStore remains the source of truth for pairing state. HermesHub does not mirror pending or approved Telegram users into PostgreSQL.
- HermesHub does not require running `hermes setup` during install or pairing approval. The managed Docker Compose deployment writes the required environment and volume state non-interactively.
- Custom provider deploys include the generic Hermes/OpenAI-compatible variables and, when derivable from the custom base URL, the vendor-specific `<VENDOR>_API_KEY` variable used by Hermes runtime code.

## Consequences

### Positive

- Telegram pairing is no longer a terminal-only operation for the bot owner.
- The UI can resolve the exact pairing prompt Hermes sends to unrecognized Telegram users.
- Runtime provider deploys better match Hermes' own custom-provider key lookup behavior.
- Pairing data stays in the Hermes runtime store, avoiding duplicated state and sync drift in HermesHub.

### Negative

- Pairing management depends on SSH reachability and valid stored or session-scoped VPS credentials.
- The implementation is coupled to the deployed container name and Hermes' current Python `PairingStore` module path.
- Troubleshooting still needs VPS-level checks when the Hermes container is stopped, replaced manually, or missing the expected volume state.
