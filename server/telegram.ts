import crypto from "node:crypto";

import { and, desc, eq } from "drizzle-orm";
import type { Context } from "hono";
import { getAuthSession } from "./auth";
import { buildHermesComposeContent } from "./compose";
import { decryptApiServerKey, decryptSecret, encryptSecret } from "./crypto";
import { getDb } from "./db";
import { auditLogs, installs, servers, telegramConfigs } from "./db/schema";
import { getClientIp } from "./lib/get-client-ip";
import { getProviderEnvVars } from "./providers";
import { resolveServerSshConfig } from "./server-records";
import { type SshAuthMethod, withSshConnection } from "./ssh";

type TelegramConnectRequest = {
	botToken?: string;
};

type TelegramGetMeResponse = {
	ok: boolean;
	result?: {
		id: number;
		username?: string;
		first_name?: string;
	};
	description?: string;
};

export type TelegramConfigSummary = {
	botUsername: string;
	botTokenLast4: string | null;
	isActive: boolean;
	deployedServerHost: string | null;
};

type TelegramTestRequest = {
	message?: string;
};

class TelegramConnectionError extends Error {
	constructor(
		message: string,
		readonly code: "invalid_token" | "connection_failed",
	) {
		super(message);
		this.name = "TelegramConnectionError";
	}
}

export async function getCurrentTelegramConfig(userId: string) {
	const record = await getLatestTelegramRecord(userId);
	if (!record?.isActive) {
		return null;
	}

	let decryptedToken: string;
	try {
		decryptedToken = decryptSecret(record.botToken);
	} catch {
		decryptedToken = "";
	}

	return {
		botUsername: record.botUsername || "Connected bot",
		botTokenLast4: getTokenLast4(decryptedToken),
		isActive: true,
		deployedServerHost: record.deployedServerHost ?? null,
	} satisfies TelegramConfigSummary;
}

export async function connectTelegram(context: Context) {
	const session = await getAuthSession(context.req.raw.headers);
	if (!session) {
		return context.json({ error: "Unauthorized" }, 401);
	}

	let payload: TelegramConnectRequest;

	try {
		payload = await context.req.json<TelegramConnectRequest>();
	} catch {
		return context.json({ error: "Invalid JSON body" }, 400);
	}

	const botToken = payload.botToken?.trim() ?? "";
	if (!botToken) {
		return context.json({ error: "Bot token is required." }, 400);
	}

	let bot: { username: string; id: number };

	try {
		bot = await verifyTelegramToken(botToken);
	} catch (error) {
		if (error instanceof TelegramConnectionError) {
			return context.json(
				{ error: error.message },
				error.code === "invalid_token" ? 400 : 502,
			);
		}

		return context.json({ error: "Connection failed" }, 502);
	}

	const db = getDb();
	const ipAddress = getClientIp(context);

	try {
		await db
			.update(telegramConfigs)
			.set({ isActive: false })
			.where(eq(telegramConfigs.userId, session.user.id));

		await db.insert(telegramConfigs).values({
			userId: session.user.id,
			botToken: encryptSecret(botToken),
			botUsername: bot.username,
			isActive: true,
			deployedServerId: null,
			deployedServerHost: null,
			apiServerKey: null,
		});

		await db.insert(auditLogs).values({
			userId: session.user.id,
			action: "telegram.connected",
			details: {
				botUsername: bot.username,
				botId: bot.id,
			},
			ipAddress,
		});

		return context.json({
			telegram: {
				botUsername: bot.username,
				botTokenLast4: getTokenLast4(botToken),
				isActive: true,
				deployedServerHost: null,
			} satisfies TelegramConfigSummary,
		});
	} catch (error) {
		const message =
			error instanceof Error
				? error.message
				: "Unable to save Telegram settings";

		return context.json({ error: message }, 500);
	}
}

export async function disconnectTelegram(context: Context) {
	const session = await getAuthSession(context.req.raw.headers);
	if (!session) {
		return context.json({ error: "Unauthorized" }, 401);
	}

	const db = getDb();
	const ipAddress = getClientIp(context);
	const record = await getLatestTelegramRecord(session.user.id);

	if (!record?.isActive) {
		return context.json({ error: "Telegram bot is not connected." }, 400);
	}

	try {
		await db
			.update(telegramConfigs)
			.set({ isActive: false })
			.where(eq(telegramConfigs.userId, session.user.id));

		await db.insert(auditLogs).values({
			userId: session.user.id,
			action: "telegram.disconnected",
			details: {
				botUsername: record.botUsername,
			},
			ipAddress,
		});

		return context.json({ status: "disconnected" });
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Unable to disconnect Telegram";

		return context.json({ error: message }, 500);
	}
}

export async function deployTelegramToServer(context: Context) {
	const session = await getAuthSession(context.req.raw.headers);
	if (!session) {
		return context.json({ error: "Unauthorized" }, 401);
	}

	const db = getDb();
	const record = await getLatestTelegramRecord(session.user.id);
	if (!record?.isActive) {
		return context.json(
			{ error: "No active Telegram config. Connect a bot first." },
			400,
		);
	}

	let decryptedToken: string;
	try {
		decryptedToken = decryptSecret(record.botToken);
	} catch {
		return context.json({ error: "Failed to decrypt bot token." }, 500);
	}

	const ipAddress = getClientIp(context);

	const serverRecord = await findServerForDeploy(session.user.id);
	if (!serverRecord) {
		return context.json(
			{
				error:
					"No server with a successful Hermes install found. Install Hermes on a server first.",
			},
			400,
		);
	}

	let sshConfig: { authMethod: SshAuthMethod; credential: string };
	try {
		sshConfig = resolveServerSshConfig(serverRecord, session.session.id);
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Credential unavailable";
		return context.json({ error: message }, 400);
	}

	const apiServerKey = crypto.randomBytes(32).toString("hex");
	let providerEnvVars: Record<string, string> | undefined;
	try {
		const envVars = await getProviderEnvVars(session.user.id);
		providerEnvVars = envVars ?? undefined;
	} catch (error) {
		const message =
			error instanceof Error
				? error.message
				: "Failed to resolve provider config";

		await db.insert(auditLogs).values({
			userId: session.user.id,
			action: "telegram.deploy.failed",
			details: {
				serverId: serverRecord.id,
				error: message,
			},
			ipAddress,
		});

		return context.json({ error: `Deploy failed: ${message}` }, 502);
	}

	const composeContent = buildHermesComposeContent({
		apiServerKey,
		telegramBotToken: decryptedToken,
		providerEnvVars,
	});

	const writeCmd = `cat > ~/hermes/docker-compose.yml << 'DOCKER_EOF'\n${composeContent}\nDOCKER_EOF`;

	try {
		await withSshConnection(
			{
				host: serverRecord.host,
				port: serverRecord.port,
				username: serverRecord.username,
				...sshConfig,
			},
			async (ssh) => {
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
			},
		);

		await db.transaction(async (tx) => {
			await tx
				.update(telegramConfigs)
				.set({
					deployedServerId: serverRecord.id,
					deployedServerHost: serverRecord.host,
					apiServerKey: encryptSecret(apiServerKey),
				})
				.where(
					and(
						eq(telegramConfigs.userId, session.user.id),
						eq(telegramConfigs.isActive, true),
					),
				);

			await tx.insert(auditLogs).values({
				userId: session.user.id,
				action: "telegram.deployed",
				details: {
					serverId: serverRecord.id,
					serverHost: serverRecord.host,
				},
				ipAddress,
			});
		});

		return context.json({
			status: "deployed",
			serverHost: serverRecord.host,
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : "Deploy failed";

		await db.insert(auditLogs).values({
			userId: session.user.id,
			action: "telegram.deploy.failed",
			details: {
				serverId: serverRecord.id,
				error: message,
			},
			ipAddress,
		});

		return context.json({ error: `Deploy failed: ${message}` }, 502);
	}
}

export async function testTelegramBot(context: Context) {
	const session = await getAuthSession(context.req.raw.headers);
	if (!session) {
		return context.json({ error: "Unauthorized" }, 401);
	}

	let payload: TelegramTestRequest;
	try {
		payload = await context.req.json<TelegramTestRequest>();
	} catch {
		return context.json({ error: "Invalid JSON body" }, 400);
	}

	const message = payload.message?.trim();
	if (!message) {
		return context.json({ error: "Message is required." }, 400);
	}

	const record = await getLatestTelegramRecord(session.user.id);
	if (!record?.isActive) {
		return context.json(
			{ error: "No active Telegram config. Connect a bot first." },
			400,
		);
	}

	if (!record.apiServerKey || !record.deployedServerId) {
		return context.json(
			{
				error: "Bot token is not deployed to any server. Deploy it first.",
			},
			400,
		);
	}

	const decryptedApiServerKey = decryptApiServerKey(record.apiServerKey);

	const serverRecord = await findServerById(record.deployedServerId);
	if (!serverRecord) {
		return context.json({ error: "Deployed server not found." }, 404);
	}

	let sshConfig: { authMethod: SshAuthMethod; credential: string };
	try {
		sshConfig = resolveServerSshConfig(serverRecord, session.session.id);
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Credential unavailable";
		return context.json({ error: message }, 400);
	}

	const curlCommand = [
		`curl -s -X POST http://localhost:8642/v1/chat/completions`,
		`-H "Content-Type: application/json"`,
		`-H "Authorization: Bearer ${decryptedApiServerKey}"`,
		`-d '${JSON.stringify({
			model: "hermes-agent",
			messages: [{ role: "user", content: message }],
		}).replace(/'/g, "'\\''")}'`,
	].join(" \\\n  ");

	try {
		const result = await withSshConnection(
			{
				host: serverRecord.host,
				port: serverRecord.port,
				username: serverRecord.username,
				...sshConfig,
			},
			async (ssh) => {
				const execResult = await ssh.execCommand(curlCommand, {
					execOptions: { timeout: 120_000 },
				});

				if (execResult.code !== 0) {
					const stdout = execResult.stdout?.trim() || "";
					const stderr = execResult.stderr?.trim() || "";
					if (
						stderr.includes("Connection refused") ||
						stderr.includes("Could not resolve")
					) {
						throw new Error(
							"Hermes API server is not reachable. Make sure Hermes is running on the server.",
						);
					}

					const detail = (stderr || stdout).slice(0, 300);
					throw new Error(
						detail
							? `Failed to reach Hermes API (exit ${execResult.code}): ${detail}`
							: `Failed to reach Hermes API (exit ${execResult.code})`,
					);
				}

				const stdout = execResult.stdout?.trim();
				if (!stdout) {
					throw new Error("Empty response from Hermes API");
				}

				let parsed: unknown;
				try {
					parsed = JSON.parse(stdout);
				} catch {
					throw new Error(
						`Invalid JSON from Hermes API: ${stdout.slice(0, 200)}`,
					);
				}

				if (parsed && typeof parsed === "object" && "error" in parsed) {
					const errBody = (parsed as Record<string, unknown>).error;
					const errMsg =
						typeof errBody === "object" && errBody !== null
							? String((errBody as Record<string, unknown>).message ?? errBody)
							: String(errBody);
					throw new Error(`Hermes API error: ${errMsg}`);
				}

				const choices =
					parsed && typeof parsed === "object" && "choices" in parsed
						? (
								parsed as {
									choices?: Array<{ message?: { content?: string } }>;
								}
							).choices
						: undefined;
				const content = choices?.[0]?.message?.content;
				if (!content) {
					throw new Error("No response content from Hermes");
				}

				return { response: content };
			},
		);

		return context.json(result);
	} catch (error) {
		const message = error instanceof Error ? error.message : "Test failed";
		return context.json({ error: message }, 502);
	}
}

async function findServerForDeploy(userId: string) {
	const [row] = await getDb()
		.select({
			id: servers.id,
			host: servers.host,
			port: servers.port,
			username: servers.username,
			authMethod: servers.authMethod,
			encryptedCredential: servers.encryptedCredential,
			storeCredential: servers.storeCredential,
		})
		.from(installs)
		.innerJoin(servers, eq(installs.serverId, servers.id))
		.where(and(eq(servers.userId, userId), eq(installs.status, "succeeded")))
		.orderBy(desc(installs.createdAt))
		.limit(1);

	return row ?? null;
}

async function findServerById(serverId: string) {
	const [row] = await getDb()
		.select({
			id: servers.id,
			host: servers.host,
			port: servers.port,
			username: servers.username,
			authMethod: servers.authMethod,
			encryptedCredential: servers.encryptedCredential,
			storeCredential: servers.storeCredential,
		})
		.from(servers)
		.where(eq(servers.id, serverId))
		.limit(1);

	return row ?? null;
}

async function getLatestTelegramRecord(userId: string) {
	const [record] = await getDb()
		.select({
			botToken: telegramConfigs.botToken,
			botUsername: telegramConfigs.botUsername,
			isActive: telegramConfigs.isActive,
			deployedServerId: telegramConfigs.deployedServerId,
			deployedServerHost: telegramConfigs.deployedServerHost,
			apiServerKey: telegramConfigs.apiServerKey,
		})
		.from(telegramConfigs)
		.where(eq(telegramConfigs.userId, userId))
		.orderBy(desc(telegramConfigs.createdAt))
		.limit(1);

	return record ?? null;
}

async function verifyTelegramToken(botToken: string) {
	let response: Response;

	try {
		response = await fetch(createTelegramApiUrl(botToken, "getMe"), {
			method: "GET",
		});
	} catch {
		throw new TelegramConnectionError("Connection failed", "connection_failed");
	}

	let payload: TelegramGetMeResponse | null = null;

	try {
		payload = (await response.json()) as TelegramGetMeResponse;
	} catch {
		payload = null;
	}

	if (!response.ok || !payload?.ok || !payload.result) {
		if (response.status === 401) {
			throw new TelegramConnectionError("Invalid bot token", "invalid_token");
		}

		throw new TelegramConnectionError(
			payload?.description || "Connection failed",
			"connection_failed",
		);
	}

	return {
		id: payload.result.id,
		username:
			payload.result.username || payload.result.first_name || "Telegram bot",
	};
}

function createTelegramApiUrl(botToken: string, method: string) {
	return `https://api.telegram.org/bot${botToken}/${method}`;
}

function getTokenLast4(botToken: string) {
	const trimmedToken = botToken.trim();
	if (!trimmedToken) {
		return null;
	}

	return trimmedToken.slice(-4);
}
