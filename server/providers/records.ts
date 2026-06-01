import { and, desc, eq } from "drizzle-orm";
import { decryptSecret } from "../crypto";
import { getDb } from "../db";
import { aiProviders, telegramConfigs } from "../db/schema";
import { getLast4 } from "../lib/get-last-4";

export function decryptApiKey(encryptedStr: string): string {
	try {
		const decrypted = decryptSecret(encryptedStr);
		// Keys saved before the explicit baseUrl column may have been stored as JSON {apiKey, baseUrl}. Unwrap if so.
		if (decrypted.startsWith("{")) {
			try {
				const parsed = JSON.parse(decrypted) as Record<string, unknown>;
				if (typeof parsed.apiKey === "string") {
					return parsed.apiKey;
				}
			} catch {
				// Not valid JSON — treat as a raw key starting with '{'
			}
		}
		return decrypted;
	} catch {
		return "";
	}
}

export function getApiKeyLast4(apiKey: string) {
	return getLast4(apiKey);
}

export async function getLatestProviderRecord(userId: string) {
	const [record] = await getDb()
		.select({
			provider: aiProviders.provider,
			model: aiProviders.model,
			encryptedApiKey: aiProviders.encryptedApiKey,
			baseUrl: aiProviders.baseUrl,
		})
		.from(aiProviders)
		.where(eq(aiProviders.userId, userId))
		.orderBy(desc(aiProviders.createdAt))
		.limit(1);

	return record ?? null;
}

export async function getTelegramDeployInfo(userId: string) {
	const [record] = await getDb()
		.select({
			botToken: telegramConfigs.botToken,
			apiServerKey: telegramConfigs.apiServerKey,
			deployedServerId: telegramConfigs.deployedServerId,
			deployedServerHost: telegramConfigs.deployedServerHost,
		})
		.from(telegramConfigs)
		.where(
			and(
				eq(telegramConfigs.userId, userId),
				eq(telegramConfigs.isActive, true),
			),
		)
		.orderBy(desc(telegramConfigs.createdAt))
		.limit(1);

	if (!record?.apiServerKey || !record.deployedServerId) {
		return null;
	}

	return record as {
		botToken: string;
		apiServerKey: string;
		deployedServerId: string;
		deployedServerHost: string;
	};
}
