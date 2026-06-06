export type ServerActionType = "restart" | "update" | "rollback";

export type ServerActionResult = "succeeded" | "failed";

export type ServerActionHistoryItem = {
	id: string;
	action: ServerActionType;
	result: ServerActionResult;
	createdAt: string;
	message: string;
	imageRef: string | null;
};

export function formatActionLabel(action: ServerActionType): string {
	if (action === "update") {
		return "Update Hermes";
	}
	if (action === "rollback") {
		return "Rollback";
	}
	return "Restart Hermes";
}

export type ServerWebUiDeployStatus =
	| "idle"
	| "deploying"
	| "succeeded"
	| "failed";

export type ServerWebUiSnapshot = {
	enabled: boolean;
	port: number;
	proxyPath: string;
	deployStatus: ServerWebUiDeployStatus;
	deployError: string | null;
	updatedAt: string;
};

export type ServerDetailUpdater =
	| ServerDetailSnapshot
	| ((prev: ServerDetailSnapshot) => ServerDetailSnapshot);

export type ServerDetailChangeHandler = (detail: ServerDetailUpdater) => void;

export type ServerDetailSnapshot = {
	server: {
		id: string;
		label: string;
		host: string;
		port: number;
		username: string;
		authMethod: string;
		status: string;
		osName: string | null;
		osVersion: string | null;
		architecture: string | null;
		supportLevel: "supported" | "untested" | null;
	};
	install: {
		status: string;
		version: string | null;
		updatedAt: string;
	} | null;
	actionHistory: ServerActionHistoryItem[];
	rollbackTarget: string | null;
	webUi: ServerWebUiSnapshot | null;
};
