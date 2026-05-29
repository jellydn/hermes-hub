import { desc, eq } from "drizzle-orm";
import type { Context } from "hono";

import { getAuthSession } from "./auth";
import { decryptSecret, encryptSecret } from "./crypto";
import { getDb } from "./db";
import { auditLogs, telegramConfigs } from "./db/schema";
import { getClientIp } from "./lib/get-client-ip";

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

async function getLatestTelegramRecord(userId: string) {
	const [record] = await getDb()
		.select({
			botToken: telegramConfigs.botToken,
			botUsername: telegramConfigs.botUsername,
			isActive: telegramConfigs.isActive,
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
