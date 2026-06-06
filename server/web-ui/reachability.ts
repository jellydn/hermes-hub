import type { NodeSSH } from "node-ssh";

const WEB_UI_STARTUP_ATTEMPTS = 15;
const WEB_UI_STARTUP_DELAY_SECONDS = 2;

export function formatWebUiProxyError(error: unknown, port: number) {
	const message = error instanceof Error ? error.message : String(error);
	if (
		message.includes("Connection refused") ||
		message.includes("Channel open failure")
	) {
		return `Hermes Web UI is not reachable on the server (127.0.0.1:${port}). The container may have stopped or was removed during a later deploy. Open the server page and run Redeploy Web UI.`;
	}

	return message;
}

export async function assertWebUiReachable(ssh: NodeSSH, port: number) {
	for (let attempt = 1; attempt <= WEB_UI_STARTUP_ATTEMPTS; attempt += 1) {
		const containerResult = await ssh.execCommand(
			"docker ps --filter name=hermes-webui --filter status=running --format '{{.Names}}'",
		);
		if (!containerResult.stdout?.trim().includes("hermes-webui")) {
			const logsResult = await ssh.execCommand(
				"docker logs hermes-webui --tail 20 2>&1",
			);
			const logs = logsResult.stdout?.trim() || logsResult.stderr?.trim();
			throw new Error(
				logs
					? `Hermes Web UI container is not running. Recent logs: ${logs.slice(0, 400)}`
					: "Hermes Web UI container is not running after docker compose up.",
			);
		}

		const probeResult = await ssh.execCommand(
			`curl -sf -o /dev/null --max-time 5 http://127.0.0.1:${port}/login`,
		);
		if (probeResult.code === 0) {
			return;
		}

		if (attempt < WEB_UI_STARTUP_ATTEMPTS) {
			await ssh.execCommand(`sleep ${WEB_UI_STARTUP_DELAY_SECONDS}`);
		}
	}

	throw new Error(
		`Hermes Web UI did not become reachable on 127.0.0.1:${port} within ${WEB_UI_STARTUP_ATTEMPTS * WEB_UI_STARTUP_DELAY_SECONDS} seconds.`,
	);
}
