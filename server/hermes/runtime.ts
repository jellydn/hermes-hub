import { randomUUID } from "node:crypto";
import type { NodeSSH } from "node-ssh";

import {
	hermesAgentSourcePathInContainer,
	hermesContainerName,
	hermesImageRepository,
	hermesWebUiAgentHostDir,
	hermesWebUiContainerGid,
	hermesWebUiContainerUid,
	managedComposeVolumeHome,
} from "../constants";
import { shellQuote } from "../ssh";
import {
	formatHermesCliImportFailure,
	formatWebUiContainerFailureDetails,
} from "./diagnostics-formatting";

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

async function isHermesContainerRunning(ssh: NodeSSH): Promise<boolean> {
	return isContainerRunning(ssh, hermesContainerName);
}

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
			`Hermes Web UI did not become reachable on 127.0.0.1:${port} within ${WEB_UI_STARTUP_ATTEMPTS * WEB_UI_STARTUP_DELAY_SECONDS} seconds.`,
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

// ── Gateway lifecycle ────────────────────────────────────────────

export async function restartGateway(ssh: NodeSSH): Promise<string> {
	const result = await ssh.execCommand(
		"cd ~/hermes && sudo docker compose restart hermes",
	);
	if (result.code !== 0) {
		throw new Error(result.stderr || "Failed to restart Hermes");
	}
	return result.stdout.trim();
}

export async function updateGateway(ssh: NodeSSH): Promise<string> {
	const result = await ssh.execCommand(
		"cd ~/hermes && sudo docker compose pull hermes && sudo docker compose up -d --no-deps hermes",
	);
	if (result.code !== 0) {
		throw new Error(result.stderr || "Failed to update Hermes");
	}
	return result.stdout.trim();
}

const DOCKER_TAG_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/;

export function isValidDockerTag(tag: string): boolean {
	return DOCKER_TAG_PATTERN.test(tag);
}

export async function rollbackGateway(
	ssh: NodeSSH,
	imageTag: string,
): Promise<string> {
	const tag = imageTag.trim() || "latest";
	if (!isValidDockerTag(tag)) {
		throw new Error(`Invalid image tag: ${tag}`);
	}

	const command = [
		"cd ~/hermes",
		`sudo docker pull ${hermesImageRepository}:${tag}`,
		`sudo sed -i.bak 's|image: ${hermesImageRepository}:.*|image: ${hermesImageRepository}:${tag}|' docker-compose.yml`,
		"sudo docker compose up -d --no-deps hermes",
	].join(" && ");

	const result = await ssh.execCommand(command);
	if (result.code !== 0) {
		throw new Error(result.stderr || "Failed to roll back Hermes");
	}
	return result.stdout.trim();
}

// ── Provider config ──────────────────────────────────────────────

export async function setProviderModel(
	ssh: NodeSSH,
	model: string,
): Promise<void> {
	await ssh.execCommand("sleep 2");

	const result = await ssh.execCommand(
		`sudo docker exec hermes hermes config set model ${shellQuote(model)}`,
	);
	if (result.code !== 0) {
		throw new Error(result.stderr || "Failed to set model inside Hermes");
	}
}

// ── Telegram pairing ─────────────────────────────────────────────

export async function runPairingCommand(
	ssh: NodeSSH,
	pythonCode: string,
	env: Record<string, string> = {},
): Promise<unknown> {
	const envArgs = Object.entries(env)
		.map(([key, value]) => `-e ${shellQuote(`${key}=${value}`)}`)
		.join(" ");

	const repairOwnership = [
		"docker exec hermes sh -lc",
		shellQuote(
			'chown -R hermes:hermes "$HERMES_HOME/platforms/pairing" 2>/dev/null || chown -R hermes:hermes /opt/data/platforms/pairing 2>/dev/null || true',
		),
	].join(" ");

	const pairingCommand = [
		"docker exec --user hermes",
		envArgs,
		"hermes python -c",
		shellQuote(pythonCode),
	]
		.filter(Boolean)
		.join(" ");

	const command = `${repairOwnership} && ${pairingCommand}`;

	const result = await ssh.execCommand(command, {
		execOptions: { timeout: 30_000 },
	});
	if (result.code !== 0) {
		throw new Error(result.stderr || "Hermes pairing command failed.");
	}

	try {
		return JSON.parse(result.stdout.trim()) as unknown;
	} catch {
		throw new Error(`Invalid pairing response: ${result.stdout.slice(0, 200)}`);
	}
}

// ── Compose deployment ───────────────────────────────────────────

const COMPOSE_SERVICE_NAME = /^[A-Za-z0-9_.-]+$/;

export function assertValidComposeServiceNames(serviceNames: string[]): void {
	for (const name of serviceNames) {
		if (!COMPOSE_SERVICE_NAME.test(name)) {
			throw new Error(`Invalid compose service name: ${name}`);
		}
	}
}

export async function writeComposeFile(
	ssh: NodeSSH,
	content: string,
): Promise<void> {
	const delimiter = `HERMES_COMPOSE_${randomUUID()}`;
	const writeCmd = `cat > ~/hermes/docker-compose.yml << '${delimiter}'\n${content}\n${delimiter}`;

	const result = await ssh.execCommand(writeCmd);
	if (result.code !== 0) {
		throw new Error(result.stderr || "Failed to write docker-compose.yml");
	}
}

export function buildComposeUpCommand(options?: {
	services?: string[];
	pull?: boolean;
	forceRecreate?: boolean;
}): string {
	const services = options?.services ?? [];
	if (services.length > 0) {
		assertValidComposeServiceNames(services);
	}

	const parts = ["cd ~/hermes"];

	if (options?.pull && services.length > 0) {
		parts.push(`sudo docker compose pull ${services.join(" ")}`);
	}

	const upCommand = ["sudo docker compose up", "-d"];
	if (options?.forceRecreate) {
		upCommand.push("--force-recreate");
	}
	if (services.length > 0) {
		upCommand.push("--no-deps", ...services);
	}
	parts.push(upCommand.join(" "));

	return parts.join(" && ");
}

export async function composeUp(
	ssh: NodeSSH,
	options?: {
		services?: string[];
		pull?: boolean;
		forceRecreate?: boolean;
	},
): Promise<void> {
	const command = buildComposeUpCommand(options);
	const result = await ssh.execCommand(command);
	if (result.code !== 0) {
		throw new Error(result.stderr || "docker compose up failed");
	}
}

export async function composePull(ssh: NodeSSH): Promise<void> {
	const result = await ssh.execCommand(
		"cd ~/hermes && sudo docker compose pull",
	);
	if (result.code !== 0) {
		throw new Error(result.stderr || "docker compose pull failed");
	}
}

export async function composeUpAll(ssh: NodeSSH): Promise<void> {
	const result = await ssh.execCommand(
		"cd ~/hermes && sudo docker compose up -d",
	);
	if (result.code !== 0) {
		throw new Error(result.stderr || "docker compose up failed");
	}
}
