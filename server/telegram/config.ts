import { getLast4 } from "../lib/get-last-4";

export type TelegramConnectRequest = {
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

export type TelegramTestRequest = {
	message?: string;
};

export type TelegramPairingApproveRequest = {
	code?: string;
};

export class TelegramConnectionError extends Error {
	constructor(
		message: string,
		readonly code: "invalid_token" | "connection_failed",
	) {
		super(message);
		this.name = "TelegramConnectionError";
	}
}

export async function verifyTelegramToken(botToken: string) {
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

export function getTokenLast4(botToken: string) {
	return getLast4(botToken);
}
