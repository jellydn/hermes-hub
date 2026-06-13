import {
	type ApiProviderId,
	formatAiProviderLabel,
	isApiProviderId,
} from "#/lib/ai-providers";
import {
	formatUserSubscriptionLabel,
	getSubscriptionByStorageProviderId,
	getSubscriptionHermesProviderId,
	isLegacyCodexProviderId,
	isUserSubscriptionId,
	type UserSubscriptionId,
} from "#/lib/user-subscriptions";
import { getLatestProviderRecord } from "./records";
import type { UserSubscriptionRecord } from "./subscription-records";
import { getLatestUserSubscriptionRecord } from "./subscription-records";

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
	const [apiRecord, subscriptionRecord] = await Promise.all([
		getLatestProviderRecord(userId),
		getLatestUserSubscriptionRecord(userId),
	]);

	return {
		apiRecord,
		subscriptionRecord,
		activeBackend: deriveActiveModelBackend(subscriptionRecord, apiRecord),
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
