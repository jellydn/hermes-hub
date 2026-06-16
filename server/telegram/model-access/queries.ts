import { and, desc, eq, inArray } from "drizzle-orm";

import { isApiProviderId } from "#/lib/ai-providers";
import { isUserSubscriptionId } from "#/lib/user-subscriptions";
import type { ModelAccessOptionsResponse } from "#shared/contracts/telegram-model-access";
import { getDb } from "../../db";
import { aiProviders, aiUserSubscriptions } from "../../db/schema";
import {
	buildApiProviderOption,
	buildCredentialSubscriptionOption,
	buildOAuthSubscriptionOption,
} from "./builders";
import type {
	AiProviderRow,
	AiUserSubscriptionRow,
	ModelAccessOption,
} from "./types";

// ── DB query helpers ─────────────────────────────────────────────

export async function getLatestProviderRows(
	userId: string,
	providers: string[],
): Promise<AiProviderRow[]> {
	if (providers.length === 0) return [];
	return getDb()
		.select({
			id: aiProviders.id,
			provider: aiProviders.provider,
			model: aiProviders.model,
			encryptedApiKey: aiProviders.encryptedApiKey,
			baseUrl: aiProviders.baseUrl,
			isActive: aiProviders.isActive,
		})
		.from(aiProviders)
		.where(
			and(
				eq(aiProviders.userId, userId),
				inArray(aiProviders.provider, providers),
			),
		)
		.orderBy(desc(aiProviders.createdAt));
}

export async function getLatestSubscriptionRows(
	userId: string,
	subProviders: string[],
): Promise<AiUserSubscriptionRow[]> {
	if (subProviders.length === 0) return [];
	return getDb()
		.select({
			id: aiUserSubscriptions.id,
			subscriptionProvider: aiUserSubscriptions.subscriptionProvider,
			model: aiUserSubscriptions.model,
			authMode: aiUserSubscriptions.authMode,
			isActive: aiUserSubscriptions.isActive,
		})
		.from(aiUserSubscriptions)
		.where(
			and(
				eq(aiUserSubscriptions.userId, userId),
				inArray(aiUserSubscriptions.subscriptionProvider, subProviders),
			),
		)
		.orderBy(desc(aiUserSubscriptions.createdAt));
}

export function keepLatestBy<T>(rows: T[], keyFn: (r: T) => string): T[] {
	const seen = new Set<string>();
	const result: T[] = [];
	for (const row of rows) {
		const key = keyFn(row);
		if (!seen.has(key)) {
			seen.add(key);
			result.push(row);
		}
	}
	return result;
}

// ── Main query ───────────────────────────────────────────────────

export async function getModelAccessOptions(
	userId: string,
): Promise<ModelAccessOptionsResponse> {
	const options: ModelAccessOption[] = [];
	let activeOptionId: string | null = null;

	const collect = (option: ModelAccessOption | null) => {
		if (!option) return;
		if (option.isActive) activeOptionId = option.optionId;
		options.push(option);
	};

	// 1. Fetch all ai_providers rows in one query, partition by kind
	const allProviderTypes = await getDb()
		.select({ provider: aiProviders.provider })
		.from(aiProviders)
		.where(eq(aiProviders.userId, userId))
		.groupBy(aiProviders.provider);
	const allTypes = allProviderTypes.map((r) => r.provider);

	const apiTypes = allTypes.filter(isApiProviderId);
	const storageTypes = allTypes.filter((t) => !isApiProviderId(t));

	// 2. Batch-fetch latest rows per group (2 queries instead of N+M)
	const apiRows = keepLatestBy(
		await getLatestProviderRows(userId, apiTypes),
		(r) => r.provider,
	);
	for (const record of apiRows) collect(buildApiProviderOption(record));

	const storageRows = keepLatestBy(
		await getLatestProviderRows(userId, storageTypes),
		(r) => r.provider,
	);
	for (const record of storageRows)
		collect(buildCredentialSubscriptionOption(record));

	// 3. OAuth subscriptions (1 query)
	const subProviderTypes = await getDb()
		.select({ subscriptionProvider: aiUserSubscriptions.subscriptionProvider })
		.from(aiUserSubscriptions)
		.where(eq(aiUserSubscriptions.userId, userId))
		.groupBy(aiUserSubscriptions.subscriptionProvider);
	const subTypes = subProviderTypes
		.map((r) => r.subscriptionProvider)
		.filter(isUserSubscriptionId);

	const subRows = keepLatestBy(
		await getLatestSubscriptionRows(userId, subTypes),
		(r) => r.subscriptionProvider,
	);
	for (const record of subRows) collect(buildOAuthSubscriptionOption(record));

	return { options, activeOptionId };
}
