import type {
	McpServerSummary,
	McpTransport,
} from "../../../server/settings/mcp/config";

import type { McpPresetOverrides } from "./mcp-form-state";

export type McpPresetConfigurableField = {
	id: string;
	label: string;
	description: string;
	defaultValue: string;
};

export type McpServerPreset = {
	name: string;
	title: string;
	description: string;
	transport: McpTransport;
	command: string;
	args: string[];
	configurableFields?: McpPresetConfigurableField[];
	buildArgs?: (overrides: McpPresetOverrides) => string[];
};

export const MCP_SERVER_PRESETS: McpServerPreset[] = [
	{
		name: "memory",
		title: "Memory",
		description:
			"Persist facts and context across Hermes sessions with the official Memory server.",
		transport: "stdio",
		command: "npx",
		args: ["-y", "@modelcontextprotocol/server-memory"],
	},
	{
		name: "sequential-thinking",
		title: "Sequential Thinking",
		description:
			"Break complex tasks into step-by-step reasoning with the Sequential Thinking server.",
		transport: "stdio",
		command: "npx",
		args: ["-y", "@modelcontextprotocol/server-sequential-thinking"],
	},
	{
		name: "filesystem",
		title: "Filesystem",
		description:
			"Let Hermes read and write files in a single allowed directory on the VPS.",
		transport: "stdio",
		command: "npx",
		args: ["-y", "@modelcontextprotocol/server-filesystem", "/opt/data"],
		configurableFields: [
			{
				id: "allowedDirectory",
				label: "Allowed directory",
				description:
					"Absolute path on the VPS that the Filesystem server may access.",
				defaultValue: "/opt/data",
			},
		],
		buildArgs: (overrides) => [
			"-y",
			"@modelcontextprotocol/server-filesystem",
			overrides.allowedDirectory?.trim() || "/opt/data",
		],
	},
];

export function getMcpServerPreset(
	presetName: string,
): McpServerPreset | undefined {
	return MCP_SERVER_PRESETS.find((preset) => preset.name === presetName);
}

export function findSavedPresetServer(
	servers: McpServerSummary[],
	preset: McpServerPreset,
): McpServerSummary | undefined {
	return servers.find((server) => server.name === preset.name);
}
