import { and, eq, isNull } from "drizzle-orm";

import { defaultHermesWebUiPort } from "../constants";
import { decryptSecret } from "../crypto";
import { getDb } from "../db";
import { serverWebUi } from "../db/schema";
import { normalizeDeployStatus } from "./deploy-status";
import { isStaleDeploy, STALE_DEPLOY_ERROR } from "./stale-deploy";

type DbClient = Pick<ReturnType<typeof getDb>, "insert">;

export type ServerWebUiRecord = {
	enabled: boolean;
	encryptedPassword: string | null;
	port: number;
	deployStatus: string;
	deployError: string | null;
	deployStartedAt: Date | null;
	updatedAt: Date;
};

export type ServerWebUiUpsertPatch = {
	serverId: string;
	enabled?: boolean;
	encryptedPassword?: string | null;
	port?: number;
	deployStatus?: string;
	deployError?: string | null;
	deployStartedAt?: Date | null;
	updatedAt?: Date;
};

export const WEB_UI_LANDING_SEGMENT = "chat";

export function getWebUiProxyPath(serverId: string) {
	return `/api/servers/${serverId}/web-ui/proxy/`;
}

export function getWebUiProxyLandingPath(serverId: string) {
	return `${getWebUiProxyPath(serverId)}${WEB_UI_LANDING_SEGMENT}`;
}

export async function getServerWebUiRecord(
	serverId: string,
): Promise<ServerWebUiRecord | null> {
	const [record] = await getDb()
		.select({
			enabled: serverWebUi.enabled,
			encryptedPassword: serverWebUi.encryptedPassword,
			port: serverWebUi.port,
			deployStatus: serverWebUi.deployStatus,
			deployError: serverWebUi.deployError,
			deployStartedAt: serverWebUi.deployStartedAt,
			updatedAt: serverWebUi.updatedAt,
		})
		.from(serverWebUi)
		.where(eq(serverWebUi.serverId, serverId))
		.limit(1);

	return record ?? null;
}

export async function upsertServerWebUiRecord(
	db: DbClient,
	patch: ServerWebUiUpsertPatch,
): Promise<void> {
	const now = patch.updatedAt ?? new Date();
	const updateSet: Partial<typeof serverWebUi.$inferInsert> = {
		updatedAt: now,
	};

	if (patch.enabled !== undefined) {
		updateSet.enabled = patch.enabled;
	}
	if (patch.encryptedPassword !== undefined) {
		updateSet.encryptedPassword = patch.encryptedPassword;
	}
	if (patch.port !== undefined) {
		updateSet.port = patch.port;
	}
	if (patch.deployStatus !== undefined) {
		updateSet.deployStatus = patch.deployStatus;
	}
	if (patch.deployError !== undefined) {
		updateSet.deployError = patch.deployError;
	}
	if (patch.deployStartedAt !== undefined) {
		updateSet.deployStartedAt = patch.deployStartedAt;
	}

	await db
		.insert(serverWebUi)
		.values({
			serverId: patch.serverId,
			enabled: patch.enabled ?? false,
			encryptedPassword: patch.encryptedPassword,
			port: patch.port ?? defaultHermesWebUiPort,
			deployStatus: patch.deployStatus ?? "idle",
			deployError: patch.deployError ?? null,
			deployStartedAt: patch.deployStartedAt ?? null,
			updatedAt: now,
		})
		.onConflictDoUpdate({
			target: serverWebUi.serverId,
			set: updateSet,
		});
}

function isStaleDeployingRecord(record: ServerWebUiRecord): boolean {
	return (
		normalizeDeployStatus(record.deployStatus) === "deploying" &&
		isStaleDeploy(record.deployStartedAt)
	);
}

function buildStaleDeployWhereClause(
	serverId: string,
	record: ServerWebUiRecord,
) {
	const conditions = [
		eq(serverWebUi.serverId, serverId),
		eq(serverWebUi.deployStatus, "deploying"),
	];

	if (record.deployStartedAt === null) {
		conditions.push(isNull(serverWebUi.deployStartedAt));
	} else {
		conditions.push(eq(serverWebUi.deployStartedAt, record.deployStartedAt));
	}

	return and(...conditions);
}

export async function resolveServerWebUiRecord(
	serverId: string,
	record: ServerWebUiRecord | null,
): Promise<ServerWebUiRecord | null> {
	if (!record || !isStaleDeployingRecord(record)) {
		return record;
	}

	const updatedAt = new Date();
	const [updatedRecord] = await getDb()
		.update(serverWebUi)
		.set({
			deployStatus: "failed",
			deployError: STALE_DEPLOY_ERROR,
			deployStartedAt: null,
			updatedAt,
		})
		.where(buildStaleDeployWhereClause(serverId, record))
		.returning({
			enabled: serverWebUi.enabled,
			encryptedPassword: serverWebUi.encryptedPassword,
			port: serverWebUi.port,
			deployStatus: serverWebUi.deployStatus,
			deployError: serverWebUi.deployError,
			deployStartedAt: serverWebUi.deployStartedAt,
			updatedAt: serverWebUi.updatedAt,
		});

	if (!updatedRecord) {
		return getServerWebUiRecord(serverId);
	}

	return updatedRecord;
}

export async function getResolvedServerWebUiRecord(serverId: string) {
	const record = await getServerWebUiRecord(serverId);
	return resolveServerWebUiRecord(serverId, record);
}

export function decryptWebUiPassword(encryptedPassword: string | null) {
	if (!encryptedPassword) {
		return null;
	}

	try {
		return decryptSecret(encryptedPassword);
	} catch {
		return null;
	}
}
