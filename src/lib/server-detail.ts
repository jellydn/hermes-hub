export type { ServerActionType } from "../../server/lib/action-labels";
export { formatActionLabel } from "../../server/lib/action-labels";

import type { ServerActionType } from "../../server/lib/action-labels";

export type ServerActionResult = "succeeded" | "failed";

export type ServerActionHistoryItem = {
	id: string;
	action: ServerActionType;
	result: ServerActionResult;
	createdAt: string;
	message: string;
	imageRef: string | null;
};

import type {
	ServerWebUiDeployStatus,
	ServerWebUiSnapshot,
} from "../../shared/contracts/server-web-ui";

export type { ServerWebUiDeployStatus, ServerWebUiSnapshot };

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
