import type { Context } from "hono";
import type { NodeSSH } from "node-ssh";
import { getAiProviderOption, isAiProviderId } from "../src/lib/ai-providers";
import { decryptApiServerKey, decryptSecret } from "./crypto";
import { getDb } from "./db";
import { getClientIp } from "./lib/get-client-ip";
import { insertAuditLog } from "./lib/insert-audit-log";
import {
	decryptApiKey,
	getLatestProviderRecord,
	getTelegramDeployInfo,
} from "./providers/records";
import { buildManagedComposeContent } from "./server-compose";
import { type SshAuthMethod, shellQuote, withSshConnection } from "./ssh";
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
	preSshCommands?: (ssh: NodeSSH) => Promise<void>;
	extraSshCommands?: (ssh: NodeSSH) => Promise<void>;
	expectedFingerprint?: string;
};

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
				"cd ~/hermes && sudo docker compose up -d --force-recreate",
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

	const composeContent = await buildManagedComposeContent({
		userId: session.user.id,
		serverId: sshCtx.serverId,
		apiServerKey: decryptedApiServerKey,
	});

	try {
		await deployComposeViaSsh({
			host: sshCtx.server.host,
			port: sshCtx.server.port,
			username: sshCtx.server.username,
			authMethod: sshCtx.authMethod,
			credential: sshCtx.credential,
			composeContent,
			expectedFingerprint: sshCtx.server.hostKeyFingerprint ?? undefined,
			extraSshCommands: async (ssh) => {
				await ssh.execCommand("sleep 2");

				const configResult = await ssh.execCommand(
					`docker exec hermes hermes config set model ${shellQuote(providerRecord.model)}`,
				);
				if (configResult.code !== 0) {
					throw new Error(
						configResult.stderr || "Failed to set model inside Hermes",
					);
				}
			},
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
