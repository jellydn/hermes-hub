import { buildHermesComposeContent } from "../compose";
import { getDb } from "../db";
import { auditLogs } from "../db/schema";
import { type SshAuthMethod, SshConnectError, withSshConnection } from "../ssh";
import { emitInstallEvent } from "./sse-stream";

export type InstallStep = {
	id: string;
	progress: number;
	message: string;
	command: string;
};

export type ServerCredentialRecord = {
	id: string;
	host: string;
	port: number;
	username: string;
	authMethod: string;
	encryptedCredential: string | null;
	storeCredential: boolean;
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
		command:
			"sudo apt-get update -y && sudo apt-get install -y ca-certificates curl gnupg && curl -fsSL https://get.docker.com | sudo sh",
	},
	{
		id: "install-compose",
		progress: 30,
		message: "Installing Docker Compose",
		command:
			"sudo apt-get install -y docker-compose-plugin && sudo systemctl enable --now docker",
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
		command: "cd ~/hermes && sudo docker compose pull",
	},
	{
		id: "start-containers",
		progress: 100,
		message: "Starting Hermes containers",
		command: "cd ~/hermes && sudo docker compose up -d",
	},
];

export async function runInstallWorkflow(input: InstallWorkflowInput) {
	const logLines: string[] = [];

	try {
		await emitInstallEvent({
			installId: input.installId,
			serverId: input.serverId,
			runId: input.runId,
			step: installSteps[0]?.id ?? "pending",
			progress: 0,
			message: "Install queued",
			status: "pending",
			logLines,
		});

		await withSshConnection(
			{
				host: input.server.host,
				port: input.server.port,
				username: input.server.username,
				authMethod: input.authMethod,
				credential: input.credential,
			},
			async (ssh) => {
				for (const step of installSteps) {
					const result = await ssh.execCommand(step.command);

					if (result.code !== 0) {
						throw new Error(result.stderr || `Command failed: ${step.id}`);
					}

					const detail = result.stdout.trim();
					await emitInstallEvent({
						installId: input.installId,
						serverId: input.serverId,
						runId: input.runId,
						step: step.id,
						progress: step.progress,
						message: detail ? `${step.message}: ${detail}` : step.message,
						status: step.progress === 100 ? "succeeded" : "running",
						logLines,
					});
				}
			},
		);

		await getDb()
			.insert(auditLogs)
			.values({
				userId: input.userId,
				action: "server.install.succeeded",
				details: {
					serverId: input.serverId,
					installId: input.installId,
				},
				ipAddress: input.ipAddress,
			});
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
			logLines,
		});

		await getDb()
			.insert(auditLogs)
			.values({
				userId: input.userId,
				action: "server.install.failed",
				details: {
					serverId: input.serverId,
					installId: input.installId,
					error: message,
				},
				ipAddress: input.ipAddress,
			});
	}
}

function normalizeInstallError(error: unknown) {
	if (error instanceof SshConnectError) {
		return error.message;
	}

	return error instanceof Error ? error.message : "Install failed";
}

function buildComposeWriteCommand() {
	return `cat <<'EOF' > ~/hermes/docker-compose.yml\n${buildHermesComposeContent()}\nEOF`;
}
