import type { ApiProviderId } from "#/lib/ai-providers";
import { getAiProviderOption } from "#/lib/ai-providers";
import {
	COMMAND_CODE_GENERATE_URL,
	collectCommandCodeCompletion,
	getCommandCodeProxyBaseUrl,
	getCommandCodeRequestHeaders,
	normalizeBearerToken,
	transformOpenAIToCommandCode,
} from "../commandcode/proxy";

export class ProviderConnectionError extends Error {
	constructor(
		message: string,
		readonly code: "invalid_api_key" | "connection_failed",
	) {
		super(message);
		this.name = "ProviderConnectionError";
	}
}

export async function verifyProviderConnection(input: {
	provider: ApiProviderId;
	apiKey: string;
	baseUrl?: string;
}) {
	const request = createProviderTestRequest(input);

	let response: Response;

	try {
		response = await fetch(request.url, request.init);
	} catch {
		throw new ProviderConnectionError("Connection failed", "connection_failed");
	}

	if (response.ok) {
		return;
	}

	if (response.status === 401 || response.status === 403) {
		throw new ProviderConnectionError("Invalid API key", "invalid_api_key");
	}

	throw new ProviderConnectionError("Connection failed", "connection_failed");
}

export async function verifyOpenAiCompatibleConnection(input: {
	apiKey: string;
	baseUrl: string;
}) {
	const baseUrl = input.baseUrl.endsWith("/")
		? `${input.baseUrl}models`
		: `${input.baseUrl}/models`;

	let response: Response;

	try {
		response = await fetch(baseUrl, {
			method: "GET",
			headers: {
				Authorization: `Bearer ${input.apiKey}`,
			},
			signal: AbortSignal.timeout(5000),
		});
	} catch {
		throw new ProviderConnectionError("Connection failed", "connection_failed");
	}

	if (response.ok) {
		return;
	}

	if (response.status === 401 || response.status === 403) {
		throw new ProviderConnectionError("Invalid API key", "invalid_api_key");
	}

	throw new ProviderConnectionError("Connection failed", "connection_failed");
}

/**
 * Verifies a Command Code Coding Plan key by sending a minimal chat
 * completion request through the Hermes Hub proxy — the same path the
 * deployed gateway uses. This catches proxy-level issues (HTTPS
 * middleware, header forwarding, URL reachability) that a direct test
 * would miss.
 *
 * Falls back to a direct call to api.commandcode.ai when the proxy URL
 * is not configured (e.g. local dev without BETTER_AUTH_URL).
 */
export async function verifyCommandCodeConnection(input: {
	apiKey: string;
	model: string;
}) {
	const proxyBaseUrl = tryResolveProxyBaseUrl();
	if (proxyBaseUrl) {
		await verifyCommandCodeViaProxy(input.apiKey, input.model, proxyBaseUrl);
		return;
	}

	await verifyCommandCodeDirect(input.apiKey, input.model);
}

function tryResolveProxyBaseUrl(): string | null {
	try {
		return getCommandCodeProxyBaseUrl();
	} catch {
		return null;
	}
}

/**
 * Tests the full proxy path: sends an OpenAI-format chat completion to
 * the proxy, which transforms and forwards it to api.commandcode.ai.
 * This is the same code path the deployed gateway uses.
 */
async function verifyCommandCodeViaProxy(
	apiKey: string,
	model: string,
	proxyBaseUrl: string,
) {
	const url = proxyBaseUrl.endsWith("/")
		? `${proxyBaseUrl}chat/completions`
		: `${proxyBaseUrl}/chat/completions`;

	let response: Response;
	try {
		response = await fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${normalizeBearerToken(apiKey)}`,
			},
			body: JSON.stringify({
				model,
				messages: [{ role: "user", content: "Reply with OK." }],
				max_tokens: 1,
				stream: false,
			}),
			signal: AbortSignal.timeout(30_000),
		});
	} catch {
		throw new ProviderConnectionError(
			"Could not reach the Command Code proxy. Verify BETTER_AUTH_URL is publicly accessible.",
			"connection_failed",
		);
	}

	if (response.ok) {
		return;
	}

	if (response.status === 401 || response.status === 403) {
		throw new ProviderConnectionError("Invalid API key", "invalid_api_key");
	}

	if (response.status === 426) {
		throw new ProviderConnectionError(
			"Proxy requires HTTPS. Check that BETTER_AUTH_URL uses https:// and the reverse proxy sets x-forwarded-proto: https.",
			"connection_failed",
		);
	}

	throw new ProviderConnectionError("Connection failed", "connection_failed");
}

/**
 * Direct test against api.commandcode.ai — used as a fallback when the
 * proxy URL is not configured (e.g. local dev without BETTER_AUTH_URL).
 */
async function verifyCommandCodeDirect(apiKey: string, model: string) {
	const body = transformOpenAIToCommandCode({
		model,
		messages: [{ role: "user", content: "Reply with OK." }],
		max_tokens: 1,
		stream: true,
	});

	let response: Response;
	try {
		response = await fetch(COMMAND_CODE_GENERATE_URL, {
			method: "POST",
			headers: getCommandCodeRequestHeaders(
				`Bearer ${normalizeBearerToken(apiKey)}`,
			),
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(30_000),
		});
	} catch {
		throw new ProviderConnectionError("Connection failed", "connection_failed");
	}

	if (!response.ok) {
		if (response.status === 401 || response.status === 403) {
			throw new ProviderConnectionError("Invalid API key", "invalid_api_key");
		}
		throw new ProviderConnectionError("Connection failed", "connection_failed");
	}
	if (!response.body) {
		throw new ProviderConnectionError("Connection failed", "connection_failed");
	}

	try {
		await collectCommandCodeCompletion(response.body, { model });
	} catch {
		throw new ProviderConnectionError("Connection failed", "connection_failed");
	}
}

function createProviderTestRequest(input: {
	provider: ApiProviderId;
	apiKey: string;
	baseUrl?: string;
}): { url: string; init: RequestInit } {
	if (input.provider === "anthropic") {
		return {
			url: "https://api.anthropic.com/v1/models",
			init: {
				method: "GET",
				headers: {
					"anthropic-version": "2023-06-01",
					"x-api-key": input.apiKey,
				},
			},
		};
	}

	if (input.provider === "openrouter") {
		return {
			url: "https://openrouter.ai/api/v1/models",
			init: {
				method: "GET",
				headers: {
					Authorization: `Bearer ${input.apiKey}`,
				},
			},
		};
	}

	const option = getAiProviderOption(input.provider);
	if (option?.requiresBaseUrl) {
		const baseUrl = input.baseUrl || option.defaultBaseUrl || "";
		const url = baseUrl.endsWith("/")
			? `${baseUrl}models`
			: `${baseUrl}/models`;
		const headers: Record<string, string> = {};
		if (input.apiKey) {
			headers.Authorization = `Bearer ${input.apiKey}`;
		}
		return {
			url,
			init: {
				method: "GET",
				headers,
			},
		};
	}

	return {
		url: "https://api.openai.com/v1/models",
		init: {
			method: "GET",
			headers: {
				Authorization: `Bearer ${input.apiKey}`,
			},
		},
	};
}
