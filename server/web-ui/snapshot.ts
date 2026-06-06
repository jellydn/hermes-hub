import type {
	ServerWebUiDeployStatus,
	ServerWebUiSnapshot,
} from "../../shared/contracts/server-web-ui";

import type { ServerWebUiRecord } from "./records";
import { getWebUiProxyPath } from "./records";

const DEPLOY_STATUSES = new Set<ServerWebUiDeployStatus>([
	"idle",
	"deploying",
	"succeeded",
	"failed",
]);

function normalizeDeployStatus(value: string): ServerWebUiDeployStatus {
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
		deployStartedAt: record.deployStartedAt?.toISOString() ?? null,
		updatedAt: record.updatedAt.toISOString(),
	};
}
