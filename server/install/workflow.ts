import type { NodeSSH } from "node-ssh";

import { buildHermesComposeContent } from "../compose";
import { getDb } from "../db";
import { composePull, composeUpAll } from "../hermes/runtime";
import { insertAuditLog } from "../lib/insert-audit-log";
import { type SshAuthMethod, SshConnectError, withSshConnection } from "../ssh";
import { emitInstallEvent } from "./sse-stream";

export type InstallStep = {
	id: string;
	progress: number;
	message: string;
	command: string;
	runner?: (ssh: NodeSSH) => Promise<void>;
};

export type ServerCredentialRecord = {
	id: string;
	host: string;
	port: number;
	username: string;
	authMethod: string;
	encryptedCredential: string | null;
	storeCredential: boolean;
	hostKeyFingerprint: string | null;
};

type InstallWorkflowInput = {
	server: ServerCredentialRecord;
	authMethod: SshAuthMethod;
	credential: string;
	userId: string;
	installId: string;
	serverId: string;
	runId: string;
	ipAddress: string | null;
};

export const installSteps: InstallStep[] = [
	{
		id: "install-docker",
		progress: 15,
		message: "Installing Docker",
		command: buildDockerInstallCommand(),
	},
	{
		id: "verify-docker",
		progress: 30,
		message: "Verifying Docker installation",
		command: "docker compose version && sudo systemctl enable --now docker",
	},
	{
		id: "create-hermes-directory",
		progress: 45,
		message: "Creating Hermes workspace",
		command: "mkdir -p ~/hermes",
	},
	{
		id: "write-compose-file",
		progress: 60,
		message: "Writing docker-compose.yml",
		command: buildComposeWriteCommand(),
	},
	{
		id: "pull-image",
		progress: 80,
		message: "Pulling Hermes image",
		command: "compose_pull",
		runner: composePull,
	},
	{
		id: "start-containers",
		progress: 100,
		message: "Starting Hermes containers",
		command: "compose_up_all",
		runner: composeUpAll,
	},
];

export const installStepIds = installSteps.map((step) => step.id);

export async function runInstallWorkflow(input: InstallWorkflowInput) {
	try {
		await executeInstallWorkflow(input);
	} catch (error) {
		const message = normalizeInstallError(error);

		await emitInstallEvent({
			installId: input.installId,
			serverId: input.serverId,
			runId: input.runId,
			step: "failed",
			progress: 100,
			message: "Install failed",
			status: "failed",
			error: message,
		});

		await insertAuditLog(getDb(), {
			userId: input.userId,
			action: "server.install.failed",
			serverId: input.serverId,
			details: {
				serverId: input.serverId,
				installId: input.installId,
				error: message,
			},
			ipAddress: input.ipAddress,
		});
	}
}

async function executeInstallWorkflow(input: InstallWorkflowInput) {
	// react-doctor-disable-next-line react-doctor/async-parallel
	await emitInstallEvent({
		installId: input.installId,
		serverId: input.serverId,
		runId: input.runId,
		step: installSteps[0]?.id ?? "pending",
		progress: 0,
		message: "Install queued",
		status: "pending",
	});

	await withSshConnection(
		{
			host: input.server.host,
			port: input.server.port,
			username: input.server.username,
			authMethod: input.authMethod,
			credential: input.credential,
			expectedFingerprint: input.server.hostKeyFingerprint ?? undefined,
		},
		async (ssh) => {
			await runInstallStepsOverSsh(ssh, input);
		},
	);

	await insertAuditLog(getDb(), {
		userId: input.userId,
		action: "server.install.succeeded",
		serverId: input.serverId,
		details: {
			serverId: input.serverId,
			installId: input.installId,
		},
		ipAddress: input.ipAddress,
	});
}

async function runInstallStepsOverSsh(
	ssh: NodeSSH,
	input: InstallWorkflowInput,
) {
	let index = 0;
	while (index < installSteps.length) {
		const step = installSteps[index];
		if (!step) {
			break;
		}

		// react-doctor-disable-next-line react-doctor/async-await-in-loop
		await runOneInstallStep(ssh, step, input);
		index += 1;
	}
}

async function runOneInstallStep(
	ssh: NodeSSH,
	step: InstallStep,
	_input: InstallWorkflowInput,
) {
	let detail = "";

	if (step.runner) {
		await step.runner(ssh);
	} else {
		const result = await ssh.execCommand(step.command);
		if (result.code !== 0) {
			throw new Error(result.stderr || `Command failed: ${step.id}`);
		}
		detail = result.stdout.trim();
	}

	await emitInstallEvent({
		installId: _input.installId,
		serverId: _input.serverId,
		runId: _input.runId,
		step: step.id,
		progress: step.progress,
		message: detail ? `${step.message}: ${detail}` : step.message,
		status: step.progress === 100 ? "succeeded" : "running",
	});
}

function normalizeInstallError(error: unknown) {
	if (error instanceof SshConnectError) {
		return error.message;
	}

	return error instanceof Error ? error.message : "Install failed";
}

export function buildDockerInstallCommand() {
	const aptRepo = (distro: "ubuntu" | "debian") => `
if [ "$ID" = "${distro}" ]; then
  sudo install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/${distro}/gpg | sudo gpg --yes --dearmor -o /etc/apt/keyrings/docker.gpg
  sudo chmod a+r /etc/apt/keyrings/docker.gpg
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null <<DOCKER_EOF
deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/${distro} $(. /etc/os-release && echo "$VERSION_CODENAME") stable
DOCKER_EOF
  sudo apt-get update
  sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  exit 0
fi`;

	const fallback = `
echo "WARNING: unsupported distro '$ID' for Docker apt repo; falling back to get.docker.com" >&2
curl -fsSL https://get.docker.com | sudo sh
sudo systemctl enable --now docker`;

	return [
		"if command -v docker >/dev/null 2>&1; then echo 'Docker already installed'; exit 0; fi",
		". /etc/os-release",
		aptRepo("ubuntu"),
		aptRepo("debian"),
		fallback.trim(),
	].join("\n");
}

function buildComposeWriteCommand() {
	return `cat <<'EOF' > ~/hermes/docker-compose.yml\n${buildHermesComposeContent()}\nEOF`;
}
