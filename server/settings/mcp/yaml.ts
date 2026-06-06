import { parse, stringify } from "yaml";

import type { StoredMcpServerRecord } from "./records";
import { decryptSecretMap } from "./secrets";

export function buildMcpServerEntry(
	record: StoredMcpServerRecord,
): Record<string, unknown> {
	const entry: Record<string, unknown> = {
		enabled: record.enabled,
	};

	if (record.transport === "stdio") {
		if (record.command) {
			entry.command = record.command;
		}
		if (record.args.length > 0) {
			entry.args = record.args;
		}

		const env = decryptSecretMap(record.encryptedEnv);
		if (Object.keys(env).length > 0) {
			entry.env = env;
		}
	} else {
		if (record.url) {
			entry.url = record.url;
		}

		const headers = decryptSecretMap(record.encryptedHeaders);
		if (Object.keys(headers).length > 0) {
			entry.headers = headers;
		}
	}

	if (record.timeout != null) {
		entry.timeout = record.timeout;
	}
	if (record.connectTimeout != null) {
		entry.connect_timeout = record.connectTimeout;
	}
	if (record.supportsParallelToolCalls) {
		entry.supports_parallel_tool_calls = true;
	}

	const tools: Record<string, unknown> = {};
	if (record.toolsInclude.length > 0) {
		tools.include = record.toolsInclude;
	}
	if (record.toolsExclude.length > 0) {
		tools.exclude = record.toolsExclude;
	}
	if (!record.toolsResources) {
		tools.resources = false;
	}
	if (!record.toolsPrompts) {
		tools.prompts = false;
	}
	if (Object.keys(tools).length > 0) {
		entry.tools = tools;
	}

	return entry;
}

export function buildMcpServersConfig(
	records: StoredMcpServerRecord[],
): Record<string, Record<string, unknown>> {
	const config: Record<string, Record<string, unknown>> = {};

	for (const record of records) {
		config[record.name] = buildMcpServerEntry(record);
	}

	return config;
}

export class InvalidHermesConfigYamlError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "InvalidHermesConfigYamlError";
	}
}

export function parseExistingHermesConfigYaml(
	existingYaml: string,
): Record<string, unknown> {
	const trimmed = existingYaml.trim();
	if (!trimmed) {
		return {};
	}

	let parsed: unknown;
	try {
		parsed = parse(trimmed);
	} catch {
		throw new InvalidHermesConfigYamlError(
			"Existing Hermes config.yaml is not valid YAML.",
		);
	}

	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		throw new InvalidHermesConfigYamlError(
			"Existing Hermes config.yaml must be a YAML object.",
		);
	}

	return parsed as Record<string, unknown>;
}

export function mergeHermesConfigMcpServers(
	existingYaml: string,
	mcpServersConfig: Record<string, Record<string, unknown>>,
): string {
	const config = parseExistingHermesConfigYaml(existingYaml);
	config.mcp_servers = mcpServersConfig;

	return `${stringify(config).trim()}\n`;
}
