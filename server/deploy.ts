import type { Context } from "hono";
import type { NodeSSH } from "node-ssh";
import { getAiProviderOption, isAiProviderId } from "../src/lib/ai-providers";
import { decryptApiServerKey, decryptSecret } from "./crypto";
import { getDb } from "./db";
import { getClientIp } from "./lib/get-client-ip";
import { insertAuditLog } from "./lib/insert-audit-log";
import { deployManagedCompose } from "./managed-compose-deploy";
import {
	decryptApiKey,
	getLatestProviderRecord,
	getTelegramDeployInfo,
} from "./providers/records";
import { type SshAuthMethod, withSshConnection } from "./ssh";
import {
	requireAuthSession,
	requireOwnedServerSshById,
} from "./web-ui/context";

type DeployComposeInput = {
	host: string;
	port: number;
	username: string;
	authMethod: SshAuthMethod;
	credential: string;
	composeContent: string;
	/** When set, only recreate these services so the Hermes gateway keeps running. */
	composeServices?: string[];
	preSshCommands?: (ssh: NodeSSH) => Promise<void>;
	extraSshCommands?: (ssh: NodeSSH) => Promise<void>;
	expectedFingerprint?: string;
};

export function buildComposeUpCommand(input?: { composeServices?: string[] }) {
	const command = ["cd ~/hermes && sudo docker compose up -d"];
	if (input?.composeServices?.length) {
		command.push("--no-deps", ...input.composeServices);
	}
	return command.join(" ");
}

export async function deployComposeViaSsh(input: DeployComposeInput) {
	const writeCmd = `cat > ~/hermes/docker-compose.yml << 'DOCKER_EOF'\n${input.composeContent}\nDOCKER_EOF`;

	await withSshConnection(
		{
			host: input.host,
			port: input.port,
			username: input.username,
			authMethod: input.authMethod,
			credential: input.credential,
			expectedFingerprint: input.expectedFingerprint,
		},
		async (ssh) => {
			if (input.preSshCommands) {
				await input.preSshCommands(ssh);
			}

			const writeResult = await ssh.execCommand(writeCmd);
			if (writeResult.code !== 0) {
				throw new Error(
					writeResult.stderr || "Failed to write docker-compose.yml",
				);
			}

			const restartResult = await ssh.execCommand(
				buildComposeUpCommand({ composeServices: input.composeServices }),
			);
			if (restartResult.code !== 0) {
				throw new Error(restartResult.stderr || "Failed to restart Hermes");
			}

			if (input.extraSshCommands) {
				await input.extraSshCommands(ssh);
			}
		},
	);
}

export async function deployProviderToHermes(context: Context) {
	const session = await requireAuthSession(context);
	if (session instanceof Response) {
		return session;
	}

	const db = getDb();
	const ipAddress = getClientIp(context);

	const providerRecord = await getLatestProviderRecord(session.user.id);
	if (!providerRecord || !isAiProviderId(providerRecord.provider)) {
		return context.json(
			{ error: "No provider config found. Save a provider first." },
			400,
		);
	}

	const telegramInfo = await getTelegramDeployInfo(session.user.id);
	if (!telegramInfo) {
		return context.json(
			{
				error:
					"No Hermes deployment found. Deploy a Telegram bot to a server first.",
			},
			400,
		);
	}

	const sshCtx = await requireOwnedServerSshById(
		context,
		telegramInfo.deployedServerId,
		session,
	);
	if (sshCtx instanceof Response) {
		return sshCtx;
	}

	try {
		decryptSecret(telegramInfo.botToken);
	} catch {
		return context.json({ error: "Failed to decrypt bot token." }, 500);
	}

	const decryptedApiKey = decryptApiKey(providerRecord.encryptedApiKey);
	if (providerRecord.encryptedApiKey && !decryptedApiKey) {
		return context.json({ error: "Failed to decrypt API key." }, 500);
	}

	const isKeyRequired = !getAiProviderOption(providerRecord.provider)
		?.requiresBaseUrl;
	if (isKeyRequired && !decryptedApiKey) {
		return context.json({ error: "API key is required." }, 400);
	}

	const decryptedApiServerKey = decryptApiServerKey(telegramInfo.apiServerKey);

	try {
		await deployManagedCompose({
			intent: "provider",
			userId: session.user.id,
			serverId: sshCtx.serverId,
			host: sshCtx.server.host,
			port: sshCtx.server.port,
			username: sshCtx.server.username,
			authMethod: sshCtx.authMethod,
			credential: sshCtx.credential,
			expectedFingerprint: sshCtx.server.hostKeyFingerprint ?? undefined,
			apiServerKey: decryptedApiServerKey,
			providerModel: providerRecord.model,
		});

		await insertAuditLog(db, {
			userId: session.user.id,
			action: "provider.deploy.succeeded",
			serverId: sshCtx.serverId,
			details: {
				provider: providerRecord.provider,
				model: providerRecord.model,
				serverId: sshCtx.serverId,
				serverHost: sshCtx.server.host,
			},
			ipAddress,
		});

		return context.json({
			status: "deployed",
			provider: providerRecord.provider,
			model: providerRecord.model,
			serverHost: sshCtx.server.host,
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : "Deploy failed";

		await insertAuditLog(db, {
			userId: session.user.id,
			action: "provider.deploy.failed",
			serverId: sshCtx.serverId,
			details: {
				provider: providerRecord.provider,
				model: providerRecord.model,
				serverId: sshCtx.serverId,
				error: message,
			},
			ipAddress,
		});

		return context.json({ error: `Deploy failed: ${message}` }, 502);
	}
}
