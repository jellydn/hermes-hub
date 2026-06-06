import {
	CODEX_DEFAULT_POLL_INTERVAL_SECONDS,
	CODEX_OAUTH_CLIENT_ID,
	CODEX_OAUTH_DEVICE_API_BASE,
	CODEX_OAUTH_ISSUER,
	CODEX_OAUTH_TOKEN_URL,
	CODEX_VERIFICATION_URL,
} from "./constants";

export type CodexDeviceCodeStart = {
	deviceAuthId: string;
	userCode: string;
	verificationUrl: string;
	pollIntervalSeconds: number;
	expiresAt: string;
};

export type CodexOAuthTokens = {
	access_token: string;
	refresh_token: string;
	id_token?: string;
	expires_in?: number;
};

type UserCodeResponse = {
	device_auth_id: string;
	user_code?: string;
	usercode?: string;
	interval?: string | number;
};

type CodeSuccessResponse = {
	authorization_code: string;
	code_verifier: string;
};

export class CodexDeviceFlowError extends Error {
	constructor(
		message: string,
		readonly code:
			| "request_failed"
			| "poll_pending"
			| "poll_error"
			| "timeout"
			| "exchange_failed",
	) {
		super(message);
		this.name = "CodexDeviceFlowError";
	}
}

export async function requestCodexDeviceCode(
	fetchImpl: typeof fetch = fetch,
): Promise<CodexDeviceCodeStart> {
	const response = await fetchImpl(
		`${CODEX_OAUTH_DEVICE_API_BASE}/deviceauth/usercode`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json",
			},
			body: JSON.stringify({ client_id: CODEX_OAUTH_CLIENT_ID }),
		},
	);

	if (!response.ok) {
		throw new CodexDeviceFlowError(
			`Device code request failed with status ${response.status}.`,
			"request_failed",
		);
	}

	const payload = (await response.json()) as UserCodeResponse;
	const userCode = payload.user_code ?? payload.usercode;
	if (!userCode || !payload.device_auth_id) {
		throw new CodexDeviceFlowError(
			"Device code response was missing required fields.",
			"request_failed",
		);
	}

	const rawInterval =
		typeof payload.interval === "string"
			? Number.parseInt(payload.interval, 10)
			: Number(payload.interval ?? CODEX_DEFAULT_POLL_INTERVAL_SECONDS);

	const pollIntervalSeconds = Math.max(
		3,
		Number.isNaN(rawInterval)
			? CODEX_DEFAULT_POLL_INTERVAL_SECONDS
			: rawInterval,
	);

	return {
		deviceAuthId: payload.device_auth_id,
		userCode,
		verificationUrl: CODEX_VERIFICATION_URL,
		pollIntervalSeconds,
		expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
	};
}

export async function pollCodexDeviceAuthorization(
	input: {
		deviceAuthId: string;
		userCode: string;
	},
	fetchImpl: typeof fetch = fetch,
): Promise<CodeSuccessResponse> {
	const response = await fetchImpl(
		`${CODEX_OAUTH_DEVICE_API_BASE}/deviceauth/token`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json",
			},
			body: JSON.stringify({
				device_auth_id: input.deviceAuthId,
				user_code: input.userCode,
			}),
		},
	);

	if (response.status === 403 || response.status === 404) {
		throw new CodexDeviceFlowError(
			"Waiting for ChatGPT authorization.",
			"poll_pending",
		);
	}

	if (!response.ok) {
		throw new CodexDeviceFlowError(
			`Device auth polling failed with status ${response.status}.`,
			"poll_error",
		);
	}

	return (await response.json()) as CodeSuccessResponse;
}

export async function exchangeCodexAuthorizationCode(
	input: {
		authorizationCode: string;
		codeVerifier: string;
	},
	fetchImpl: typeof fetch = fetch,
): Promise<CodexOAuthTokens> {
	const redirectUri = `${CODEX_OAUTH_ISSUER}/deviceauth/callback`;
	const response = await fetchImpl(CODEX_OAUTH_TOKEN_URL, {
		method: "POST",
		headers: {
			"Content-Type": "application/x-www-form-urlencoded",
		},
		body: new URLSearchParams({
			grant_type: "authorization_code",
			client_id: CODEX_OAUTH_CLIENT_ID,
			code: input.authorizationCode,
			code_verifier: input.codeVerifier,
			redirect_uri: redirectUri,
		}).toString(),
	});

	if (!response.ok) {
		throw new CodexDeviceFlowError(
			`Token exchange failed with status ${response.status}.`,
			"exchange_failed",
		);
	}

	const tokens = (await response.json()) as CodexOAuthTokens;
	if (!tokens.access_token?.trim()) {
		throw new CodexDeviceFlowError(
			"Token exchange did not return an access token.",
			"exchange_failed",
		);
	}

	return tokens;
}
