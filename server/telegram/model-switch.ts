import { and, eq, inArray } from "drizzle-orm";

import type { UserSubscriptionId } from "#/lib/user-subscriptions";
import { getDb } from "../db";
import { aiProviders, aiUserSubscriptions } from "../db/schema";
import {
	composeUp,
	setProviderInferenceProvider,
	setProviderModel,
	writeComposeFile,
} from "../hermes/runtime";
import { insertAuditLog } from "../lib/insert-audit-log";
import { buildDeployConfig } from "../providers";
import {
	type ActiveModelBackend,
	deriveActiveModelBackend,
	type StoredProviderRecordInput,
} from "../providers/active-backend";
import type { UserSubscriptionRecord } from "../providers/subscription-records";
import { buildManagedComposeContent } from "../server-compose";
import { withSshConnection } from "../ssh";
import type { SshConnectionInput } from "../ssh/connection";
import { parseOptionId, type ResolvedOption } from "./model-access";

export type ModelSwitchInput = {
	userId: string;
	optionId: string;
	model: string;
	resolved: ResolvedOption & { ok: true };
	serverRecord: { id: string; host: string };
	sshConfig: SshConnectionInput;
	ipAddress: string | null;
};

export async function executeModelSwitch(
	input: ModelSwitchInput,
): Promise<void> {
	const {
		userId,
		optionId,
		model,
		resolved,
		serverRecord,
		sshConfig,
		ipAddress,
	} = input;
	const db = getDb();
	const recordId = parseOptionId(optionId)?.recordId ?? "";

	let activeBackend: ActiveModelBackend | null = null;

	if (resolved.kind === "oauth-subscription") {
		const [record] = await db
			.select({
				subscriptionProvider: aiUserSubscriptions.subscriptionProvider,
				authMode: aiUserSubscriptions.authMode,
			})
			.from(aiUserSubscriptions)
			.where(
				and(
					eq(aiUserSubscriptions.id, recordId),
					eq(aiUserSubscriptions.userId, userId),
				),
			)
			.limit(1);

		if (!record) {
			throw new Error("Resolved model access option record not found.");
		}

		const subscriptionRecord: UserSubscriptionRecord = {
			subscriptionProvider: record.subscriptionProvider as UserSubscriptionId,
			model,
			authMode: record.authMode,
			isActive: true,
		};
		activeBackend = deriveActiveModelBackend(subscriptionRecord, null);
	} else {
		const [record] = await db
			.select({
				provider: aiProviders.provider,
				encryptedApiKey: aiProviders.encryptedApiKey,
				baseUrl: aiProviders.baseUrl,
			})
			.from(aiProviders)
			.where(and(eq(aiProviders.id, recordId), eq(aiProviders.userId, userId)))
			.limit(1);

		if (!record) {
			throw new Error("Resolved model access option record not found.");
		}

		const providerRecord: StoredProviderRecordInput = {
			provider: record.provider,
			model,
			encryptedApiKey: record.encryptedApiKey,
			baseUrl: record.baseUrl,
			isActive: true,
		};
		activeBackend = deriveActiveModelBackend(null, providerRecord);
	}

	if (!activeBackend) {
		throw new Error("Could not derive active model backend for switch.");
	}

	const providerConfigOverride = buildDeployConfig(activeBackend);

	await withSshConnection(sshConfig, async (ssh) => {
		await setProviderInferenceProvider(ssh, resolved.hermesProviderId);
		await setProviderModel(ssh, model);

		const composeContent = await buildManagedComposeContent({
			userId,
			serverId: serverRecord.id,
			providerConfigOverride,
		});
		await writeComposeFile(ssh, composeContent);
		await composeUp(ssh, { services: ["hermes"], forceRecreate: true });
	});

	await db.transaction(async (tx) => {
		const { providerIds, subscriptionIds } = resolved.activeOptionIds;

		if (providerIds.length > 0) {
			await tx
				.update(aiProviders)
				.set({ isActive: false })
				.where(inArray(aiProviders.id, providerIds));
		}
		if (subscriptionIds.length > 0) {
			await tx
				.update(aiUserSubscriptions)
				.set({ isActive: false, updatedAt: new Date() })
				.where(inArray(aiUserSubscriptions.id, subscriptionIds));
		}

		const recordId = parseOptionId(optionId)?.recordId ?? "";
		if (resolved.kind === "oauth-subscription") {
			await tx
				.update(aiUserSubscriptions)
				.set({ model, isActive: true, updatedAt: new Date() })
				.where(eq(aiUserSubscriptions.id, recordId));
		} else {
			await tx
				.update(aiProviders)
				.set({ model, isActive: true })
				.where(eq(aiProviders.id, recordId));
		}

		await insertAuditLog(tx, {
			userId,
			action: "telegram.model.switched",
			serverId: serverRecord.id,
			details: {
				optionId,
				model,
				provider: resolved.provider,
				kind: resolved.kind,
				serverHost: serverRecord.host,
			},
			ipAddress,
		});
	});
}
