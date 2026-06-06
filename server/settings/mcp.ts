import type { Context } from "hono";

import { getAuthSession } from "../auth";
import { clearDashboardCache } from "../dashboard";
import { getDb } from "../db";
import {
	readHermesConfigYaml,
	writeHermesConfigYaml,
} from "../hermes/mcp-config";
import { restartGateway } from "../hermes/runtime";
import { resolveTelegramHermesDeployContext } from "../hermes/telegram-deploy-context";
import { getClientIp } from "../lib/get-client-ip";
import { insertAuditLog } from "../lib/insert-audit-log";
import { requireAuthSession } from "../request-guards";
import { withSshConnection } from "../ssh";
import { type McpServerSummary, parseMcpServerBody } from "./mcp/config";
import {
	createMcpServerRecord,
	deleteMcpServerRecord,
	getCurrentMcpServers,
	getMcpServerByName,
	getOwnedMcpServerRecord,
	listMcpServerRecords,
	updateMcpServerRecord,
} from "./mcp/records";
import { buildMcpServersConfig, mergeHermesConfigMcpServers } from "./mcp/yaml";

export type { McpServerSummary };

export { getCurrentMcpServers };

export async function listMcpServers(context: Context) {
	const session = await getAuthSession(context.req.raw.headers);
	if (!session) {
		return context.json({ error: "Unauthorized" }, 401);
	}

	const servers = await getCurrentMcpServers(session.user.id);
	return context.json({ servers });
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

	const parsed = parseMcpServerBody(payload, { requireAllFields: true });
	if (!parsed.ok) {
		return context.json({ error: parsed.error }, 400);
	}

	const existing = await getMcpServerByName(session.user.id, parsed.data.name);
	if (existing) {
		return context.json(
			{ error: "An MCP server with this name already exists." },
			400,
		);
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

	const parsed = parseMcpServerBody({
		name: existing.name,
		transport: existing.transport,
		enabled: existing.enabled,
		command: existing.command ?? undefined,
		args: existing.args,
		url: existing.url ?? undefined,
		toolsInclude: existing.toolsInclude,
		toolsExclude: existing.toolsExclude,
		toolsResources: existing.toolsResources,
		toolsPrompts: existing.toolsPrompts,
		timeout: existing.timeout,
		connectTimeout: existing.connectTimeout,
		supportsParallelToolCalls: existing.supportsParallelToolCalls,
		...(payload as Record<string, unknown>),
	});
	if (!parsed.ok) {
		return context.json({ error: parsed.error }, 400);
	}

	if (parsed.data.name !== existing.name) {
		const nameConflict = await getMcpServerByName(
			session.user.id,
			parsed.data.name,
		);
		if (nameConflict && nameConflict.id !== existing.id) {
			return context.json(
				{ error: "An MCP server with this name already exists." },
				400,
			);
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

	const deployCtx = await resolveTelegramHermesDeployContext(context, session);
	if (deployCtx instanceof Response) {
		return deployCtx;
	}

	const { sshCtx } = deployCtx;
	const records = await listMcpServerRecords(session.user.id);
	const mcpServersConfig = buildMcpServersConfig(records);
	const db = getDb();
	const ipAddress = getClientIp(context);

	try {
		await withSshConnection(
			{
				host: sshCtx.server.host,
				port: sshCtx.server.port,
				username: sshCtx.server.username,
				authMethod: sshCtx.authMethod,
				credential: sshCtx.credential,
				expectedFingerprint: sshCtx.server.hostKeyFingerprint ?? undefined,
			},
			async (ssh) => {
				const existingYaml = await readHermesConfigYaml(ssh);
				const mergedYaml = mergeHermesConfigMcpServers(
					existingYaml,
					mcpServersConfig,
				);
				await writeHermesConfigYaml(ssh, mergedYaml);
				await restartGateway(ssh);
			},
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : "Deploy failed";

		try {
			await insertAuditLog(db, {
				userId: session.user.id,
				action: "mcp.deploy.failed",
				serverId: sshCtx.serverId,
				details: {
					serverId: sshCtx.serverId,
					serverHost: sshCtx.server.host,
					error: message,
					serverCount: records.length,
				},
				ipAddress,
			});
		} catch {
			// Audit logging is historical only; still return deploy failure to client.
		}

		return context.json({ error: `Deploy failed: ${message}` }, 502);
	}

	const deployedAt = new Date();

	try {
		await insertAuditLog(db, {
			userId: session.user.id,
			action: "mcp.deployed",
			serverId: sshCtx.serverId,
			details: {
				serverId: sshCtx.serverId,
				serverHost: sshCtx.server.host,
				serverCount: records.length,
			},
			ipAddress,
		});
	} catch {
		// Deploy already succeeded remotely; audit logging is historical only.
	}

	clearDashboardCache();

	return context.json({
		status: "deployed",
		serverHost: sshCtx.server.host,
		serverCount: records.length,
		deployedAt: deployedAt.toISOString(),
	});
}
