import type { NodeSSH } from "node-ssh";

const REMOTE_PORT_UNREACHABLE_MARKERS = [
	"Connection refused",
	"Channel open failure",
] as const;

const WEB_UI_UNREACHABLE_PROXY_MESSAGE =
	"Hermes Web UI is not reachable on the server (127.0.0.1:{port}). The container may have stopped or was removed during a later deploy. Open the server page and run Redeploy Web UI.";

const WEB_UI_CONTAINER_NAME = "hermes-webui";
const WEB_UI_STARTUP_ATTEMPTS = 60;
const WEB_UI_STARTUP_DELAY_SECONDS = 5;

export function isRemotePortUnreachable(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);
	return REMOTE_PORT_UNREACHABLE_MARKERS.some((marker) =>
		message.includes(marker),
	);
}

export function formatWebUiProxyError(error: unknown, port: number) {
	if (isRemotePortUnreachable(error)) {
		return WEB_UI_UNREACHABLE_PROXY_MESSAGE.replace("{port}", String(port));
	}

	return error instanceof Error ? error.message : String(error);
}

async function readWebUiContainerDiagnostics(ssh: NodeSSH) {
	const [stateResult, logsResult] = await Promise.all([
		ssh.execCommand(
			`sudo docker inspect ${WEB_UI_CONTAINER_NAME} --format '{{.State.Status}} exit={{.State.ExitCode}} error={{.State.Error}}' 2>&1`,
		),
		ssh.execCommand(`sudo docker logs ${WEB_UI_CONTAINER_NAME} --tail 40 2>&1`),
	]);

	const state = stateResult.stdout?.trim() || stateResult.stderr?.trim();
	const logs = logsResult.stdout?.trim() || logsResult.stderr?.trim();
	return { state, logs };
}

async function buildContainerFailureError(ssh: NodeSSH) {
	const { state, logs } = await readWebUiContainerDiagnostics(ssh);
	const details = [state, logs].filter(Boolean).join(". Recent logs: ");
	return new Error(
		details
			? `Hermes Web UI container is not running. ${details.slice(0, 600)}`
			: "Hermes Web UI container is not running after docker compose up.",
	);
}

async function isWebUiContainerRunning(ssh: NodeSSH) {
	const containerResult = await ssh.execCommand(
		`sudo docker ps --filter name=^/${WEB_UI_CONTAINER_NAME}$ --filter status=running --format '{{.Names}}'`,
	);
	return (
		containerResult.stdout?.trim().includes(WEB_UI_CONTAINER_NAME) ?? false
	);
}

export async function assertWebUiReachable(ssh: NodeSSH, port: number) {
	for (let attempt = 1; attempt <= WEB_UI_STARTUP_ATTEMPTS; attempt += 1) {
		if (!(await isWebUiContainerRunning(ssh))) {
			if (attempt === WEB_UI_STARTUP_ATTEMPTS) {
				throw await buildContainerFailureError(ssh);
			}

			await ssh.execCommand(`sleep ${WEB_UI_STARTUP_DELAY_SECONDS}`);
			continue;
		}

		const probeResult = await ssh.execCommand(
			`curl -sf -o /dev/null --max-time 5 http://127.0.0.1:${port}/login`,
		);
		if (probeResult.code === 0) {
			return;
		}

		if (attempt === WEB_UI_STARTUP_ATTEMPTS) {
			throw new Error(
				`Hermes Web UI did not become reachable on 127.0.0.1:${port} within ${WEB_UI_STARTUP_ATTEMPTS * WEB_UI_STARTUP_DELAY_SECONDS} seconds.`,
			);
		}

		await ssh.execCommand(`sleep ${WEB_UI_STARTUP_DELAY_SECONDS}`);
	}
}
