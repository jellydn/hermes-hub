import { desc, eq } from "drizzle-orm";
import type { Context } from "hono";

import type { ServerActionType } from "../src/lib/server-detail";
import { getAuthSession } from "./auth";
import { hermesImageRepository } from "./constants";
import { clearDashboardCache } from "./dashboard";
import { getDb } from "./db";
import { auditLogs, installs } from "./db/schema";
import { getClientIp } from "./lib/get-client-ip";
import {
	getRollbackTargetFromHistory,
	getServerDetailSnapshot,
} from "./server-detail-snapshot";
import {
	getOwnedServerRecord,
	type OwnedServerRecord,
	resolveServerSshConfigOrError,
} from "./server-records";
import { type SshAuthMethod, SshConnectError, withSshConnection } from "./ssh";

export { getRollbackTargetFromHistory, getServerDetailSnapshot };

// Docker image tag reference grammar:
// first char must be alphanumeric or underscore; subsequent chars may
// additionally include `.` and `-`; max 128 chars total.
// See https://docs.docker.com/reference/cli/docker/image/tag/#description
const DOCKER_TAG_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/;

function isValidDockerTag(tag: string): boolean {
	return DOCKER_TAG_PATTERN.test(tag);
}

const actionCommands: Record<
	ServerActionType,
	(targetVersion?: string) => string
> = {
	restart: () => "cd ~/hermes && sudo docker compose restart",
	update: () =>
		"cd ~/hermes && sudo docker compose pull && sudo docker compose up -d",
	rollback: (targetVersion) => {
		const imageTag = targetVersion?.trim() || "latest";
		if (!isValidDockerTag(imageTag)) {
			throw new Error(`Invalid image tag: ${imageTag}`);
		}
		return [
			"cd ~/hermes",
			`sudo docker pull ${hermesImageRepository}:${imageTag}`,
			`sudo sed -i.bak 's|image: ${hermesImageRepository}:.*|image: ${hermesImageRepository}:${imageTag}|' docker-compose.yml`,
			"sudo docker compose up -d",
		].join(" && ");
	},
};

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
	if (!action || !(action in actionCommands)) {
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
			? payload.targetVersion?.trim() ||
				(await getRollbackTarget(serverId)) ||
				"latest"
			: null;
	const ipAddress = getClientIp(context);

	await db.insert(auditLogs).values({
		userId: session.user.id,
		action: `server.action.${action}.started`,
		details: {
			serverId,
			host: serverRecord.host,
			...(versionTarget ? { imageRef: versionTarget } : {}),
		},
		ipAddress,
	});

	try {
		const command = actionCommands[action](versionTarget ?? undefined);
		const commandOutput = await executeServerAction({
			server: serverRecord,
			authMethod,
			credential,
			command,
		});

		// Persist success audit log and (for update/rollback) install version in
		// a single transaction so both writes commit atomically. If the version
		// update fails, the audit log also rolls back, keeping the install
		// history consistent with the action record.
		await db.transaction(async (tx) => {
			await tx.insert(auditLogs).values({
				userId: session.user.id,
				action: `server.action.${action}.succeeded`,
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

		await db.insert(auditLogs).values({
			userId: session.user.id,
			action: `server.action.${action}.failed`,
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
	command: string;
}) {
	return withSshConnection(
		{
			host: input.server.host,
			port: input.server.port,
			username: input.server.username,
			authMethod: input.authMethod,
			credential: input.credential,
		},
		async (ssh) => {
			const result = await ssh.execCommand(input.command);
			if (result.code !== 0) {
				throw new Error(result.stderr || "Remote command failed");
			}

			return result.stdout.trim();
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

async function getRollbackTarget(serverId: string) {
	const [latestInstall] = await getDb()
		.select({ version: installs.version })
		.from(installs)
		.where(eq(installs.serverId, serverId))
		.orderBy(desc(installs.createdAt))
		.limit(1);

	return latestInstall?.version ?? null;
}
