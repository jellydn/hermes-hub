import type { Context } from "hono";

import { getClientIp } from "../lib/get-client-ip";
import { requireOwnedServer, requireOwnedServerSsh } from "../request-guards";
import { DeployError, getStatus, startDeploy } from "./deploy";
import { requireEnabledWebUi } from "./enabled-context";
import { getUpstreamPath, rewriteProxyResponseHeaders } from "./proxy-http";
import { formatWebUiProxyError } from "./reachability";
import {
	decryptWebUiPassword,
	getResolvedServerWebUiRecord,
	getWebUiProxyPath,
} from "./records";
import { proxyRequestOverSsh } from "./ssh-forward";

export async function getServerWebUiStatus(context: Context) {
	const owned = await requireOwnedServer(context);
	if (owned instanceof Response) {
		return owned;
	}

	const snapshot = await getStatus(owned.serverId);
	return context.json({ webUi: snapshot });
}

export async function deployServerWebUi(context: Context) {
	const ctx = await requireOwnedServerSsh(context);
	if (ctx instanceof Response) {
		return ctx;
	}

	const ipAddress = getClientIp(context);

	try {
		const result = await startDeploy(ctx, ipAddress);
		return context.json(result, 202 as const);
	} catch (error) {
		if (error instanceof DeployError) {
			return context.json({ error: error.message }, error.statusCode);
		}

		throw error;
	}
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
			400 as const,
		);
	}

	const password = decryptWebUiPassword(webUiRecord.encryptedPassword);
	if (!password) {
		return context.json(
			{ error: "Failed to decrypt Hermes Web UI password." },
			500 as const,
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
			502 as const,
		);
	}
}
