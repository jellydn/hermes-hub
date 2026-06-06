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

function readStaleDeployThreshold(): number {
	const envValue = process.env.STALE_DEPLOY_THRESHOLD_MS;
	if (envValue) {
		const parsed = Number(envValue);
		if (!Number.isNaN(parsed) && parsed > 0) {
			return parsed;
		}
	}

	return 10 * 60 * 1000; // 10 minutes default
}

const STALE_DEPLOY_THRESHOLD_MS = readStaleDeployThreshold();

function normalizeDeployStatus(value: string): ServerWebUiDeployStatus {
	if (DEPLOY_STATUSES.has(value as ServerWebUiDeployStatus)) {
		return value as ServerWebUiDeployStatus;
	}

	return "idle";
}

export function isStaleDeploy(deployStartedAt: Date | null): boolean {
	if (!deployStartedAt) {
		return true;
	}

	return Date.now() - deployStartedAt.getTime() > STALE_DEPLOY_THRESHOLD_MS;
}

export function buildWebUiSnapshot(
	serverId: string,
	record: ServerWebUiRecord,
): ServerWebUiSnapshot {
	const deployStatus = normalizeDeployStatus(record.deployStatus);
	const isStale =
		deployStatus === "deploying" && isStaleDeploy(record.deployStartedAt);

	return {
		enabled: record.enabled,
		port: record.port,
		proxyPath: getWebUiProxyPath(serverId),
		deployStatus: isStale ? "failed" : deployStatus,
		deployError: isStale
			? "Web UI deploy timed out. The HermesHub process may have restarted during setup."
			: record.deployError,
		deployStartedAt: record.deployStartedAt?.toISOString() ?? null,
		updatedAt: record.updatedAt.toISOString(),
	};
}
