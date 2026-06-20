// ── Model Access Snapshot ─────────────────────────────────────────

import type { ModelAccessSnapshot } from "../../../shared/contracts/model-access";
import {
	isApiProviderId,
} from "../../../src/lib/ai-providers";
import {
	getSubscriptionByStorageProviderId,
} from "../../../src/lib/user-subscriptions";
import { buildStoredCredentialSubscriptionSummary } from "../subscription-credentials";
import type { ModelAccessRecords } from "./backend";
import { decryptAndGetLast4 } from "./helpers";
import type { ActiveAccessSummary } from "./types";

function buildApiProviderSummary(
	record: NonNullable<ModelAccessRecords["activeApiRecord"]>,
): NonNullable<ModelAccessSnapshot["apiProvider"]> {
	if (!isApiProviderId(record.provider)) {
		throw new Error(`Invalid API provider ID: ${record.provider}`);
	}
	const dec = decryptAndGetLast4(record.encryptedApiKey);
	return {
		kind: "api-provider",
		provider: record.provider,
		model: record.model,
		keyLast4: dec.ok ? dec.keyLast4 : null,
		hasStoredKey: dec.ok,
		baseUrl: record.baseUrl ?? undefined,
	};
}

function resolveActiveAccessSummary(
	records: ModelAccessRecords,
): ActiveAccessSummary {
	const { activeApiRecord, activeSubscriptionRecord } = records;

	let subscription: ModelAccessSnapshot["subscription"] = null;
	if (activeSubscriptionRecord) {
		subscription = {
			kind: "subscription",
			subscriptionProvider: activeSubscriptionRecord.subscriptionProvider,
			model: activeSubscriptionRecord.model,
			authMode: activeSubscriptionRecord.authMode,
		};
	} else if (activeApiRecord) {
		const credentialOption = getSubscriptionByStorageProviderId(
			activeApiRecord.provider,
		);
		if (credentialOption) {
			subscription = buildStoredCredentialSubscriptionSummary(
				credentialOption,
				activeApiRecord,
			);
		}
	}

	let apiProvider: ModelAccessSnapshot["apiProvider"] = null;
	if (
		activeApiRecord &&
		isApiProviderId(activeApiRecord.provider) &&
		!getSubscriptionByStorageProviderId(activeApiRecord.provider)
	) {
		apiProvider = buildApiProviderSummary(activeApiRecord);
	}

	return { apiProvider, subscription };
}

export function buildModelAccessSnapshot(
	records: ModelAccessRecords,
): ModelAccessSnapshot {
	const { apiProvider, subscription } = resolveActiveAccessSummary(records);

	return {
		apiProvider,
		subscription,
		activeBackend: records.activeBackend?.kind ?? null,
	};
}
