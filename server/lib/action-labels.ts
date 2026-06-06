export type ServerActionType = "restart" | "update" | "rollback";

export function formatActionLabel(action: ServerActionType): string {
	if (action === "update") {
		return "Update Hermes";
	}
	if (action === "rollback") {
		return "Rollback";
	}
	return "Restart Hermes";
}
