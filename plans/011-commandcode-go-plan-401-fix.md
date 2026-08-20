# Command Code Go Plan 401 Fix

## Problem

Telegram "Test your bot" returns `401 UNAUTHORIZED` from Command Code when using a Go plan (`user_*`) key via the **Command Code Coding Plan** subscription.

Pi with `patlux/pi-commandcode-provider` works against the same key because it calls `api.commandcode.ai/alpha/generate` directly with the user's key.

Hermes Hub routes Go plan traffic through `BETTER_AUTH_URL/api/commandcode-proxy/v1`, which is correct. The deployed Hermes container is configured as `HERMES_INFERENCE_PROVIDER=custom` with `CUSTOM_BASE_URL` pointing at that proxy.

## Root cause

ADR 0010 documents that Hermes derives a vendor-specific `<VENDOR>_API_KEY` from the custom base URL hostname. Subscription deploy already mirrored `OPENAI_API_KEY`, `CUSTOM_BASE_URL`, and `OPENAI_BASE_URL`, but **did not** set the derived vendor key.

Example: proxy at `https://hub.example.com/api/commandcode-proxy/v1` → Hermes looks for `EXAMPLE_API_KEY`. Deploy only set `OPENAI_API_KEY`, so outbound proxy requests lacked a valid Command Code bearer token → upstream 401.

API-provider deploy (`buildProviderEnvMap`) already sets the derived key; subscription deploy (`buildSubscriptionCredentialEnvMap`) did not.

## Fix

1. Export `deriveCustomProviderApiKeyEnvVar` from `server/providers/config.ts`.
2. In `buildSubscriptionCredentialEnvMap`, when `hermesProviderId === "custom"`, set the derived vendor env var to the stored API key (same as API provider deploy).
3. Bump `COMMAND_CODE_CLI_VERSION` to `1.15.1` to match current `patlux/pi-commandcode-provider`.

## Verification

- Update provider deploy env test expectations for Command Code subscription.
- Run `server/providers.test.ts` and `server/commandcode/proxy.test.ts`.
