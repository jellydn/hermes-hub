import crypto from "node:crypto";

import { and, eq } from "drizzle-orm";
import type { Context } from "hono";
import {
	type ApiProviderId,
	apiProviderOptions,
	isApiProviderId,
	isValidAiModel,
	isValidModelString,
} from "#/lib/ai-providers";
import { getAuthSession } from "./auth";
import { decryptApiServerKey, decryptSecret, encryptSecret } from "./crypto";
import { clearDashboardCache } from "./dashboard";
import { getDb } from "./db";
import { telegramConfigs } from "./db/schema";
import {
	setProviderInferenceProvider,
	setProviderModel,
} from "./hermes/runtime";
import { getClientIp } from "./lib/get-client-ip";
import { insertAuditLog } from "./lib/insert-audit-log";
import { deployManagedCompose } from "./managed-compose-deploy";
import { getProviderDeployConfig } from "./providers";
import { PROVIDER_ENV_CONFIGS } from "./providers/config";
import { getServerById, resolveServerSshConfigOrError } from "./server-records";
import { shellQuote, withSshConnection } from "./ssh";
import {
	getTokenLast4,
	TelegramConnectionError,
	verifyTelegramToken,
} from "./telegram/config";
import {
	approveTelegramPairing,
	listTelegramPairings,
} from "./telegram/pairings";
import {
	findServerForDeploy,
	getLatestTelegramRecord,
} from "./telegram/records";

export type {
	TelegramConfigSummary,
	TelegramPairingSummary,
} from "./telegram/config";
export { getCurrentTelegramConfig } from "./telegram/records";
export { approveTelegramPairing, listTelegramPairings };

type ChatCompletionResponse = {
	error?: { message?: string } | string;
	choices?: Array<{ message?: { content?: string } }>;
};

function parseChatCompletion(raw: unknown): string {
	const obj =
		raw && typeof raw === "object" ? (raw as ChatCompletionResponse) : {};

	if (obj.error) {
		const errMsg =
			typeof obj.error === "object"
				? String(obj.error.message ?? obj.error)
				: String(obj.error);
		throw new Error(`Hermes API error: ${errMsg}`);
	}

	const content = obj.choices?.[0]?.message?.content;
	if (!content) {
		throw new Error("No response content from Hermes");
	}

	return content;
}

export async function connectTelegram(context: Context) {
	const session = await getAuthSession(context.req.raw.headers);
	if (!session) {
		return context.json({ error: "Unauthorized" }, 401);
	}

	let payload: { botToken?: string };

	try {
		payload = await context.req.json<{ botToken?: string }>();
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
		await db.transaction(async (tx) => {
			await persistTelegramConnection(tx, {
				userId: session.user.id,
				botToken,
				botUsername: bot.username,
				botId: bot.id,
				ipAddress,
			});
		});

		clearDashboardCache();

		return context.json({
			telegram: {
				botUsername: bot.username,
				botTokenLast4: getTokenLast4(botToken),
				isActive: true,
				deployedServerHost: null,
			},
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

		await insertAuditLog(db, {
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

	let telegramBotToken: string;
	try {
		telegramBotToken = decryptSecret(record.botToken);
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

	const sshResult = resolveServerSshConfigOrError(
		serverRecord,
		session.session.id,
	);
	if (!sshResult.ok) {
		return context.json({ error: sshResult.error }, 400);
	}
	const { authMethod, credential } = sshResult;

	const apiServerKey = crypto.randomBytes(32).toString("hex");

	try {
		await deployManagedCompose({
			intent: "telegram",
			userId: session.user.id,
			serverId: serverRecord.id,
			host: serverRecord.host,
			port: serverRecord.port,
			username: serverRecord.username,
			authMethod,
			credential,
			expectedFingerprint: serverRecord.hostKeyFingerprint ?? undefined,
			apiServerKey,
			telegramBotToken,
		});

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

			await insertAuditLog(tx, {
				userId: session.user.id,
				action: "telegram.deployed",
				serverId: serverRecord.id,
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

		await insertAuditLog(db, {
			userId: session.user.id,
			action: "telegram.deploy.failed",
			serverId: serverRecord.id,
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

	let payload: { message?: string };
	try {
		payload = await context.req.json<{ message?: string }>();
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
		const errMessage =
			error instanceof Error
				? error.message
				: "Provider config could not be loaded.";
		return context.json({ error: errMessage }, 400);
	}

	const serverRecord = await getServerById(record.deployedServerId);
	if (!serverRecord) {
		return context.json({ error: "Deployed server not found." }, 404);
	}

	const sshResult = resolveServerSshConfigOrError(
		serverRecord,
		session.session.id,
	);
	if (!sshResult.ok) {
		return context.json({ error: sshResult.error }, 400);
	}
	const { authMethod, credential } = sshResult;

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
				authMethod,
				credential,
				expectedFingerprint: serverRecord.hostKeyFingerprint ?? undefined,
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

				return { response: parseChatCompletion(parsed) };
			},
		);

		return context.json(result);
	} catch (error) {
		const message = error instanceof Error ? error.message : "Test failed";
		return context.json({ error: message }, 502);
	}
}

type SshContextResult =
	| {
			ok: true;
			serverRecord: NonNullable<Awaited<ReturnType<typeof getServerById>>>;
			authMethod: string;
			credential: string;
	  }
	| { ok: false; error: string; status: number };

async function resolveTelegramSshContext(session: {
	user: { id: string };
	session: { id: string };
}): Promise<SshContextResult> {
	const record = await getLatestTelegramRecord(session.user.id);
	if (!record?.isActive) {
		return {
			ok: false,
			error: "No active Telegram config. Connect a bot first.",
			status: 400,
		};
	}

	if (!record.deployedServerId) {
		return {
			ok: false,
			error: "Bot is not deployed to any server. Deploy it first.",
			status: 400,
		};
	}

	const serverRecord = await getServerById(record.deployedServerId);
	if (!serverRecord) {
		return { ok: false, error: "Deployed server not found.", status: 404 };
	}

	const sshResult = resolveServerSshConfigOrError(
		serverRecord,
		session.session.id,
	);
	if (!sshResult.ok) {
		return { ok: false, error: sshResult.error, status: 400 };
	}

	return {
		ok: true,
		serverRecord,
		authMethod: sshResult.authMethod,
		credential: sshResult.credential,
	};
}

export async function switchModelProvider(context: Context) {
	const session = await getAuthSession(context.req.raw.headers);
	if (!session) {
		return context.json({ error: "Unauthorized" }, 401);
	}

	let payload: { model?: string; provider?: string };
	try {
		payload = await context.req.json<{ model?: string; provider?: string }>();
	} catch {
		return context.json({ error: "Invalid JSON body" }, 400);
	}

	let { model } = payload;
	const { provider } = payload;

	if (!model && !provider) {
		return context.json(
			{ error: "At least one of 'model' or 'provider' is required." },
			400,
		);
	}

	// Validate provider if provided
	let validatedProvider: ApiProviderId | undefined;
	if (provider !== undefined) {
		if (!isApiProviderId(provider)) {
			return context.json(
				{
					error: `Invalid provider: '${provider}'. Valid options: openai, anthropic, openrouter, ollama, custom.`,
				},
				400,
			);
		}
		validatedProvider = provider;

		// Ensure the provider has a valid hermesProvider mapping
		const providerConfig = PROVIDER_ENV_CONFIGS[validatedProvider];
		if (!providerConfig?.hermesProvider) {
			return context.json(
				{
					error: `Provider '${provider}' does not have a valid inference provider mapping.`,
				},
				400,
			);
		}
	}

	// Validate model if provided
	if (model !== undefined) {
		model = model.trim();
		if (!model) {
			return context.json({ error: "Model cannot be empty." }, 400);
		}
		if (!isValidModelString(model)) {
			return context.json(
				{
					error: `Invalid model: '${model}'. Use alphanumeric, dots, underscores, colons, slashes, and hyphens (1-120 chars).`,
				},
				400,
			);
		}
		// If both provider and model are provided, validate model against provider
		if (validatedProvider && !isValidAiModel(validatedProvider, model)) {
			const option = apiProviderOptions.find((o) => o.id === validatedProvider);
			if (option && !option.requiresCustomModel) {
				return context.json(
					{
						error: `Model '${model}' is not valid for provider '${validatedProvider}'. Valid models: ${option.models.join(", ")}.`,
					},
					400,
				);
			}
		}
	}

	// Resolve SSH context
	const sshContext = await resolveTelegramSshContext(session);
	if (!sshContext.ok) {
		return context.json({ error: sshContext.error }, sshContext.status);
	}
	const { serverRecord } = sshContext;

	const ipAddress = getClientIp(context);
	const db = getDb();

	try {
		await withSshConnection(
			{
				host: serverRecord.host,
				port: serverRecord.port,
				username: serverRecord.username,
				authMethod: sshContext.authMethod,
				credential: sshContext.credential,
				expectedFingerprint: serverRecord.hostKeyFingerprint ?? undefined,
			},
			async (ssh) => {
				if (validatedProvider) {
					const hermesProviderId =
						PROVIDER_ENV_CONFIGS[validatedProvider].hermesProvider;
					await setProviderInferenceProvider(ssh, hermesProviderId);
				}
				if (model) {
					await setProviderModel(ssh, model);
				}
			},
		);

		await insertAuditLog(db, {
			userId: session.user.id,
			action: "telegram.model.switched",
			serverId: serverRecord.id,
			details: {
				...(validatedProvider ? { provider: validatedProvider } : {}),
				...(model ? { model } : {}),
				serverHost: serverRecord.host,
			},
			ipAddress,
		});

		clearDashboardCache();

		return context.json({
			status: "switched",
			...(validatedProvider ? { provider: validatedProvider } : {}),
			...(model ? { model } : {}),
		});
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Model switch failed";

		await insertAuditLog(db, {
			userId: session.user.id,
			action: "telegram.model.switch.failed",
			serverId: serverRecord.id,
			details: {
				...(validatedProvider ? { provider: validatedProvider } : {}),
				...(model ? { model } : {}),
				error: message,
			},
			ipAddress,
		});

		return context.json({ error: `Switch failed: ${message}` }, 502);
	}
}

type TelegramPersistenceInput = {
	userId: string;
	botToken: string;
	botUsername: string;
	botId: number;
	ipAddress: string | null;
};

type TelegramPersistenceWriter = Pick<
	ReturnType<typeof getDb>,
	"update" | "insert"
>;

async function persistTelegramConnection(
	writer: TelegramPersistenceWriter,
	input: TelegramPersistenceInput,
) {
	// react-doctor-disable-next-line react-doctor/async-parallel
	await writer
		.update(telegramConfigs)
		.set({ isActive: false })
		.where(eq(telegramConfigs.userId, input.userId));

	await writer.insert(telegramConfigs).values({
		userId: input.userId,
		botToken: encryptSecret(input.botToken),
		botUsername: input.botUsername,
		isActive: true,
		deployedServerId: null,
		deployedServerHost: null,
		apiServerKey: null,
	});

	await insertAuditLog(writer, {
		userId: input.userId,
		action: "telegram.connected",
		details: {
			botUsername: input.botUsername,
			botId: input.botId,
		},
		ipAddress: input.ipAddress,
	});
}
