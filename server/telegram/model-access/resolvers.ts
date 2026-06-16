import { and, eq } from "drizzle-orm";

import { apiProviderOptions, isApiProviderId } from "#/lib/ai-providers";
import {
	getSubscriptionByStorageProviderId,
	getUserSubscriptionOption,
	isUserSubscriptionId,
} from "#/lib/user-subscriptions";
import { getDb } from "../../db";
import { aiProviders, aiUserSubscriptions } from "../../db/schema";
import { PROVIDER_ENV_CONFIGS } from "../../providers/config";
import { decryptStoredApiKey } from "../../providers/records";
import type { ActiveOptionIds, ResolvedOption } from "./types";

// ── Option ID parsing ────────────────────────────────────────────

export function parseOptionId(
	optionId: string,
): { kind: string; recordId: string } | null {
	const parts = optionId.split(":");
	if (parts.length !== 2) return null;
	return { kind: parts[0], recordId: parts[1] };
}

// ── Active option discovery ──────────────────────────────────────

export async function findActiveOptionIds(
	userId: string,
	excludeOptionId: string,
): Promise<ActiveOptionIds> {
	const providerIds: string[] = [];
	const subscriptionIds: string[] = [];

	const apiRows = await getDb()
		.select({ id: aiProviders.id })
		.from(aiProviders)
		.where(and(eq(aiProviders.userId, userId), eq(aiProviders.isActive, true)));

	for (const row of apiRows) {
		const apiOptId = `api-provider:${row.id}`;
		const credOptId = `credential-subscription:${row.id}`;
		if (apiOptId !== excludeOptionId && credOptId !== excludeOptionId) {
			providerIds.push(row.id);
		}
	}

	const subRows = await getDb()
		.select({ id: aiUserSubscriptions.id })
		.from(aiUserSubscriptions)
		.where(
			and(
				eq(aiUserSubscriptions.userId, userId),
				eq(aiUserSubscriptions.isActive, true),
			),
		);

	for (const row of subRows) {
		const subOptId = `oauth-subscription:${row.id}`;
		if (subOptId !== excludeOptionId) {
			subscriptionIds.push(row.id);
		}
	}

	return { providerIds, subscriptionIds };
}

// ── Option resolvers ─────────────────────────────────────────────

async function resolveApiProviderOption(
	userId: string,
	recordId: string,
): Promise<ResolvedOption> {
	const [record] = await getDb()
		.select({
			id: aiProviders.id,
			provider: aiProviders.provider,
			model: aiProviders.model,
			encryptedApiKey: aiProviders.encryptedApiKey,
			baseUrl: aiProviders.baseUrl,
		})
		.from(aiProviders)
		.where(and(eq(aiProviders.id, recordId), eq(aiProviders.userId, userId)))
		.limit(1);

	if (!record) return { ok: false, error: "Option not found." };
	if (!isApiProviderId(record.provider)) {
		return { ok: false, error: "Invalid provider option." };
	}

	const providerConfig = PROVIDER_ENV_CONFIGS[record.provider];
	if (!providerConfig?.hermesProvider) {
		return {
			ok: false,
			error: "Provider does not have a valid inference provider mapping.",
		};
	}

	const option = apiProviderOptions.find((o) => o.id === record.provider);
	if (!option) return { ok: false, error: "Invalid provider option." };

	return {
		ok: true,
		kind: "api-provider",
		provider: record.provider,
		hermesProviderId: providerConfig.hermesProvider,
		model: record.model,
		allowsCustomModel: option.requiresCustomModel ?? false,
		fixedModels: [...option.models],
		activeOptionIds: await findActiveOptionIds(
			userId,
			`api-provider:${recordId}`,
		),
	};
}

async function resolveCredentialSubscriptionOption(
	userId: string,
	recordId: string,
): Promise<ResolvedOption> {
	const [record] = await getDb()
		.select({
			id: aiProviders.id,
			provider: aiProviders.provider,
			model: aiProviders.model,
			encryptedApiKey: aiProviders.encryptedApiKey,
			baseUrl: aiProviders.baseUrl,
		})
		.from(aiProviders)
		.where(and(eq(aiProviders.id, recordId), eq(aiProviders.userId, userId)))
		.limit(1);

	if (!record) return { ok: false, error: "Option not found." };

	const credentialOption = getSubscriptionByStorageProviderId(record.provider);
	if (!credentialOption || !isUserSubscriptionId(credentialOption.id)) {
		return { ok: false, error: "Invalid subscription option." };
	}

	const subOption = getUserSubscriptionOption(credentialOption.id);
	if (!subOption) {
		return { ok: false, error: "Invalid subscription option." };
	}

	const decrypted = decryptStoredApiKey(record.encryptedApiKey);
	if (!decrypted.ok || !decrypted.apiKey) {
		return {
			ok: false,
			error: "Stored API key could not be read. Save the subscription again.",
		};
	}

	return {
		ok: true,
		kind: "credential-subscription",
		provider: credentialOption.id,
		hermesProviderId: credentialOption.hermesProviderId,
		model: record.model,
		allowsCustomModel: false,
		fixedModels: [...subOption.models],
		activeOptionIds: await findActiveOptionIds(
			userId,
			`credential-subscription:${recordId}`,
		),
	};
}

async function resolveOAuthSubscriptionOption(
	userId: string,
	recordId: string,
): Promise<ResolvedOption> {
	const [record] = await getDb()
		.select({
			id: aiUserSubscriptions.id,
			subscriptionProvider: aiUserSubscriptions.subscriptionProvider,
			model: aiUserSubscriptions.model,
		})
		.from(aiUserSubscriptions)
		.where(
			and(
				eq(aiUserSubscriptions.id, recordId),
				eq(aiUserSubscriptions.userId, userId),
			),
		)
		.limit(1);

	if (!record) return { ok: false, error: "Option not found." };
	if (!isUserSubscriptionId(record.subscriptionProvider)) {
		return { ok: false, error: "Invalid subscription option." };
	}

	const option = getUserSubscriptionOption(record.subscriptionProvider);
	if (!option) return { ok: false, error: "Invalid subscription option." };

	return {
		ok: true,
		kind: "oauth-subscription",
		provider: record.subscriptionProvider,
		hermesProviderId: option.hermesProviderId,
		model: record.model,
		allowsCustomModel: false,
		fixedModels: [...option.models],
		activeOptionIds: await findActiveOptionIds(
			userId,
			`oauth-subscription:${recordId}`,
		),
	};
}

// ── Switch dispatcher ────────────────────────────────────────────

export async function resolveSwitchOption(
	userId: string,
	optionId: string,
): Promise<ResolvedOption> {
	const parsed = parseOptionId(optionId);
	if (!parsed) return { ok: false, error: "Invalid option ID format." };

	switch (parsed.kind) {
		case "api-provider":
			return resolveApiProviderOption(userId, parsed.recordId);
		case "credential-subscription":
			return resolveCredentialSubscriptionOption(userId, parsed.recordId);
		case "oauth-subscription":
			return resolveOAuthSubscriptionOption(userId, parsed.recordId);
		default:
			return { ok: false, error: "Invalid option kind." };
	}
}
