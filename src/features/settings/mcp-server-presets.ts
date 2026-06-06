import type {
	McpServerSummary,
	McpTransport,
} from "../../../server/settings/mcp/config";

export type McpPresetConfigurableField = {
	id: string;
	label: string;
	description: string;
	defaultValue: string;
};

export type McpServerPreset = {
	id: string;
	name: string;
	title: string;
	description: string;
	transport: McpTransport;
	command: string;
	args: string[];
	configurableFields?: McpPresetConfigurableField[];
};

export const MCP_SERVER_PRESETS: McpServerPreset[] = [
	{
		id: "memory",
		name: "memory",
		title: "Memory",
		description:
			"Persist facts and context across Hermes sessions with the official Memory server.",
		transport: "stdio",
		command: "npx",
		args: ["-y", "@modelcontextprotocol/server-memory"],
	},
	{
		id: "sequential-thinking",
		name: "sequential-thinking",
		title: "Sequential Thinking",
		description:
			"Break complex tasks into step-by-step reasoning with the Sequential Thinking server.",
		transport: "stdio",
		command: "npx",
		args: ["-y", "@modelcontextprotocol/server-sequential-thinking"],
	},
	{
		id: "filesystem",
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
	},
];

export function getMcpServerPreset(
	presetId: string,
): McpServerPreset | undefined {
	return MCP_SERVER_PRESETS.find((preset) => preset.id === presetId);
}

export function findSavedPresetServer(
	servers: McpServerSummary[],
	preset: McpServerPreset,
): McpServerSummary | undefined {
	return servers.find((server) => server.name === preset.name);
}
