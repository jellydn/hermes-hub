import type { Context } from "hono";

import { getAuthSession } from "../auth";
import { clearDashboardCache } from "../dashboard";
import { getDb } from "../db";
import {
	readHermesConfigYaml,
	writeHermesConfigYaml,
} from "../hermes/mcp-config";
import { deployToTelegramLinkedHermes } from "../hermes/telegram-deploy";
import { getClientIp } from "../lib/get-client-ip";
import { insertAuditLog } from "../lib/insert-audit-log";
import { requireAuthSession } from "../request-guards";
import {
	type McpServerSummary,
	parseMcpServerCreateBody,
	parseMcpServerUpdateBody,
} from "./mcp/config";
import {
	createMcpServerRecord,
	deleteMcpServerRecord,
	getCurrentMcpServers,
	getMcpServerByName,
	getOwnedMcpServerRecord,
	listMcpServerRecords,
	updateMcpServerRecord,
} from "./mcp/records";
import { validateUpdatedSecretEntries } from "./mcp/secrets";
import { buildMcpServersConfig, mergeHermesConfigMcpServers } from "./mcp/yaml";

export type { McpServerSummary };

export { getCurrentMcpServers };

const MCP_SERVER_NAME_CONFLICT_ERROR =
	"An MCP server with this name already exists.";

function isMcpServerNameConflict(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		error.code === "23505"
	);
}

export async function createMcpServer(context: Context) {
	const session = await getAuthSession(context.req.raw.headers);
	if (!session) {
		return context.json({ error: "Unauthorized" }, 401);
	}

	let payload: unknown;
	try {
		payload = await context.req.json();
	} catch {
		return context.json({ error: "Invalid JSON body" }, 400);
	}

	const parsed = parseMcpServerCreateBody(payload);
	if (!parsed.ok) {
		return context.json({ error: parsed.error }, 400);
	}

	const existing = await getMcpServerByName(session.user.id, parsed.data.name);
	if (existing) {
		return context.json({ error: MCP_SERVER_NAME_CONFLICT_ERROR }, 400);
	}

	const db = getDb();
	const ipAddress = getClientIp(context);

	try {
		const server = await db.transaction(async (tx) => {
			const created = await createMcpServerRecord(tx, {
				userId: session.user.id,
				...parsed.data,
			});

			await insertAuditLog(tx, {
				userId: session.user.id,
				action: "mcp_server.created",
				details: {
					serverId: created.id,
					name: created.name,
					transport: created.transport,
				},
				ipAddress,
			});

			return created;
		});

		clearDashboardCache();
		return context.json({ server });
	} catch (error) {
		if (isMcpServerNameConflict(error)) {
			return context.json({ error: MCP_SERVER_NAME_CONFLICT_ERROR }, 400);
		}

		const message =
			error instanceof Error ? error.message : "Unable to create MCP server.";
		return context.json({ error: message }, 500);
	}
}

export async function updateMcpServer(context: Context) {
	const session = await getAuthSession(context.req.raw.headers);
	if (!session) {
		return context.json({ error: "Unauthorized" }, 401);
	}

	const serverId = context.req.param("id");
	if (!serverId) {
		return context.json({ error: "Server id is required." }, 400);
	}

	let payload: unknown;
	try {
		payload = await context.req.json();
	} catch {
		return context.json({ error: "Invalid JSON body" }, 400);
	}

	const existing = await getOwnedMcpServerRecord(session.user.id, serverId);
	if (!existing) {
		return context.json({ error: "MCP server not found." }, 404);
	}

	const parsed = parseMcpServerUpdateBody(existing, payload);
	if (!parsed.ok) {
		return context.json({ error: parsed.error }, 400);
	}

	if (parsed.data.transport === "stdio") {
		const envValidation = validateUpdatedSecretEntries(
			existing.encryptedEnv,
			parsed.data.env,
			"Environment variable",
		);
		if (!envValidation.ok) {
			return context.json({ error: envValidation.error }, 400);
		}
	} else {
		const headerValidation = validateUpdatedSecretEntries(
			existing.encryptedHeaders,
			parsed.data.headers,
			"Header",
		);
		if (!headerValidation.ok) {
			return context.json({ error: headerValidation.error }, 400);
		}
	}

	if (parsed.data.name !== existing.name) {
		const nameConflict = await getMcpServerByName(
			session.user.id,
			parsed.data.name,
		);
		if (nameConflict && nameConflict.id !== existing.id) {
			return context.json({ error: MCP_SERVER_NAME_CONFLICT_ERROR }, 400);
		}
	}

	const db = getDb();
	const ipAddress = getClientIp(context);

	try {
		const server = await db.transaction(async (tx) => {
			const updated = await updateMcpServerRecord(tx, {
				userId: session.user.id,
				serverId,
				existing,
				...parsed.data,
			});

			await insertAuditLog(tx, {
				userId: session.user.id,
				action: "mcp_server.updated",
				details: {
					serverId: updated.id,
					name: updated.name,
					transport: updated.transport,
				},
				ipAddress,
			});

			return updated;
		});

		clearDashboardCache();
		return context.json({ server });
	} catch (error) {
		if (isMcpServerNameConflict(error)) {
			return context.json({ error: MCP_SERVER_NAME_CONFLICT_ERROR }, 400);
		}

		const message =
			error instanceof Error ? error.message : "Unable to update MCP server.";
		return context.json({ error: message }, 500);
	}
}

export async function deleteMcpServer(context: Context) {
	const session = await getAuthSession(context.req.raw.headers);
	if (!session) {
		return context.json({ error: "Unauthorized" }, 401);
	}

	const serverId = context.req.param("id");
	if (!serverId) {
		return context.json({ error: "Server id is required." }, 400);
	}

	const db = getDb();
	const ipAddress = getClientIp(context);

	try {
		const deleted = await db.transaction(async (tx) => {
			const record = await deleteMcpServerRecord(tx, session.user.id, serverId);
			if (!record) {
				return null;
			}

			await insertAuditLog(tx, {
				userId: session.user.id,
				action: "mcp_server.deleted",
				details: {
					serverId: record.id,
					name: record.name,
				},
				ipAddress,
			});

			return record;
		});

		if (!deleted) {
			return context.json({ error: "MCP server not found." }, 404);
		}

		clearDashboardCache();
		return context.json({ status: "deleted", id: deleted.id });
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Unable to delete MCP server.";
		return context.json({ error: message }, 500);
	}
}

export async function deployMcpServersToHermes(context: Context) {
	const session = await requireAuthSession(context);
	if (session instanceof Response) {
		return session;
	}

	const records = await listMcpServerRecords(session.user.id);
	const mcpServersConfig = buildMcpServersConfig(records);

	return deployToTelegramLinkedHermes(context, session, {
		deploy: async (ssh) => {
			const existingYaml = await readHermesConfigYaml(ssh);
			const mergedYaml = mergeHermesConfigMcpServers(
				existingYaml,
				mcpServersConfig,
			);
			await writeHermesConfigYaml(ssh, mergedYaml);
		},
		failureAuditAction: "mcp.deploy.failed",
		successAuditAction: "mcp.deployed",
		buildFailureAuditDetails: (sshCtx, error) => ({
			serverId: sshCtx.serverId,
			serverHost: sshCtx.server.host,
			error,
			serverCount: records.length,
		}),
		buildSuccessAuditDetails: (sshCtx) => ({
			serverId: sshCtx.serverId,
			serverHost: sshCtx.server.host,
			serverCount: records.length,
		}),
		buildSuccessResponse: (sshCtx, deployedAt) => ({
			serverHost: sshCtx.server.host,
			serverCount: records.length,
			deployedAt: deployedAt.toISOString(),
		}),
	});
}
