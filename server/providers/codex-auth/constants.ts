export const CODEX_OAUTH_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
export const CODEX_OAUTH_ISSUER = "https://auth.openai.com";
export const CODEX_OAUTH_TOKEN_URL = `${CODEX_OAUTH_ISSUER}/oauth/token`;
export const CODEX_OAUTH_DEVICE_API_BASE = `${CODEX_OAUTH_ISSUER}/api/accounts`;
export const CODEX_VERIFICATION_URL = `${CODEX_OAUTH_ISSUER}/codex/device`;
export const CODEX_CREDENTIAL_BASE_URL =
	"https://chatgpt.com/backend-api/codex";
export const CODEX_PROVIDER_ID = "openai-codex";
export {
	CODEX_DEFAULT_POLL_INTERVAL_SECONDS,
	CODEX_MAX_POLL_ATTEMPTS,
	CODEX_SESSION_TTL_MS,
} from "../../../shared/contracts/codex-auth";
