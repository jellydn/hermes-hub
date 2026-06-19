import { and, desc, eq, inArray } from "drizzle-orm";
import {
	type ApiProviderId,
	formatAiProviderLabel,
	isApiProviderId,
} from "#/lib/ai-providers";
import {
	type CredentialSubscriptionOption,
	formatUserSubscriptionLabel,
	getSubscriptionByStorageProviderId,
	getSubscriptionHermesProviderId,
	isLegacyCodexProviderId,
	isUserSubscriptionId,
	type UserSubscriptionId,
	userSubscriptionOptions,
} from "#/lib/user-subscriptions";
import { getDb } from "../db";
import { aiProviders, aiUserSubscriptions } from "../db/schema";
import type { UserSubscriptionRecord } from "./subscription-records";

export type ActiveApiProviderBackend = {
	kind: "api-provider";
	provider: ApiProviderId;
	model: string;
	encryptedApiKey: string;
	baseUrl: string | null;
};

export type ActiveOAuthSubscriptionBackend = {
	kind: "subscription";
	access: "oauth";
	subscriptionProvider: UserSubscriptionId;
	model: string;
	authMode: string;
	hermesProviderId: string;
};

export type ActiveCredentialSubscriptionBackend = {
	kind: "subscription";
	access: "credential";
	subscriptionProvider: UserSubscriptionId;
	model: string;
	authMode: string;
	hermesProviderId: string;
	storageProviderId: string;
	encryptedApiKey: string;
	baseUrl: string | null;
};

export type ActiveSubscriptionBackend =
	| ActiveOAuthSubscriptionBackend
	| ActiveCredentialSubscriptionBackend;

export type ActiveModelBackend =
	| ActiveApiProviderBackend
	| ActiveSubscriptionBackend;

export type StoredProviderRecordInput = {
	provider: string;
	model: string;
	encryptedApiKey: string;
	baseUrl: string | null;
	isActive?: boolean;
};

export function deriveActiveModelBackend(
	subscription: UserSubscriptionRecord | null,
	providerRecord: StoredProviderRecordInput | null,
): ActiveModelBackend | null {
	if (subscription) {
		return {
			kind: "subscription",
			access: "oauth",
			subscriptionProvider: subscription.subscriptionProvider,
			model: subscription.model,
			authMode: subscription.authMode,
			hermesProviderId: getSubscriptionHermesProviderId(
				subscription.subscriptionProvider,
			),
		};
	}

	if (!providerRecord?.isActive) {
		return null;
	}

	if (isLegacyCodexProviderId(providerRecord.provider)) {
		return {
			kind: "subscription",
			access: "oauth",
			subscriptionProvider: "chatgpt",
			model: providerRecord.model,
			authMode: "chatgpt",
			hermesProviderId: getSubscriptionHermesProviderId("chatgpt"),
		};
	}

	const credentialOption = getSubscriptionByStorageProviderId(
		providerRecord.provider,
	);
	if (credentialOption) {
		return {
			kind: "subscription",
			access: "credential",
			subscriptionProvider: credentialOption.id,
			model: providerRecord.model,
			authMode: credentialOption.authMode,
			hermesProviderId: credentialOption.hermesProviderId,
			storageProviderId: credentialOption.storageProviderId,
			encryptedApiKey: providerRecord.encryptedApiKey,
			baseUrl: providerRecord.baseUrl,
		};
	}

	if (!isApiProviderId(providerRecord.provider)) {
		return null;
	}

	return {
		kind: "api-provider",
		provider: providerRecord.provider,
		model: providerRecord.model,
		encryptedApiKey: providerRecord.encryptedApiKey,
		baseUrl: providerRecord.baseUrl,
	};
}

export async function loadModelAccessRecords(userId: string) {
	const credentialStorageIds = userSubscriptionOptions
		.filter(
			(o): o is CredentialSubscriptionOption => o.credentialKind === "api-key",
		)
		.map((o) => o.storageProviderId);

	const activeApiPromise = getDb()
		.select({
			provider: aiProviders.provider,
			model: aiProviders.model,
			encryptedApiKey: aiProviders.encryptedApiKey,
			baseUrl: aiProviders.baseUrl,
			isActive: aiProviders.isActive,
		})
		.from(aiProviders)
		.where(and(eq(aiProviders.userId, userId), eq(aiProviders.isActive, true)))
		.orderBy(desc(aiProviders.createdAt))
		.limit(1)
		.then((rows) => rows[0] || null);

	const activeSubPromise = getDb()
		.select({
			subscriptionProvider: aiUserSubscriptions.subscriptionProvider,
			model: aiUserSubscriptions.model,
			authMode: aiUserSubscriptions.authMode,
			isActive: aiUserSubscriptions.isActive,
		})
		.from(aiUserSubscriptions)
		.where(
			and(
				eq(aiUserSubscriptions.userId, userId),
				eq(aiUserSubscriptions.isActive, true),
			),
		)
		.orderBy(desc(aiUserSubscriptions.createdAt))
		.limit(1)
		.then((rows) => {
			const record = rows[0];
			if (!record || !isUserSubscriptionId(record.subscriptionProvider)) {
				return null;
			}
			return {
				subscriptionProvider: record.subscriptionProvider,
				model: record.model,
				authMode: record.authMode,
				isActive: record.isActive,
			};
		});

	const latestApiPromise = getDb()
		.select({
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
				inArray(aiProviders.provider, [
					"openai",
					"anthropic",
					"openrouter",
					"ollama",
					"custom",
				]),
			),
		)
		.orderBy(desc(aiProviders.createdAt))
		.limit(1)
		.then((rows) => rows[0] || null);

	const latestCredSubPromise =
		credentialStorageIds.length > 0
			? getDb()
					.select({
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
							inArray(aiProviders.provider, credentialStorageIds),
						),
					)
					.orderBy(desc(aiProviders.createdAt))
					.limit(1)
					.then((rows) => rows[0] || null)
			: Promise.resolve(null);

	const latestOAuthSubPromise = getDb()
		.select({
			subscriptionProvider: aiUserSubscriptions.subscriptionProvider,
			model: aiUserSubscriptions.model,
			authMode: aiUserSubscriptions.authMode,
			isActive: aiUserSubscriptions.isActive,
		})
		.from(aiUserSubscriptions)
		.where(eq(aiUserSubscriptions.userId, userId))
		.orderBy(desc(aiUserSubscriptions.createdAt))
		.limit(1)
		.then((rows) => {
			const record = rows[0];
			if (!record || !isUserSubscriptionId(record.subscriptionProvider)) {
				return null;
			}
			return {
				subscriptionProvider: record.subscriptionProvider,
				model: record.model,
				authMode: record.authMode,
				isActive: record.isActive,
			};
		});

	const [
		activeApiRecord,
		activeSubscriptionRecord,
		latestApiRecord,
		latestCredentialSubscriptionRecord,
		latestOAuthSubscriptionRecord,
	] = await Promise.all([
		activeApiPromise,
		activeSubPromise,
		latestApiPromise,
		latestCredSubPromise,
		latestOAuthSubPromise,
	]);

	return {
		apiRecord:
			activeApiRecord || latestApiRecord || latestCredentialSubscriptionRecord,
		subscriptionRecord:
			activeSubscriptionRecord || latestOAuthSubscriptionRecord,

		activeApiRecord,
		activeSubscriptionRecord,
		latestApiRecord,
		latestCredentialSubscriptionRecord,
		latestOAuthSubscriptionRecord,

		activeBackend: deriveActiveModelBackend(
			activeSubscriptionRecord,
			activeApiRecord,
		),
	};
}

export async function resolveActiveModelBackend(
	userId: string,
): Promise<ActiveModelBackend | null> {
	const { activeBackend } = await loadModelAccessRecords(userId);
	return activeBackend;
}

export function formatActiveBackendLabel(backend: ActiveModelBackend) {
	if (backend.kind === "subscription") {
		return formatUserSubscriptionLabel(backend.subscriptionProvider);
	}

	return formatAiProviderLabel(backend.provider);
}

export function formatModelAccessProviderLabel(
	provider: ApiProviderId | UserSubscriptionId,
) {
	if (isUserSubscriptionId(provider)) {
		return formatUserSubscriptionLabel(provider);
	}

	return formatAiProviderLabel(provider);
}

export function resolveDeployProviderLabel(backend: ActiveModelBackend) {
	return backend.kind === "subscription"
		? backend.subscriptionProvider
		: backend.provider;
}
