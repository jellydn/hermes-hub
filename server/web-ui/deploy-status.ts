import type { ServerWebUiDeployStatus } from "../../shared/contracts/server-web-ui";

const DEPLOY_STATUSES = new Set<string>([
	"idle",
	"deploying",
	"succeeded",
	"failed",
]);

export function normalizeDeployStatus(value: string): ServerWebUiDeployStatus {
	if (DEPLOY_STATUSES.has(value)) {
		return value as ServerWebUiDeployStatus;
	}

	return "idle";
}
