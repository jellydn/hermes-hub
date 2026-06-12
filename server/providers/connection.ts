import type { ApiProviderId } from "#/lib/ai-providers";
import { getAiProviderOption } from "#/lib/ai-providers";

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
