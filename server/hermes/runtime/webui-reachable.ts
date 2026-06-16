import type { NodeSSH } from "node-ssh";

import {
	formatHermesCliImportFailure,
	formatWebUiContainerFailureDetails,
} from "../diagnostics-formatting";
import {
	isWebUiContainerRunning,
	readWebUiContainerDiagnostics,
	WEB_UI_CONTAINER,
} from "./container-status";

// ── Web UI reachability ──────────────────────────────────────────

const WEB_UI_STARTUP_ATTEMPTS = 60;
const WEB_UI_STARTUP_DELAY_SECONDS = 5;

export async function assertWebUiReachable(
	ssh: NodeSSH,
	port: number,
): Promise<void> {
	let attempt = 1;
	while (attempt <= WEB_UI_STARTUP_ATTEMPTS) {
		// react-doctor-disable-next-line react-doctor/async-await-in-loop
		const outcome = await probeWebUiStartup(ssh, port, attempt);
		if (outcome === "ready") {
			await assertHermesCliImportable(ssh);
			return;
		}

		// react-doctor-disable-next-line react-doctor/async-await-in-loop
		await ssh.execCommand(`sleep ${WEB_UI_STARTUP_DELAY_SECONDS}`);
		attempt += 1;
	}
}

type WebUiStartupProbeOutcome = "ready" | "retry";

async function probeWebUiStartup(
	ssh: NodeSSH,
	port: number,
	attempt: number,
): Promise<WebUiStartupProbeOutcome> {
	if (!(await isWebUiContainerRunning(ssh))) {
		if (attempt === WEB_UI_STARTUP_ATTEMPTS) {
			throw await buildContainerFailureError(ssh);
		}
		return "retry";
	}

	const probeResult = await ssh.execCommand(
		`curl -sf -o /dev/null --max-time 5 http://127.0.0.1:${port}/login`,
	);
	if (probeResult.code === 0) {
		return "ready";
	}

	if (attempt === WEB_UI_STARTUP_ATTEMPTS) {
		throw new Error(
			`Hermes Web UI did not become reachable on 127.0.0.1:${port} within ${
				WEB_UI_STARTUP_ATTEMPTS * WEB_UI_STARTUP_DELAY_SECONDS
			} seconds.`,
		);
	}

	return "retry";
}

async function buildContainerFailureError(ssh: NodeSSH): Promise<Error> {
	const { state, logs } = await readWebUiContainerDiagnostics(ssh);
	const details = formatWebUiContainerFailureDetails(state, logs);
	return new Error(
		details
			? `Hermes Web UI container is not running. ${details}`
			: "Hermes Web UI container is not running after docker compose up.",
	);
}

const WEB_UI_HERMES_CLI_IMPORT_COMMAND = `sudo docker exec ${WEB_UI_CONTAINER} /app/venv/bin/python -c "import hermes_cli"`;

async function assertHermesCliImportable(ssh: NodeSSH): Promise<void> {
	const importResult = await ssh.execCommand(WEB_UI_HERMES_CLI_IMPORT_COMMAND);
	if (importResult.code === 0) {
		return;
	}

	const { state, logs } = await readWebUiContainerDiagnostics(ssh);
	const importError =
		importResult.stderr?.trim() || importResult.stdout?.trim() || undefined;
	throw new Error(formatHermesCliImportFailure(importError, state, logs));
}
