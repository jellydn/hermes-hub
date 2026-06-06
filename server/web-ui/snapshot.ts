import type {
	ServerWebUiDeployStatus,
	ServerWebUiSnapshot,
} from "../../src/lib/server-detail";

import type { ServerWebUiRecord } from "./records";
import { getWebUiProxyPath } from "./records";

const DEPLOY_STATUSES = new Set<ServerWebUiDeployStatus>([
	"idle",
	"deploying",
	"succeeded",
	"failed",
]);

export function normalizeDeployStatus(value: string): ServerWebUiDeployStatus {
	if (DEPLOY_STATUSES.has(value as ServerWebUiDeployStatus)) {
		return value as ServerWebUiDeployStatus;
	}

	return "idle";
}

export function buildWebUiSnapshot(
	serverId: string,
	record: ServerWebUiRecord,
): ServerWebUiSnapshot {
	return {
		enabled: record.enabled,
		port: record.port,
		proxyPath: getWebUiProxyPath(serverId),
		deployStatus: normalizeDeployStatus(record.deployStatus),
		deployError: record.deployError,
		updatedAt: record.updatedAt.toISOString(),
	};
}
