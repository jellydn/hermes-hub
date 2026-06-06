import {
	type SecretKeyInput,
	toSecretKeySummaries,
	validateNewSecretEntries,
} from "./secrets";
import type { EncryptedSecretMap } from "./types";

export type McpTransport = "stdio" | "http";

export type McpServerSummary = {
	id: string;
	name: string;
	transport: McpTransport;
	enabled: boolean;
	command: string | null;
	args: string[];
	url: string | null;
	env: ReturnType<typeof toSecretKeySummaries>;
	headers: ReturnType<typeof toSecretKeySummaries>;
	toolsInclude: string[];
	toolsExclude: string[];
	toolsResources: boolean;
	toolsPrompts: boolean;
	timeout: number | null;
	connectTimeout: number | null;
	supportsParallelToolCalls: boolean;
	createdAt: string;
	updatedAt: string;
};

export type McpServerRequest = {
	name?: string;
	transport?: McpTransport;
	enabled?: boolean;
	command?: string;
	args?: string[];
	url?: string;
	env?: SecretKeyInput[];
	headers?: SecretKeyInput[];
	toolsInclude?: string[];
	toolsExclude?: string[];
	toolsResources?: boolean;
	toolsPrompts?: boolean;
	timeout?: number | null;
	connectTimeout?: number | null;
	supportsParallelToolCalls?: boolean;
};

const MCP_SERVER_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]*$/;

export function isValidMcpServerName(name: string): boolean {
	return MCP_SERVER_NAME_PATTERN.test(name);
}

function parseStringList(value: unknown): string[] {
	if (!Array.isArray(value)) {
		return [];
	}

	return value
		.filter((item): item is string => typeof item === "string")
		.map((item) => item.trim())
		.filter(Boolean);
}

function parseSecretKeyInputs(value: unknown): SecretKeyInput[] {
	if (!Array.isArray(value)) {
		return [];
	}

	return value
		.filter(
			(item): item is { key?: unknown; value?: unknown } =>
				typeof item === "object" && item !== null,
		)
		.map((item) => ({
			key: typeof item.key === "string" ? item.key : "",
			value: typeof item.value === "string" ? item.value : "",
		}))
		.filter((item) => item.key.trim().length > 0);
}

function parseOptionalPositiveInt(
	value: unknown,
	label: string,
): { ok: true; value: number | null } | { ok: false; error: string } {
	if (value === undefined || value === null || value === "") {
		return { ok: true, value: null };
	}

	if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
		return { ok: false, error: `${label} must be a positive integer.` };
	}

	return { ok: true, value };
}

export type ParsedMcpServerFields = {
	name: string;
	transport: McpTransport;
	enabled: boolean;
	command: string | null;
	args: string[];
	url: string | null;
	env: SecretKeyInput[];
	headers: SecretKeyInput[];
	toolsInclude: string[];
	toolsExclude: string[];
	toolsResources: boolean;
	toolsPrompts: boolean;
	timeout: number | null;
	connectTimeout: number | null;
	supportsParallelToolCalls: boolean;
};

export function parseStoredTransport(transport: string): McpTransport {
	if (transport === "stdio" || transport === "http") {
		return transport;
	}

	throw new Error(`Invalid MCP transport stored: ${transport}`);
}

export function parseMcpServerCreateBody(payload: unknown) {
	return parseMcpServerBody(payload, { requireAllFields: true });
}

export function parseMcpServerUpdateBody(
	existing: {
		name: string;
		transport: string;
		enabled: boolean;
		command: string | null;
		args: string[];
		url: string | null;
		toolsInclude: string[];
		toolsExclude: string[];
		toolsResources: boolean;
		toolsPrompts: boolean;
		timeout: number | null;
		connectTimeout: number | null;
		supportsParallelToolCalls: boolean;
	},
	payload: unknown,
): { ok: true; data: ParsedMcpServerFields } | { ok: false; error: string } {
	if (!payload || typeof payload !== "object") {
		return { ok: false, error: "Request body is required." };
	}

	const body = payload as McpServerRequest;

	return parseMcpServerBody({
		name: body.name !== undefined ? body.name : existing.name,
		transport:
			body.transport !== undefined
				? body.transport
				: parseStoredTransport(existing.transport),
		enabled: body.enabled !== undefined ? body.enabled : existing.enabled,
		command:
			body.command !== undefined
				? body.command
				: (existing.command ?? undefined),
		args: body.args !== undefined ? body.args : existing.args,
		url: body.url !== undefined ? body.url : (existing.url ?? undefined),
		env: body.env,
		headers: body.headers,
		toolsInclude:
			body.toolsInclude !== undefined
				? body.toolsInclude
				: existing.toolsInclude,
		toolsExclude:
			body.toolsExclude !== undefined
				? body.toolsExclude
				: existing.toolsExclude,
		toolsResources:
			body.toolsResources !== undefined
				? body.toolsResources
				: existing.toolsResources,
		toolsPrompts:
			body.toolsPrompts !== undefined
				? body.toolsPrompts
				: existing.toolsPrompts,
		timeout: body.timeout !== undefined ? body.timeout : existing.timeout,
		connectTimeout:
			body.connectTimeout !== undefined
				? body.connectTimeout
				: existing.connectTimeout,
		supportsParallelToolCalls:
			body.supportsParallelToolCalls !== undefined
				? body.supportsParallelToolCalls
				: existing.supportsParallelToolCalls,
	});
}

export function parseMcpServerBody(
	payload: unknown,
	options?: { requireAllFields?: boolean },
): { ok: true; data: ParsedMcpServerFields } | { ok: false; error: string } {
	if (!payload || typeof payload !== "object") {
		return { ok: false, error: "Request body is required." };
	}

	const body = payload as McpServerRequest;
	const requireAllFields = options?.requireAllFields ?? false;

	const name = typeof body.name === "string" ? body.name.trim() : "";
	if (requireAllFields && !name) {
		return { ok: false, error: "Server name is required." };
	}
	if (name && !isValidMcpServerName(name)) {
		return {
			ok: false,
			error:
				"Server name must start with a letter and use only letters, numbers, underscores, or hyphens.",
		};
	}

	const transport = body.transport;
	if (requireAllFields && transport !== "stdio" && transport !== "http") {
		return { ok: false, error: "Choose stdio or HTTP transport." };
	}
	if (
		transport !== undefined &&
		transport !== "stdio" &&
		transport !== "http"
	) {
		return { ok: false, error: "Choose stdio or HTTP transport." };
	}

	const resolvedTransport = transport ?? "stdio";
	const command = typeof body.command === "string" ? body.command.trim() : null;
	const url = typeof body.url === "string" ? body.url.trim() : null;

	if (requireAllFields || resolvedTransport === "stdio") {
		if (resolvedTransport === "stdio" && !command) {
			return { ok: false, error: "Command is required for stdio servers." };
		}
	}

	if (requireAllFields || resolvedTransport === "http") {
		if (resolvedTransport === "http") {
			if (!url) {
				return { ok: false, error: "URL is required for HTTP servers." };
			}

			try {
				const parsedUrl = new URL(url);
				if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
					return { ok: false, error: "URL must use http or https." };
				}
			} catch {
				return { ok: false, error: "URL must be a valid http or https URL." };
			}
		}
	}

	const timeout = parseOptionalPositiveInt(body.timeout, "Timeout");
	if (!timeout.ok) {
		return timeout;
	}

	const connectTimeout = parseOptionalPositiveInt(
		body.connectTimeout,
		"Connect timeout",
	);
	if (!connectTimeout.ok) {
		return connectTimeout;
	}

	const env = parseSecretKeyInputs(body.env);
	const headers = parseSecretKeyInputs(body.headers);

	if (requireAllFields) {
		const envValidation = validateNewSecretEntries(env, "Environment variable");
		if (!envValidation.ok) {
			return envValidation;
		}

		const headerValidation = validateNewSecretEntries(headers, "Header");
		if (!headerValidation.ok) {
			return headerValidation;
		}
	}

	return {
		ok: true,
		data: {
			name,
			transport: resolvedTransport,
			enabled: body.enabled !== false,
			command,
			args: parseStringList(body.args),
			url,
			env,
			headers,
			toolsInclude: parseStringList(body.toolsInclude),
			toolsExclude: parseStringList(body.toolsExclude),
			toolsResources: body.toolsResources !== false,
			toolsPrompts: body.toolsPrompts !== false,
			timeout: timeout.value,
			connectTimeout: connectTimeout.value,
			supportsParallelToolCalls: body.supportsParallelToolCalls === true,
		},
	};
}

export function toMcpServerSummary(record: {
	id: string;
	name: string;
	transport: string;
	enabled: boolean;
	command: string | null;
	args: string[];
	url: string | null;
	encryptedEnv: EncryptedSecretMap;
	encryptedHeaders: EncryptedSecretMap;
	toolsInclude: string[];
	toolsExclude: string[];
	toolsResources: boolean;
	toolsPrompts: boolean;
	timeout: number | null;
	connectTimeout: number | null;
	supportsParallelToolCalls: boolean;
	createdAt: Date;
	updatedAt: Date;
}): McpServerSummary {
	return {
		id: record.id,
		name: record.name,
		transport: parseStoredTransport(record.transport),
		enabled: record.enabled,
		command: record.command,
		args: record.args,
		url: record.url,
		env: toSecretKeySummaries(record.encryptedEnv),
		headers: toSecretKeySummaries(record.encryptedHeaders),
		toolsInclude: record.toolsInclude,
		toolsExclude: record.toolsExclude,
		toolsResources: record.toolsResources,
		toolsPrompts: record.toolsPrompts,
		timeout: record.timeout,
		connectTimeout: record.connectTimeout,
		supportsParallelToolCalls: record.supportsParallelToolCalls,
		createdAt: record.createdAt.toISOString(),
		updatedAt: record.updatedAt.toISOString(),
	};
}
