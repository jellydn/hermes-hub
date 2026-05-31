import crypto from "node:crypto";

import { and, desc, eq } from "drizzle-orm";
import type { Context } from "hono";
import { getAuthSession } from "./auth";
import { buildHermesComposeContent } from "./compose";
import { decryptApiServerKey, decryptSecret, encryptSecret } from "./crypto";
import { clearDashboardCache } from "./dashboard";
import { getDb } from "./db";
import { auditLogs, installs, servers, telegramConfigs } from "./db/schema";
import { getClientIp } from "./lib/get-client-ip";
import { getLast4 } from "./lib/get-last-4";
import { getProviderDeployConfig } from "./providers";
import { resolveServerSshConfig } from "./server-records";
import { type SshAuthMethod, shellQuote, withSshConnection } from "./ssh";

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

export type TelegramPairingSummary = {
	pending: Array<{
		code: string;
		userId: string;
		userName: string;
		ageMinutes: number;
	}>;
	approved: Array<{
		userId: string;
		userName: string;
		approvedAt: number | null;
	}>;
};

type TelegramTestRequest = {
	message?: string;
};

type TelegramPairingApproveRequest = {
	code?: string;
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

		clearDashboardCache();

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

		clearDashboardCache();

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
	let hermesModel: string | undefined;
	try {
		const providerConfig = await getProviderDeployConfig(session.user.id);
		providerEnvVars = providerConfig?.envVars;
		hermesModel = providerConfig?.model;
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
		hermesModel,
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

		// Persist deploy state in a single transaction so that the config update
		// and the audit log insert are committed atomically. If the transaction
		// fails, neither side effect is applied and the DB retains the previous
		// deploy state (or null), keeping local and remote consistent.
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

		clearDashboardCache();

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
	let providerConfig: Awaited<ReturnType<typeof getProviderDeployConfig>> =
		null;
	try {
		providerConfig = await getProviderDeployConfig(session.user.id);
	} catch (error) {
		const message =
			error instanceof Error
				? error.message
				: "Provider config could not be loaded.";
		return context.json({ error: message }, 400);
	}

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
		`-H ${shellQuote(`Authorization: Bearer ${decryptedApiServerKey}`)}`,
		`-d ${shellQuote(
			JSON.stringify({
				model: providerConfig?.model,
				messages: [{ role: "user", content: message }],
			}),
		)}`,
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

export async function listTelegramPairings(
	context: Context,
): Promise<Response> {
	const session = await getAuthSession(context.req.raw.headers);
	if (!session) {
		return context.json({ error: "Unauthorized" }, 401);
	}

	const deployedServer = await getDeployedTelegramServer(session);
	if ("response" in deployedServer) {
		return deployedServer.response;
	}

	try {
		const result = await runHermesPairingJsonCommand(
			deployedServer.serverRecord,
			deployedServer.sshConfig,
			'import json; from gateway.pairing import PairingStore; store = PairingStore(); print(json.dumps({"pending": store.list_pending("telegram"), "approved": store.list_approved("telegram")}))',
		);

		return context.json({ pairings: parsePairingSummary(result) });
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Unable to load pairings";
		return context.json({ error: message }, 502);
	}
}

export async function approveTelegramPairing(
	context: Context,
): Promise<Response> {
	const session = await getAuthSession(context.req.raw.headers);
	if (!session) {
		return context.json({ error: "Unauthorized" }, 401);
	}

	let payload: TelegramPairingApproveRequest;
	try {
		payload = await context.req.json<TelegramPairingApproveRequest>();
	} catch {
		return context.json({ error: "Invalid JSON body" }, 400);
	}

	const code = payload.code?.trim().toUpperCase() ?? "";
	if (!/^[A-Z2-9]{8}$/.test(code)) {
		return context.json({ error: "Pairing code must be 8 characters." }, 400);
	}

	const deployedServer = await getDeployedTelegramServer(session);
	if ("response" in deployedServer) {
		return deployedServer.response;
	}

	try {
		const result = await runHermesPairingJsonCommand(
			deployedServer.serverRecord,
			deployedServer.sshConfig,
			[
				"import json, os",
				"from gateway.pairing import PairingStore",
				"store = PairingStore()",
				'result = store.approve_code("telegram", os.environ["PAIRING_CODE"])',
				'print(json.dumps({"approved": result, "locked": store._is_locked_out("telegram")}))',
			].join("; "),
			{ PAIRING_CODE: code },
		);

		const approved =
			result && typeof result === "object" && "approved" in result
				? (result as { approved?: unknown }).approved
				: null;
		const locked =
			result && typeof result === "object" && "locked" in result
				? Boolean((result as { locked?: unknown }).locked)
				: false;

		if (!approved || typeof approved !== "object") {
			return context.json(
				{
					error: locked
						? "Telegram pairing approvals are temporarily locked after too many failed attempts."
						: "Pairing code not found or expired.",
				},
				400,
			);
		}

		return context.json({
			approved: {
				userId: String((approved as Record<string, unknown>).user_id ?? ""),
				userName: String((approved as Record<string, unknown>).user_name ?? ""),
			},
		});
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Unable to approve pairing";
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

async function getDeployedTelegramServer(
	session: Awaited<ReturnType<typeof getAuthSession>>,
): Promise<
	| { response: Response }
	| {
			serverRecord: NonNullable<Awaited<ReturnType<typeof findServerById>>>;
			sshConfig: { authMethod: SshAuthMethod; credential: string };
	  }
> {
	if (!session) {
		return {
			response: Response.json({ error: "Unauthorized" }, { status: 401 }),
		};
	}

	const record = await getLatestTelegramRecord(session.user.id);
	if (!record?.isActive || !record.deployedServerId) {
		return {
			response: Response.json(
				{ error: "Deploy Telegram to a server before managing pairings." },
				{ status: 400 },
			),
		};
	}

	const serverRecord = await findServerById(record.deployedServerId);
	if (!serverRecord) {
		return {
			response: Response.json(
				{ error: "Deployed server not found." },
				{ status: 404 },
			),
		};
	}

	try {
		return {
			serverRecord,
			sshConfig: resolveServerSshConfig(serverRecord, session.session.id),
		};
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Credential unavailable";
		return {
			response: Response.json({ error: message }, { status: 400 }),
		};
	}
}

async function runHermesPairingJsonCommand(
	serverRecord: NonNullable<Awaited<ReturnType<typeof findServerById>>>,
	sshConfig: { authMethod: SshAuthMethod; credential: string },
	pythonCode: string,
	env: Record<string, string> = {},
) {
	const envArgs = Object.entries(env)
		.map(([key, value]) => `-e ${shellQuote(`${key}=${value}`)}`)
		.join(" ");
	const command = [
		"docker exec",
		envArgs,
		"hermes python -c",
		shellQuote(pythonCode),
	]
		.filter(Boolean)
		.join(" ");

	return withSshConnection(
		{
			host: serverRecord.host,
			port: serverRecord.port,
			username: serverRecord.username,
			...sshConfig,
		},
		async (ssh) => {
			const result = await ssh.execCommand(command, {
				execOptions: { timeout: 30_000 },
			});
			if (result.code !== 0) {
				throw new Error(result.stderr || "Hermes pairing command failed.");
			}

			try {
				return JSON.parse(result.stdout.trim()) as unknown;
			} catch {
				throw new Error(
					`Invalid pairing response: ${result.stdout.slice(0, 200)}`,
				);
			}
		},
	);
}

function parsePairingSummary(payload: unknown): TelegramPairingSummary {
	const record =
		payload && typeof payload === "object"
			? (payload as Record<string, unknown>)
			: {};
	const pending = Array.isArray(record.pending) ? record.pending : [];
	const approved = Array.isArray(record.approved) ? record.approved : [];

	return {
		pending: pending.map((entry) => {
			const item =
				entry && typeof entry === "object"
					? (entry as Record<string, unknown>)
					: {};
			return {
				code: String(item.code ?? ""),
				userId: String(item.user_id ?? ""),
				userName: String(item.user_name ?? ""),
				ageMinutes: Number(item.age_minutes ?? 0),
			};
		}),
		approved: approved.map((entry) => {
			const item =
				entry && typeof entry === "object"
					? (entry as Record<string, unknown>)
					: {};
			return {
				userId: String(item.user_id ?? ""),
				userName: String(item.user_name ?? ""),
				approvedAt:
					typeof item.approved_at === "number" ? item.approved_at : null,
			};
		}),
	};
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
	return getLast4(botToken);
}
