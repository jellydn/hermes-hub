import { eq } from "drizzle-orm";

import {
	type ApiProviderId,
	formatAiProviderLabel,
} from "../../src/lib/ai-providers";
import type { UserSubscriptionId } from "../../src/lib/user-subscriptions";
import { encryptSecret } from "../crypto";
import type { getDb } from "../db";
import { aiProviders } from "../db/schema";
import { insertAuditLog } from "../lib/insert-audit-log";
import {
	deactivateUserSubscriptions,
	insertUserSubscriptionRecord,
} from "./subscription-records";

type ModelAccessWriter = Pick<ReturnType<typeof getDb>, "update" | "insert">;

export async function deactivateAllApiProviders(
	writer: ModelAccessWriter,
	userId: string,
) {
	await writer
		.update(aiProviders)
		.set({ isActive: false })
		.where(eq(aiProviders.userId, userId));
}

export async function activateApiProvider(
	writer: ModelAccessWriter,
	input: {
		userId: string;
		provider: ApiProviderId;
		apiKey: string;
		baseUrl: string | undefined;
		model: string;
		ipAddress: string | null;
	},
) {
	await deactivateUserSubscriptions(writer, input.userId);
	await deactivateAllApiProviders(writer, input.userId);

	await writer.insert(aiProviders).values({
		userId: input.userId,
		provider: input.provider,
		encryptedApiKey: encryptSecret(input.apiKey),
		baseUrl: input.baseUrl || null,
		model: input.model,
		label: formatAiProviderLabel(input.provider),
		isActive: true,
	});

	await insertAuditLog(writer, {
		userId: input.userId,
		action: "provider.saved",
		details: {
			provider: input.provider,
			model: input.model,
		},
		ipAddress: input.ipAddress,
	});
}

export async function activateSubscription(
	writer: ModelAccessWriter,
	input: {
		userId: string;
		subscriptionProvider: UserSubscriptionId;
		model: string;
		authMode: string;
		ipAddress: string | null;
	},
) {
	await deactivateAllApiProviders(writer, input.userId);
	await deactivateUserSubscriptions(writer, input.userId);

	await insertUserSubscriptionRecord(writer, {
		userId: input.userId,
		subscriptionProvider: input.subscriptionProvider,
		model: input.model,
		authMode: input.authMode,
	});

	await insertAuditLog(writer, {
		userId: input.userId,
		action: "subscription.saved",
		details: {
			subscriptionProvider: input.subscriptionProvider,
			model: input.model,
		},
		ipAddress: input.ipAddress,
	});
}
