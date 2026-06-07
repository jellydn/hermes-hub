import crypto from "node:crypto";

import type { ServerWebUiSnapshot } from "#shared/contracts/server-web-ui";
import { defaultHermesWebUiPort } from "../constants";
import { encryptSecret } from "../crypto";
import { getDb } from "../db";
import { getLatestInstallForServer } from "../install/records";
import { insertAuditLog } from "../lib/insert-audit-log";
import { deployManagedCompose } from "../managed-compose-deploy";
import type { OwnedServerSshContext } from "../request-guards";
import {
	releaseWebUiDeployLock,
	tryAcquireWebUiDeployLock,
} from "./deploy-lock";
import {
	buildWebUiSnapshot,
	decryptWebUiPassword,
	getResolvedServerWebUiRecord,
	type ServerWebUiRecord,
	upsertServerWebUiRecord,
} from "./records";
import { invalidatePooledSsh } from "./ssh-pool";

// ── Password management ────────────────────────────────────────────────

export function generateWebUiPassword() {
	return crypto.randomBytes(18).toString("base64url");
}

export function resolveWebUiPasswordForCompose(input: {
	explicitPassword?: string;
	record: ServerWebUiRecord | null;
}): string | null {
	if (input.explicitPassword) {
		return input.explicitPassword;
	}

	if (!input.record?.enabled) {
		return null;
	}

	const password = decryptWebUiPassword(input.record.encryptedPassword);
	if (!password) {
		throw new Error(
			"Stored Hermes Web UI password could not be decrypted. Redeploy the Web UI before rewriting compose.",
		);
	}

	return password;
}

function resolveWebUiDeployPassword(
	existingRecord: ServerWebUiRecord | null,
): { password: string } | { error: string } {
	if (existingRecord?.encryptedPassword) {
		const password = decryptWebUiPassword(existingRecord.encryptedPassword);
		if (!password) {
			return {
				error:
					"Stored Hermes Web UI password could not be decrypted. Fix encryption configuration before redeploying.",
			};
		}

		return { password };
	}

	return { password: generateWebUiPassword() };
}

// ── Deploy orchestration ──────────────────────────────────────────────

export class DeployError extends Error {
	readonly statusCode: 400 | 500;

	constructor(message: string, statusCode: 400 | 500) {
		super(message);
		this.name = "DeployError";
		this.statusCode = statusCode;
	}
}

export type DeployResult = {
	status: "deploying";
	webUi: ServerWebUiSnapshot;
};

export async function getStatus(
	serverId: string,
): Promise<ServerWebUiSnapshot | null> {
	const record = await getResolvedServerWebUiRecord(serverId);
	if (!record) {
		return null;
	}

	return buildWebUiSnapshot(serverId, record);
}

export async function startDeploy(
	ctx: OwnedServerSshContext,
	ipAddress: string | null,
): Promise<DeployResult> {
	const installRecord = await getLatestInstallForServer(ctx.serverId);
	if (!installRecord) {
		throw new DeployError(
			"Install Hermes on this server before setting up the Web UI.",
			400,
		);
	}
	if (installRecord.status !== "succeeded") {
		throw new DeployError(
			"The latest Hermes install did not succeed. Fix the install before setting up the Web UI.",
			400,
		);
	}

	const existingRecord = await getResolvedServerWebUiRecord(ctx.serverId);

	if (existingRecord?.deployStatus === "deploying") {
		return {
			status: "deploying",
			webUi: buildWebUiSnapshot(ctx.serverId, existingRecord),
		};
	}

	if (!tryAcquireWebUiDeployLock(ctx.serverId)) {
		const record = await getResolvedServerWebUiRecord(ctx.serverId);
		const webUi = record
			? buildWebUiSnapshot(ctx.serverId, record)
			: buildWebUiSnapshot(ctx.serverId, buildDefaultRecord());
		return { status: "deploying", webUi };
	}

	const passwordResult = resolveWebUiDeployPassword(existingRecord);
	if ("error" in passwordResult) {
		releaseWebUiDeployLock(ctx.serverId);
		const message = passwordResult.error;

		await insertAuditLog(getDb(), {
			userId: ctx.session.user.id,
			action: "server.web_ui.deploy.failed",
			serverId: ctx.serverId,
			details: { serverId: ctx.serverId, error: message },
			ipAddress,
		});

		throw new DeployError(`Deploy failed: ${message}`, 500);
	}

	const password = passwordResult.password;
	const webUiPort = existingRecord?.port ?? defaultHermesWebUiPort;
	const existingEnabled = existingRecord?.enabled ?? false;

	invalidatePooledSsh(ctx.session.user.id, ctx.serverId);

	const now = new Date();
	const encryptedPassword = encryptSecret(password);

	try {
		await upsertServerWebUiRecord(getDb(), {
			serverId: ctx.serverId,
			enabled: existingEnabled,
			encryptedPassword,
			port: webUiPort,
			deployStatus: "deploying",
			deployError: null,
			deployStartedAt: now,
			updatedAt: now,
		});
	} catch (error) {
		releaseWebUiDeployLock(ctx.serverId);
		throw error;
	}

	const record: ServerWebUiRecord = {
		enabled: existingEnabled,
		encryptedPassword,
		port: webUiPort,
		deployStatus: "deploying",
		deployError: null,
		deployStartedAt: now,
		updatedAt: now,
	};

	void runDeployInBackground({
		ctx,
		password,
		webUiPort,
		existingEnabled,
		ipAddress,
	});

	return {
		status: "deploying",
		webUi: buildWebUiSnapshot(ctx.serverId, record),
	};
}

// ── Internal helpers ────────────────────────────────────────────

type BackgroundDeployInput = {
	ctx: OwnedServerSshContext;
	password: string;
	webUiPort: number;
	existingEnabled: boolean;
	ipAddress: string | null;
};

async function runDeployInBackground(input: BackgroundDeployInput) {
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

function buildDefaultRecord(): ServerWebUiRecord {
	const now = new Date();
	return {
		enabled: false,
		encryptedPassword: null,
		port: defaultHermesWebUiPort,
		deployStatus: "deploying",
		deployError: null,
		deployStartedAt: now,
		updatedAt: now,
	};
}
