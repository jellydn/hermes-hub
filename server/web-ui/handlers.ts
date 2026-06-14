import type { Context } from "hono";

import { getClientIp } from "../lib/get-client-ip";
import { requireOwnedServer, requireOwnedServerSsh } from "../request-guards";
import { DeployError, getStatus, startDeploy } from "./deploy";
import {
	proxyRequestOverSsh,
	requireEnabledWebUi,
	resolveProxyRequestTarget,
	rewriteProxyResponseHeaders,
} from "./proxy";
import {
	decryptWebUiPassword,
	getResolvedServerWebUiRecord,
	getWebUiProxyPath,
} from "./records";

// ── Proxy error formatting ───────────────────────────────────────

const REMOTE_PORT_UNREACHABLE_MARKERS = [
	"Connection refused",
	"Channel open failure",
] as const;

const WEB_UI_UNREACHABLE_PROXY_MESSAGE =
	"Hermes Web UI is not reachable on the server (127.0.0.1:{port}). The container may have stopped or was removed during a later deploy. Open the server page and run Redeploy Web UI.";

export function isRemotePortUnreachable(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);
	return REMOTE_PORT_UNREACHABLE_MARKERS.some((marker) =>
		message.includes(marker),
	);
}

export function formatWebUiProxyError(error: unknown, port: number) {
	if (isRemotePortUnreachable(error)) {
		return WEB_UI_UNREACHABLE_PROXY_MESSAGE.replace("{port}", String(port));
	}

	return error instanceof Error ? error.message : String(error);
}

// ── Handlers ─────────────────────────────────────────────────────

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
	const upstreamPath = resolveProxyRequestTarget(
		context.req.url,
		proxyBasePath,
	);
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
