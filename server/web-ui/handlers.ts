import type { Context } from "hono";

import { defaultHermesWebUiPort } from "../constants";
import { encryptSecret } from "../crypto";
import { getDb } from "../db";
import { serverWebUi } from "../db/schema";
import { deployComposeViaSsh } from "../deploy";
import { getLatestInstallForServer } from "../install/records";
import { getClientIp } from "../lib/get-client-ip";
import { insertAuditLog } from "../lib/insert-audit-log";
import {
	buildManagedComposeContentFromSecrets,
	resolveManagedComposeSecrets,
} from "../server-compose";
import {
	requireEnabledWebUi,
	requireOwnedServer,
	requireOwnedServerSsh,
} from "./context";
import { resolveWebUiDeployPassword } from "./password";
import { getUpstreamPath, rewriteProxyResponseHeaders } from "./proxy-http";
import {
	decryptWebUiPassword,
	getServerWebUiRecord,
	getWebUiProxyPath,
} from "./records";
import { proxyRequestOverSsh } from "./ssh-forward";
import { invalidatePooledSsh } from "./ssh-pool";

export async function deployServerWebUi(context: Context) {
	const ctx = await requireOwnedServerSsh(context);
	if (ctx instanceof Response) {
		return ctx;
	}

	const installRecord = await getLatestInstallForServer(ctx.serverId);
	if (!installRecord) {
		return context.json(
			{ error: "Install Hermes on this server before setting up the Web UI." },
			400,
		);
	}
	if (installRecord.status !== "succeeded") {
		return context.json(
			{
				error:
					"The latest Hermes install did not succeed. Fix the install before setting up the Web UI.",
			},
			400,
		);
	}

	const db = getDb();
	const ipAddress = getClientIp(context);
	const existingRecord = await getServerWebUiRecord(ctx.serverId);

	const passwordResult = resolveWebUiDeployPassword(existingRecord);
	if ("error" in passwordResult) {
		const message = passwordResult.error;

		await insertAuditLog(db, {
			userId: ctx.session.user.id,
			action: "server.web_ui.deploy.failed",
			serverId: ctx.serverId,
			details: { serverId: ctx.serverId, error: message },
			ipAddress,
		});

		return context.json({ error: `Deploy failed: ${message}` }, 500);
	}
	const password = passwordResult.password;

	let composeContent: string;
	try {
		const secrets = await resolveManagedComposeSecrets({
			userId: ctx.session.user.id,
			serverId: ctx.serverId,
		});
		composeContent = buildManagedComposeContentFromSecrets({
			userId: ctx.session.user.id,
			serverId: ctx.serverId,
			secrets,
			webUiPassword: password,
		});
	} catch (error) {
		const message =
			error instanceof Error
				? error.message
				: "Failed to resolve managed compose settings";

		await insertAuditLog(db, {
			userId: ctx.session.user.id,
			action: "server.web_ui.deploy.failed",
			serverId: ctx.serverId,
			details: { serverId: ctx.serverId, error: message },
			ipAddress,
		});

		return context.json({ error: `Deploy failed: ${message}` }, 502);
	}

	invalidatePooledSsh(ctx.session.user.id, ctx.serverId);

	try {
		await deployComposeViaSsh({
			host: ctx.server.host,
			port: ctx.server.port,
			username: ctx.server.username,
			authMethod: ctx.authMethod,
			credential: ctx.credential,
			composeContent,
			expectedFingerprint: ctx.server.hostKeyFingerprint ?? undefined,
			preSshCommands: async (ssh) => {
				const workspaceResult = await ssh.execCommand("mkdir -p ~/workspace");
				if (workspaceResult.code !== 0) {
					throw new Error(
						workspaceResult.stderr || "Failed to create workspace directory",
					);
				}
			},
		});

		const updatedAt = new Date();
		await db.transaction(async (tx) => {
			await tx
				.insert(serverWebUi)
				.values({
					serverId: ctx.serverId,
					enabled: true,
					encryptedPassword: encryptSecret(password),
					port: existingRecord?.port ?? defaultHermesWebUiPort,
					updatedAt,
				})
				.onConflictDoUpdate({
					target: serverWebUi.serverId,
					set: {
						enabled: true,
						encryptedPassword: encryptSecret(password),
						port: existingRecord?.port ?? defaultHermesWebUiPort,
						updatedAt,
					},
				});

			await insertAuditLog(tx, {
				userId: ctx.session.user.id,
				action: "server.web_ui.deploy.succeeded",
				serverId: ctx.serverId,
				details: { serverId: ctx.serverId, serverHost: ctx.server.host },
				ipAddress,
			});
		});

		return context.json({
			status: "deployed",
			webUi: {
				enabled: true,
				port: existingRecord?.port ?? defaultHermesWebUiPort,
				proxyPath: getWebUiProxyPath(ctx.serverId),
				updatedAt: updatedAt.toISOString(),
			},
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : "Deploy failed";

		await insertAuditLog(db, {
			userId: ctx.session.user.id,
			action: "server.web_ui.deploy.failed",
			serverId: ctx.serverId,
			details: { serverId: ctx.serverId, error: message },
			ipAddress,
		});

		return context.json({ error: `Deploy failed: ${message}` }, 502);
	}
}

export async function revealServerWebUiPassword(context: Context) {
	const owned = await requireOwnedServer(context);
	if (owned instanceof Response) {
		return owned;
	}

	const webUiRecord = await getServerWebUiRecord(owned.serverId);
	if (!webUiRecord?.enabled) {
		return context.json(
			{ error: "Hermes Web UI is not enabled on this server." },
			400,
		);
	}

	const password = decryptWebUiPassword(webUiRecord.encryptedPassword);
	if (!password) {
		return context.json(
			{ error: "Failed to decrypt Hermes Web UI password." },
			500,
		);
	}

	return context.json({ password });
}

export async function proxyServerWebUi(context: Context) {
	const ctx = await requireEnabledWebUi(context);
	if (ctx instanceof Response) {
		return ctx;
	}

	const proxyBasePath = getWebUiProxyPath(ctx.serverId);
	const upstreamPath = getUpstreamPath(context.req.url, proxyBasePath);
	const upstreamOrigin = `http://127.0.0.1:${ctx.webUi.port}`;

	try {
		const upstreamResponse = await proxyRequestOverSsh({
			userId: ctx.session.user.id,
			serverId: ctx.serverId,
			ssh: {
				host: ctx.server.host,
				port: ctx.server.port,
				username: ctx.server.username,
				authMethod: ctx.authMethod,
				credential: ctx.credential,
				expectedFingerprint: ctx.server.hostKeyFingerprint ?? undefined,
			},
			remoteHost: "127.0.0.1",
			remotePort: ctx.webUi.port,
			request: context.req.raw,
			upstreamPath,
		});

		return new Response(upstreamResponse.body, {
			status: upstreamResponse.status,
			statusText: upstreamResponse.statusText,
			headers: rewriteProxyResponseHeaders(
				upstreamResponse.headers,
				proxyBasePath,
				upstreamOrigin,
			),
		});
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Proxy request failed";
		return context.json({ error: message }, 502);
	}
}
