import type { Context } from "hono";

import { defaultHermesWebUiPort } from "../constants";
import { encryptSecret } from "../crypto";
import { getDb } from "../db";
import { getLatestInstallForServer } from "../install/records";
import { getClientIp } from "../lib/get-client-ip";
import { insertAuditLog } from "../lib/insert-audit-log";
import { requireOwnedServer, requireOwnedServerSsh } from "../request-guards";
import { runWebUiDeployInBackground } from "./background-deploy";
import {
	releaseWebUiDeployLock,
	tryAcquireWebUiDeployLock,
} from "./deploy-lock";
import { requireEnabledWebUi } from "./enabled-context";
import { resolveWebUiDeployPassword } from "./password";
import { getUpstreamPath, rewriteProxyResponseHeaders } from "./proxy-http";
import { formatWebUiProxyError } from "./reachability";
import {
	decryptWebUiPassword,
	getResolvedServerWebUiRecord,
	getWebUiProxyPath,
	upsertServerWebUiRecord,
} from "./records";
import { buildWebUiSnapshot } from "./snapshot";
import { proxyRequestOverSsh } from "./ssh-forward";
import { invalidatePooledSsh } from "./ssh-pool";

export async function getServerWebUiStatus(context: Context) {
	const owned = await requireOwnedServer(context);
	if (owned instanceof Response) {
		return owned;
	}

	const record = await getResolvedServerWebUiRecord(owned.serverId);
	return context.json({
		webUi: record ? buildWebUiSnapshot(owned.serverId, record) : null,
	});
}

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
	const existingRecord = await getResolvedServerWebUiRecord(ctx.serverId);

	if (existingRecord?.deployStatus === "deploying") {
		const webUiSnapshot = buildWebUiSnapshot(ctx.serverId, existingRecord);
		return context.json({ status: "deploying", webUi: webUiSnapshot }, 202);
	}

	if (!tryAcquireWebUiDeployLock(ctx.serverId)) {
		const record = await getResolvedServerWebUiRecord(ctx.serverId);
		const webUiSnapshot = record
			? buildWebUiSnapshot(ctx.serverId, record)
			: buildWebUiSnapshot(ctx.serverId, {
					enabled: false,
					encryptedPassword: null,
					port: defaultHermesWebUiPort,
					deployStatus: "deploying",
					deployError: null,
					deployStartedAt: new Date(),
					updatedAt: new Date(),
				});
		return context.json({ status: "deploying", webUi: webUiSnapshot }, 202);
	}

	const passwordResult = resolveWebUiDeployPassword(existingRecord);
	if ("error" in passwordResult) {
		releaseWebUiDeployLock(ctx.serverId);
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
	const webUiPort = existingRecord?.port ?? defaultHermesWebUiPort;
	const existingEnabled = existingRecord?.enabled ?? false;

	invalidatePooledSsh(ctx.session.user.id, ctx.serverId);

	const now = new Date();
	const encryptedPassword = encryptSecret(password);

	try {
		await upsertServerWebUiRecord(db, {
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

	const webUiSnapshot = buildWebUiSnapshot(ctx.serverId, {
		enabled: existingEnabled,
		encryptedPassword,
		port: webUiPort,
		deployStatus: "deploying",
		deployError: null,
		deployStartedAt: now,
		updatedAt: now,
	});

	void runWebUiDeployInBackground({
		ctx,
		password,
		webUiPort,
		existingEnabled,
		ipAddress,
	}).catch(async (error: unknown) => {
		console.error("Web UI background deploy task failed", {
			serverId: ctx.serverId,
			error,
		});

		const message = error instanceof Error ? error.message : "Deploy failed";

		try {
			await upsertServerWebUiRecord(db, {
				serverId: ctx.serverId,
				enabled: existingEnabled,
				port: webUiPort,
				deployStatus: "failed",
				deployError: message,
				deployStartedAt: null,
				updatedAt: new Date(),
			});
		} catch (persistError) {
			console.error("Failed to persist Web UI deploy failure", {
				serverId: ctx.serverId,
				persistError,
			});
		} finally {
			releaseWebUiDeployLock(ctx.serverId);
		}
	});

	return context.json({ status: "deploying", webUi: webUiSnapshot }, 202);
}

export async function revealServerWebUiPassword(context: Context) {
	const owned = await requireOwnedServer(context);
	if (owned instanceof Response) {
		return owned;
	}

	const webUiRecord = await getResolvedServerWebUiRecord(owned.serverId);
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
	const requestUrl = new URL(context.req.url);
	const proxyRoot = proxyBasePath.replace(/\/$/, "");
	if (requestUrl.pathname === proxyRoot) {
		return new Response(null, {
			status: 308,
			headers: { Location: proxyBasePath },
		});
	}
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
		return context.json(
			{ error: formatWebUiProxyError(error, ctx.webUi.port) },
			502,
		);
	}
}
