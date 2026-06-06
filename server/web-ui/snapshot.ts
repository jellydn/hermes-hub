import type { ServerWebUiSnapshot } from "../../shared/contracts/server-web-ui";
import { normalizeDeployStatus } from "./deploy-status";
import type { ServerWebUiRecord } from "./records";
import { getWebUiProxyPath } from "./records";

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
