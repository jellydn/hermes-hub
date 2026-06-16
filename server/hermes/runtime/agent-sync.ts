import type { NodeSSH } from "node-ssh";

import {
	hermesAgentSourcePathInContainer,
	hermesContainerName,
	hermesWebUiAgentHostDir,
	hermesWebUiContainerGid,
	hermesWebUiContainerUid,
	managedComposeVolumeHome,
} from "../../constants";
import { isHermesContainerRunning } from "./container-status";

// ── Web UI agent source sync ─────────────────────────────────────

export function buildWebUiAgentSourceSyncCommand(): string {
	return [
		`sudo mkdir -p ${managedComposeVolumeHome}/.hermes ${managedComposeVolumeHome}/.hermes/webui ${managedComposeVolumeHome}/workspace`,
		`sudo rm -rf ${hermesWebUiAgentHostDir}`,
		`sudo docker cp ${hermesContainerName}:${hermesAgentSourcePathInContainer} ${hermesWebUiAgentHostDir}`,
		`sudo chown -R ${hermesWebUiContainerUid}:${hermesWebUiContainerGid} ${managedComposeVolumeHome}/.hermes ${managedComposeVolumeHome}/workspace`,
	].join(" && ");
}

export async function syncAgentSourceForWebUi(ssh: NodeSSH): Promise<void> {
	const running = await isHermesContainerRunning(ssh);
	if (!running) {
		throw new Error(
			"Hermes container is not running. Install or restart Hermes before deploying the Web UI.",
		);
	}

	const sourceResult = await ssh.execCommand(
		`sudo docker exec ${hermesContainerName} test -d ${hermesAgentSourcePathInContainer}`,
	);
	if (sourceResult.code !== 0) {
		throw new Error(
			`Hermes agent source (${hermesAgentSourcePathInContainer}) is missing in the Hermes container.`,
		);
	}

	const syncResult = await ssh.execCommand(buildWebUiAgentSourceSyncCommand());
	if (syncResult.code !== 0) {
		throw new Error(
			syncResult.stderr || "Failed to sync Hermes agent source for the Web UI",
		);
	}
}
