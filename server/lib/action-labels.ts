export type ServerActionType = "restart" | "update" | "rollback";

export type SettingsDeployActionType = "mcp" | "agent_skills" | "persona";

export type LogActionType = ServerActionType | SettingsDeployActionType;

export function formatActionLabel(action: LogActionType): string {
	if (action === "update") {
		return "Update Hermes";
	}
	if (action === "rollback") {
		return "Rollback";
	}
	if (action === "mcp") {
		return "MCP servers";
	}
	if (action === "agent_skills") {
		return "Agent skills";
	}
	if (action === "persona") {
		return "Persona";
	}
	return "Restart Hermes";
}
