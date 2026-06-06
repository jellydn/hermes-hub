import type {
	McpServerSummary,
	McpTransport,
} from "../../../server/settings/mcp/config";

import type { McpServerPreset } from "./mcp-server-presets";

export type SecretRow = {
	id: string;
	key: string;
	value: string;
	valueLast4: string | null;
	hasStoredValue: boolean;
};

export type McpFormState = {
	name: string;
	transport: McpTransport;
	enabled: boolean;
	command: string;
	argsText: string;
	url: string;
	envRows: SecretRow[];
	headerRows: SecretRow[];
	toolsIncludeText: string;
	toolsExcludeText: string;
	toolsResources: boolean;
	toolsPrompts: boolean;
	timeout: string;
	connectTimeout: string;
	supportsParallelToolCalls: boolean;
};

export const mcpInputClassName =
	"w-full rounded-[1.25rem] border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--sea-ink)] outline-none transition focus:border-[var(--sea-ink-soft)]";

function createSecretRowId() {
	return crypto.randomUUID();
}

export function emptySecretRow(): SecretRow {
	return {
		id: createSecretRowId(),
		key: "",
		value: "",
		valueLast4: null,
		hasStoredValue: false,
	};
}

export function createEmptyFormState(): McpFormState {
	return {
		name: "",
		transport: "stdio",
		enabled: true,
		command: "",
		argsText: "",
		url: "",
		envRows: [emptySecretRow()],
		headerRows: [emptySecretRow()],
		toolsIncludeText: "",
		toolsExcludeText: "",
		toolsResources: true,
		toolsPrompts: true,
		timeout: "",
		connectTimeout: "",
		supportsParallelToolCalls: false,
	};
}

export function parseLines(text: string): string[] {
	const lines: string[] = [];

	for (const line of text.split("\n")) {
		const trimmed = line.trim();
		if (trimmed) {
			lines.push(trimmed);
		}
	}

	return lines;
}

function toSecretRows(entries: McpServerSummary["env"]): SecretRow[] {
	if (entries.length === 0) {
		return [emptySecretRow()];
	}

	return entries.map((entry) => ({
		id: createSecretRowId(),
		key: entry.key,
		value: "",
		valueLast4: entry.valueLast4,
		hasStoredValue: entry.hasStoredValue,
	}));
}

export type McpPresetOverrides = Record<string, string>;

function resolvePresetArgs(
	preset: McpServerPreset,
	overrides?: McpPresetOverrides,
): string[] {
	if (preset.buildArgs) {
		return preset.buildArgs(overrides ?? {});
	}

	return [...preset.args];
}

export function formStateFromPreset(
	preset: McpServerPreset,
	overrides?: McpPresetOverrides,
): McpFormState {
	return {
		name: preset.name,
		transport: preset.transport,
		enabled: true,
		command: preset.command,
		argsText: resolvePresetArgs(preset, overrides).join("\n"),
		url: "",
		envRows: [emptySecretRow()],
		headerRows: [emptySecretRow()],
		toolsIncludeText: "",
		toolsExcludeText: "",
		toolsResources: true,
		toolsPrompts: true,
		timeout: "",
		connectTimeout: "",
		supportsParallelToolCalls: false,
	};
}

export function formStateFromServer(server: McpServerSummary): McpFormState {
	return {
		name: server.name,
		transport: server.transport,
		enabled: server.enabled,
		command: server.command ?? "",
		argsText: server.args.join("\n"),
		url: server.url ?? "",
		envRows: toSecretRows(server.env),
		headerRows: toSecretRows(server.headers),
		toolsIncludeText: server.toolsInclude.join("\n"),
		toolsExcludeText: server.toolsExclude.join("\n"),
		toolsResources: server.toolsResources,
		toolsPrompts: server.toolsPrompts,
		timeout: server.timeout?.toString() ?? "",
		connectTimeout: server.connectTimeout?.toString() ?? "",
		supportsParallelToolCalls: server.supportsParallelToolCalls,
	};
}

function secretRowsToInputs(rows: SecretRow[]) {
	const inputs: Array<{ key: string; value: string }> = [];

	for (const row of rows) {
		const key = row.key.trim();
		if (key) {
			inputs.push({ key, value: row.value });
		}
	}

	return inputs;
}

function getTimeoutValidationError(
	value: string,
	label: string,
): string | null {
	const trimmed = value.trim();
	if (!trimmed) {
		return null;
	}

	const parsed = Number(trimmed);
	if (!Number.isInteger(parsed) || parsed <= 0) {
		return `${label} must be a positive integer.`;
	}

	return null;
}

export function getFormValidationError(form: McpFormState): string | null {
	const timeoutError = getTimeoutValidationError(form.timeout, "Timeout");
	if (timeoutError) {
		return timeoutError;
	}

	return getTimeoutValidationError(form.connectTimeout, "Connect timeout");
}

function parseOptionalTimeout(value: string): number | null {
	const trimmed = value.trim();
	if (!trimmed) {
		return null;
	}

	return Number(trimmed);
}

export function buildRequestBody(form: McpFormState) {
	return {
		name: form.name.trim(),
		transport: form.transport,
		enabled: form.enabled,
		command: form.command.trim(),
		args: parseLines(form.argsText),
		url: form.url.trim(),
		env: secretRowsToInputs(form.envRows),
		headers: secretRowsToInputs(form.headerRows),
		toolsInclude: parseLines(form.toolsIncludeText),
		toolsExclude: parseLines(form.toolsExcludeText),
		toolsResources: form.toolsResources,
		toolsPrompts: form.toolsPrompts,
		timeout: parseOptionalTimeout(form.timeout),
		connectTimeout: parseOptionalTimeout(form.connectTimeout),
		supportsParallelToolCalls: form.supportsParallelToolCalls,
	};
}
