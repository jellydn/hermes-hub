import type { NodeSSH } from "node-ssh";

import type { CodexAuthStatus } from "../../shared/contracts/codex-auth";
import { managedComposeVolumeHome } from "../constants";
import {
	CODEX_CREDENTIAL_BASE_URL,
	CODEX_PROVIDER_ID,
} from "../providers/codex-auth/constants";
import type { CodexOAuthTokens } from "../providers/codex-auth/device-flow";

export const HERMES_AUTH_JSON_PATH = `${managedComposeVolumeHome}/.hermes/auth.json`;

export const HERMES_AUTH_JSON_INVALID_MESSAGE =
	"Remote Hermes auth.json is not valid JSON. Fix it on the VPS before continuing.";

export type HermesAuthStore = {
	providers?: Record<string, unknown>;
	credential_pool?: Record<string, unknown>;
	active_provider?: string;
};

export function parseHermesAuthStoreRaw(
	raw: string,
	errorMessage = "Remote Hermes auth.json is not valid JSON.",
): HermesAuthStore | null {
	if (!raw.trim()) {
		return null;
	}

	try {
		const parsed: unknown = JSON.parse(raw);
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
			throw new Error("Invalid JSON structure");
		}

		return parsed as HermesAuthStore;
	} catch {
		throw new Error(errorMessage);
	}
}

export async function readHermesAuthStore(
	ssh: NodeSSH,
	errorMessage = "Remote Hermes auth.json is not valid JSON.",
): Promise<HermesAuthStore | null> {
	const raw = await readHermesAuthJson(ssh);
	return parseHermesAuthStoreRaw(raw, errorMessage);
}

export function buildCodexAuthStorePatch(
	tokens: CodexOAuthTokens,
	lastRefresh: string,
): HermesAuthStore {
	const accessToken = tokens.access_token.trim();
	const refreshToken = tokens.refresh_token?.trim() ?? "";

	return {
		active_provider: CODEX_PROVIDER_ID,
		providers: {
			[CODEX_PROVIDER_ID]: {
				tokens: {
					access_token: accessToken,
					refresh_token: refreshToken,
				},
				last_refresh: lastRefresh,
				auth_mode: "chatgpt",
			},
		},
		credential_pool: {
			[CODEX_PROVIDER_ID]: [
				{
					source: "device_code",
					auth_type: "oauth",
					access_token: accessToken,
					refresh_token: refreshToken,
					base_url: CODEX_CREDENTIAL_BASE_URL,
					last_refresh: lastRefresh,
					label: "device_code",
				},
			],
		},
	};
}

export function mergeHermesAuthStore(
	existing: HermesAuthStore,
	patch: HermesAuthStore,
): HermesAuthStore {
	const merged: HermesAuthStore = {
		...existing,
		providers: {
			...(typeof existing.providers === "object" && existing.providers
				? existing.providers
				: {}),
			...(typeof patch.providers === "object" && patch.providers
				? patch.providers
				: {}),
		},
		credential_pool: {
			...(typeof existing.credential_pool === "object" &&
			existing.credential_pool
				? existing.credential_pool
				: {}),
			...(typeof patch.credential_pool === "object" && patch.credential_pool
				? patch.credential_pool
				: {}),
		},
	};

	if (patch.active_provider) {
		merged.active_provider = patch.active_provider;
	}

	return merged;
}

export function parseCodexAuthStatus(authStore: unknown): CodexAuthStatus {
	if (!authStore || typeof authStore !== "object") {
		return {
			authenticated: false,
			authMode: null,
			lastRefresh: null,
			serverHost: null,
		};
	}

	const store = authStore as HermesAuthStore;
	const providerState = store.providers?.[CODEX_PROVIDER_ID];
	if (!providerState || typeof providerState !== "object") {
		return {
			authenticated: false,
			authMode: null,
			lastRefresh: null,
			serverHost: null,
		};
	}

	const state = providerState as {
		tokens?: { access_token?: string };
		auth_mode?: string;
		last_refresh?: string;
	};
	const accessToken = state.tokens?.access_token?.trim();
	if (!accessToken) {
		return {
			authenticated: false,
			authMode: null,
			lastRefresh: null,
			serverHost: null,
		};
	}

	return {
		authenticated: true,
		authMode: state.auth_mode ?? "chatgpt",
		lastRefresh: state.last_refresh ?? null,
		serverHost: null,
	};
}

export function buildHermesAuthJsonWriteCommand(content: string): string {
	const encoded = Buffer.from(content, "utf8").toString("base64");

	return [
		`sudo mkdir -p ${managedComposeVolumeHome}/.hermes`,
		`printf '%s' '${encoded}' | base64 -d | sudo tee ${HERMES_AUTH_JSON_PATH} > /dev/null`,
		`sudo chmod 600 ${HERMES_AUTH_JSON_PATH}`,
		`sudo chown hermes:hermes ${HERMES_AUTH_JSON_PATH} 2>/dev/null || true`,
	].join(" && ");
}

export async function readHermesAuthJson(ssh: NodeSSH): Promise<string> {
	const result = await ssh.execCommand(
		`sudo cat ${HERMES_AUTH_JSON_PATH} 2>/dev/null || true`,
	);
	return result.stdout ?? "";
}

export async function writeHermesAuthJson(
	ssh: NodeSSH,
	content: string,
): Promise<void> {
	const result = await ssh.execCommand(
		buildHermesAuthJsonWriteCommand(content),
	);
	if (result.code !== 0) {
		throw new Error(result.stderr || "Failed to write Hermes auth.json");
	}
}
