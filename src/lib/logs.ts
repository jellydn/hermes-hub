export type InstallLogEntry = {
	id: string;
	serverLabel: string;
	status: string;
	step: string;
	createdAt: string;
	updatedAt: string;
	lines: string[];
};

export type ActionLogEntry = {
	id: string;
	serverLabel: string;
	action: "restart" | "update" | "rollback";
	result: "succeeded" | "failed";
	createdAt: string;
	message: string;
};

export type LogsSnapshot = {
	installLogs: InstallLogEntry[];
	actionLogs: ActionLogEntry[];
};
