import type { NodeSSH } from "node-ssh";

import { hermesContainerName } from "../../constants";

// ── Container names ──────────────────────────────────────────────

export { hermesContainerName };
export const WEB_UI_CONTAINER = "hermes-webui";

// ── Shared diagnostics ───────────────────────────────────────────

export async function isContainerRunning(
	ssh: NodeSSH,
	containerName: string,
): Promise<boolean> {
	const result = await ssh.execCommand(
		`sudo docker ps --filter name=^/${containerName}$ --filter status=running --format '{{.Names}}'`,
	);
	return result.stdout?.trim().includes(containerName) ?? false;
}

export async function readContainerDiagnostics(
	ssh: NodeSSH,
	containerName: string,
): Promise<{ state: string; logs: string }> {
	const tailLines = 80;

	const [stateResult, logsResult] = await Promise.all([
		ssh.execCommand(
			`sudo docker inspect ${containerName} --format '{{.State.Status}} exit={{.State.ExitCode}} error={{.State.Error}}' 2>&1`,
		),
		ssh.execCommand(
			`sudo docker logs ${containerName} --tail ${tailLines} 2>&1`,
		),
	]);

	const state = stateResult.stdout?.trim() || stateResult.stderr?.trim();
	const logs = logsResult.stdout?.trim() || logsResult.stderr?.trim();
	return { state, logs };
}

// ── Web UI diagnostics ───────────────────────────────────────────

export async function isWebUiContainerRunning(ssh: NodeSSH): Promise<boolean> {
	return isContainerRunning(ssh, WEB_UI_CONTAINER);
}

export async function readWebUiContainerDiagnostics(
	ssh: NodeSSH,
): Promise<{ state: string; logs: string }> {
	return readContainerDiagnostics(ssh, WEB_UI_CONTAINER);
}

export async function isHermesContainerRunning(ssh: NodeSSH): Promise<boolean> {
	return isContainerRunning(ssh, hermesContainerName);
}
