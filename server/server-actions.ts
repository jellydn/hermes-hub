import { desc, eq } from "drizzle-orm";
import type { Context } from "hono";

import type { ServerActionType } from "#/lib/server-detail";
import { getAuthSession } from "./auth";
import { clearDashboardCache } from "./dashboard";
import { getDb } from "./db";
import { installs } from "./db/schema";
import {
	isValidDockerTag,
	restartGateway,
	rollbackGateway,
	updateGateway,
} from "./hermes/runtime";
import { getClientIp } from "./lib/get-client-ip";
import { insertAuditLog } from "./lib/insert-audit-log";
import {
	getRollbackTargetFromHistory,
	getServerDetailSnapshot,
	resolveRollbackTarget,
} from "./server-detail-snapshot";
import {
	getOwnedServerRecord,
	type OwnedServerRecord,
	resolveServerSshConfigOrError,
} from "./server-records";
import { type SshAuthMethod, SshConnectError, withSshConnection } from "./ssh";

export { getRollbackTargetFromHistory, getServerDetailSnapshot };

type ServerActionRequest = {
	action?: ServerActionType;
	targetVersion?: string;
};

export async function runServerAction(context: Context) {
	const session = await getAuthSession(context.req.raw.headers);

	if (!session) {
		return context.json({ error: "Unauthorized" }, 401);
	}

	const serverId = context.req.param("id");
	if (!serverId) {
		return context.json({ error: "Server ID is required" }, 400);
	}

	let payload: ServerActionRequest;
	try {
		payload = await context.req.json<ServerActionRequest>();
	} catch {
		return context.json({ error: "Invalid JSON body" }, 400);
	}

	const action = payload.action;
	if (
		!action ||
		(action !== "restart" && action !== "update" && action !== "rollback")
	) {
		return context.json(
			{ error: "Action must be restart, update, or rollback" },
			400,
		);
	}

	if (action === "rollback") {
		const requestedTag = payload.targetVersion?.trim();
		if (requestedTag && !isValidDockerTag(requestedTag)) {
			return context.json(
				{
					error:
						"Invalid target version. Use a Docker image tag of up to 128 alphanumeric, '.', '_' or '-' characters.",
				},
				400,
			);
		}
	}

	const db = getDb();
	const serverRecord = await getOwnedServerRecord({
		serverId,
		userId: session.user.id,
	});
	if (!serverRecord) {
		return context.json({ error: "Server not found" }, 404);
	}

	const sshResult = resolveServerSshConfigOrError(
		serverRecord,
		session.session.id,
	);
	if (!sshResult.ok) {
		return context.json({ error: sshResult.error }, 400);
	}
	const { authMethod, credential } = sshResult;

	const versionTarget =
		action === "rollback"
			? await resolveRollbackTarget({
					serverId,
					requestedVersion: payload.targetVersion,
				})
			: null;
	const ipAddress = getClientIp(context);

	await insertAuditLog(db, {
		userId: session.user.id,
		action: `server.action.${action}.started`,
		serverId,
		details: {
			serverId,
			host: serverRecord.host,
			...(versionTarget ? { imageRef: versionTarget } : {}),
		},
		ipAddress,
	});

	try {
		const commandOutput = await executeServerAction({
			server: serverRecord,
			authMethod,
			credential,
			action,
			versionTarget: versionTarget ?? undefined,
		});

		// Persist success audit log and (for update/rollback) install version in
		// a single transaction so both writes commit atomically. If the version
		// update fails, the audit log also rolls back, keeping the install
		// history consistent with the action record.
		await db.transaction(async (tx) => {
			await insertAuditLog(tx, {
				userId: session.user.id,
				action: `server.action.${action}.succeeded`,
				serverId,
				details: {
					serverId,
					host: serverRecord.host,
					message: actionSuccessMessage(action, versionTarget),
					output: commandOutput || null,
					...(versionTarget ? { imageRef: versionTarget } : {}),
				},
				ipAddress,
			});

			if (action === "update" || action === "rollback") {
				const [latestInstall] = await tx
					.select({ id: installs.id })
					.from(installs)
					.where(eq(installs.serverId, serverId))
					.orderBy(desc(installs.createdAt))
					.limit(1);

				if (latestInstall) {
					await tx
						.update(installs)
						.set({
							version: versionTarget ?? "latest",
							updatedAt: new Date(),
						})
						.where(eq(installs.id, latestInstall.id));
				}
			}
		});

		clearDashboardCache();

		return context.json({
			status: "succeeded",
			action,
			message: actionSuccessMessage(action, versionTarget),
			...(versionTarget ? { imageRef: versionTarget } : {}),
		});
	} catch (error) {
		const message = normalizeServerActionError(error);

		await insertAuditLog(db, {
			userId: session.user.id,
			action: `server.action.${action}.failed`,
			serverId,
			details: {
				serverId,
				host: serverRecord.host,
				message,
				...(versionTarget ? { imageRef: versionTarget } : {}),
			},
			ipAddress,
		});

		return context.json({ error: `Action failed: ${message}` }, 400);
	}
}

export async function getServerDetail(context: Context) {
	const session = await getAuthSession(context.req.raw.headers);

	if (!session) {
		return context.json({ error: "Unauthorized" }, 401);
	}

	const serverId = context.req.param("id");
	if (!serverId) {
		return context.json({ error: "Server ID is required" }, 400);
	}

	const detail = await getServerDetailSnapshot({
		serverId,
		userId: session.user.id,
	});
	if (!detail) {
		return context.json({ error: "Server not found" }, 404);
	}

	return context.json({ serverDetail: detail });
}

async function executeServerAction(input: {
	server: OwnedServerRecord;
	authMethod: SshAuthMethod;
	credential: string;
	action: ServerActionType;
	versionTarget?: string;
}): Promise<string> {
	return withSshConnection(
		{
			host: input.server.host,
			port: input.server.port,
			username: input.server.username,
			authMethod: input.authMethod,
			credential: input.credential,
			expectedFingerprint: input.server.hostKeyFingerprint ?? undefined,
			requireHostKeyPin: true,
		},
		async (ssh) => {
			switch (input.action) {
				case "restart":
					return restartGateway(ssh);
				case "update":
					return updateGateway(ssh);
				case "rollback":
					return rollbackGateway(ssh, input.versionTarget ?? "latest");
			}
		},
	);
}

function normalizeServerActionError(error: unknown) {
	if (error instanceof SshConnectError) {
		return error.message;
	}

	return error instanceof Error ? error.message : "Remote action failed";
}

function actionSuccessMessage(
	action: ServerActionType,
	versionTarget: string | null,
) {
	switch (action) {
		case "restart":
			return "Restarted Hermes successfully.";
		case "update":
			return "Updated Hermes to the latest image successfully.";
		default:
			return `Rolled Hermes back to ${versionTarget ?? "the previous image"}.`;
	}
}
