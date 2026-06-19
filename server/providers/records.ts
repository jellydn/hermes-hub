import { and, desc, eq } from "drizzle-orm";
import { decryptSecret } from "../crypto";
import { getDb } from "../db";
import { aiProviders, telegramConfigs } from "../db/schema";
import { getLast4 } from "../lib/get-last-4";

export type StoredApiKeyDecryptResult =
	| { ok: true; apiKey: string }
	| { ok: false };

function unwrapLegacyApiKeyPayload(decrypted: string) {
	if (!decrypted.startsWith("{")) {
		return decrypted;
	}

	try {
		const parsed = JSON.parse(decrypted) as Record<string, unknown>;
		if (typeof parsed.apiKey === "string") {
			return parsed.apiKey;
		}
	} catch {
		// Not valid JSON — treat as a raw key starting with '{'
	}

	return decrypted;
}

export function decryptStoredApiKey(
	encryptedStr: string,
): StoredApiKeyDecryptResult {
	try {
		const decrypted = unwrapLegacyApiKeyPayload(decryptSecret(encryptedStr));
		return { ok: true, apiKey: decrypted };
	} catch {
		return { ok: false };
	}
}

export function decryptApiKey(encryptedStr: string): string {
	const result = decryptStoredApiKey(encryptedStr);
	return result.ok ? result.apiKey : "";
}

export function getApiKeyLast4(apiKey: string) {
	return getLast4(apiKey);
}

export async function getLatestProviderRecord(
	userId: string,
	provider?: string,
) {
	const conditions = [eq(aiProviders.userId, userId)];
	if (provider) {
		conditions.push(eq(aiProviders.provider, provider));
	}

	const [record] = await getDb()
		.select({
			provider: aiProviders.provider,
			model: aiProviders.model,
			encryptedApiKey: aiProviders.encryptedApiKey,
			baseUrl: aiProviders.baseUrl,
			isActive: aiProviders.isActive,
		})
		.from(aiProviders)
		.where(and(...conditions))
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
