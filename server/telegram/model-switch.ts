import { eq, inArray } from "drizzle-orm";

import { getDb } from "../db";
import { aiProviders, aiUserSubscriptions } from "../db/schema";
import {
	composeUp,
	setProviderInferenceProvider,
	setProviderModel,
	writeComposeFile,
} from "../hermes/runtime";
import { insertAuditLog } from "../lib/insert-audit-log";
import { buildManagedComposeContent } from "../server-compose";
import { withSshConnection } from "../ssh";
import type { SshConnectionInput } from "../ssh/connection";
import type { ResolvedOption } from "./model-access";

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

	await withSshConnection(sshConfig, async (ssh) => {
		await setProviderInferenceProvider(ssh, resolved.hermesProviderId);
		await setProviderModel(ssh, model);

		const composeContent = await buildManagedComposeContent({
			userId,
			serverId: serverRecord.id,
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

		const recordId = optionId.split(":")[1];
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
