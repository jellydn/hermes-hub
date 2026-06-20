// ── Active Backend Resolution ──────────────────────────────────────

import { and, desc, eq } from "drizzle-orm";

import {
	type ApiProviderId,
	formatAiProviderLabel,
	isApiProviderId,
} from "../../../src/lib/ai-providers";
import {
	formatUserSubscriptionLabel,
	getSubscriptionByStorageProviderId,
	getSubscriptionHermesProviderId,
	isLegacyCodexProviderId,
	isUserSubscriptionId,
	type UserSubscriptionId,
} from "../../../src/lib/user-subscriptions";
import { getDb } from "../../db";
import { aiProviders, aiUserSubscriptions } from "../../db/schema";
import type { UserSubscriptionRecord } from "../subscription-records";
import type { ActiveModelBackend, StoredProviderRecordInput } from "./types";

export type ModelAccessRecords = Awaited<
	ReturnType<typeof loadModelAccessRecords>
>;

export function deriveActiveModelBackend(
	subscription: UserSubscriptionRecord | null,
	providerRecord: StoredProviderRecordInput | null,
): ActiveModelBackend | null {
	if (subscription?.isActive) {
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
	const [activeApiRecord, activeSubscriptionRecord] = await Promise.all([
		getDb()
			.select({
				provider: aiProviders.provider,
				model: aiProviders.model,
				encryptedApiKey: aiProviders.encryptedApiKey,
				baseUrl: aiProviders.baseUrl,
				isActive: aiProviders.isActive,
			})
			.from(aiProviders)
			.where(
				and(eq(aiProviders.userId, userId), eq(aiProviders.isActive, true)),
			)
			.orderBy(desc(aiProviders.createdAt))
			.limit(1)
			.then((rows) => rows[0] || null),
		getDb()
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
			}),
	]);

	return {
		activeApiRecord,
		activeSubscriptionRecord,
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

export function formatActiveBackendLabel(backend: ActiveModelBackend): string {
	if (backend.kind === "subscription") {
		return formatUserSubscriptionLabel(backend.subscriptionProvider);
	}

	return formatAiProviderLabel(backend.provider);
}

export function resolveDeployProviderLabel(
	backend: ActiveModelBackend,
): ApiProviderId | UserSubscriptionId {
	return backend.kind === "subscription"
		? backend.subscriptionProvider
		: backend.provider;
}
