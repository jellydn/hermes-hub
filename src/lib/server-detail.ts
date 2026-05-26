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
	};
	install: {
		status: string;
		version: string | null;
		updatedAt: string;
	} | null;
	actionHistory: ServerActionHistoryItem[];
	rollbackTarget: string | null;
};
