import { encryptSecret } from "../crypto";
import { getDb } from "../db";
import { insertAuditLog } from "../lib/insert-audit-log";
import { deployManagedCompose } from "../managed-compose-deploy";
import type { OwnedServerSshContext } from "../request-guards";
import { releaseWebUiDeployLock } from "./deploy-lock";
import { upsertServerWebUiRecord } from "./records";

export type WebUiBackgroundDeployInput = {
	ctx: OwnedServerSshContext;
	password: string;
	webUiPort: number;
	existingEnabled: boolean;
	ipAddress: string | null;
};

export async function runWebUiDeployInBackground(
	input: WebUiBackgroundDeployInput,
) {
	const { ctx, password, webUiPort, existingEnabled, ipAddress } = input;
	const db = getDb();

	try {
		await deployManagedCompose({
			intent: "web-ui",
			userId: ctx.session.user.id,
			serverId: ctx.serverId,
			host: ctx.server.host,
			port: ctx.server.port,
			username: ctx.server.username,
			authMethod: ctx.authMethod,
			credential: ctx.credential,
			expectedFingerprint: ctx.server.hostKeyFingerprint ?? undefined,
			webUiPassword: password,
			webUiPort,
		});

		const updatedAt = new Date();
		const encryptedPassword = encryptSecret(password);
		await db.transaction(async (tx) => {
			await upsertServerWebUiRecord(tx, {
				serverId: ctx.serverId,
				enabled: true,
				encryptedPassword,
				port: webUiPort,
				deployStatus: "succeeded",
				deployError: null,
				deployStartedAt: null,
				updatedAt,
			});

			await insertAuditLog(tx, {
				userId: ctx.session.user.id,
				action: "server.web_ui.deploy.succeeded",
				serverId: ctx.serverId,
				details: { serverId: ctx.serverId, serverHost: ctx.server.host },
				ipAddress,
			});
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : "Deploy failed";
		const updatedAt = new Date();

		await upsertServerWebUiRecord(db, {
			serverId: ctx.serverId,
			enabled: existingEnabled,
			port: webUiPort,
			deployStatus: "failed",
			deployError: message,
			deployStartedAt: null,
			updatedAt,
		});

		await insertAuditLog(db, {
			userId: ctx.session.user.id,
			action: "server.web_ui.deploy.failed",
			serverId: ctx.serverId,
			details: { serverId: ctx.serverId, error: message },
			ipAddress,
		});
	} finally {
		releaseWebUiDeployLock(ctx.serverId);
	}
}
