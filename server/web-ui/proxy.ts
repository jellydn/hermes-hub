import type { EventEmitter } from "node:events";
import http from "node:http";
import type { Duplex } from "node:stream";
import { Readable } from "node:stream";

import type { Context } from "hono";
import type { NodeSSH } from "node-ssh";

import { isResponse } from "../lib/is-response";
import {
	type OwnedServerSshContext,
	requireOwnedServerSsh,
} from "../request-guards";
import type { SshConnectionInput } from "../ssh";
import {
	getResolvedServerWebUiRecord,
	type ServerWebUiRecord,
} from "./records";
import { withPooledSshConnection } from "./ssh-pool";

// ── Types ────────────────────────────────────────────────────────────

export type TcpForwardStream = EventEmitter & {
	write(chunk: Buffer | string): boolean;
	end(): void;
};

export type EnabledWebUiContext = OwnedServerSshContext & {
	webUi: ServerWebUiRecord;
};

const HOP_BY_HOP_REQUEST_HEADERS = new Set([
	"connection",
	"keep-alive",
	"proxy-authenticate",
	"proxy-authorization",
	"te",
	"trailer",
	"transfer-encoding",
	"upgrade",
	"host",
]);

const HOP_BY_HOP_RESPONSE_HEADERS = new Set([
	"connection",
	"keep-alive",
	"proxy-authenticate",
	"proxy-authorization",
	"te",
	"trailer",
	"transfer-encoding",
	"upgrade",
]);

// ── Error types ───────────────────────────────────────────────────────

export class WebUiProxyError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "WebUiProxyError";
	}
}

// ── Auth guard ────────────────────────────────────────────────────────

export async function requireEnabledWebUi(
	context: Context,
): Promise<EnabledWebUiContext | Response> {
	const owned = await requireOwnedServerSsh(context);
	if (isResponse(owned)) {
		return owned;
	}

	const webUi = await getResolvedServerWebUiRecord(owned.serverId);
	if (!webUi?.enabled) {
		return context.json(
			{ error: "Hermes Web UI is not enabled on this server." },
			400,
		);
	}

	return { ...owned, webUi };
}

// ── SSH TCP forward ──────────────────────────────────────────────────

export async function withSshTcpForward<T>(
	userId: string,
	serverId: string,
	input: SshConnectionInput & {
		remoteHost: string;
		remotePort: number;
	},
	run: (stream: TcpForwardStream) => Promise<T>,
): Promise<T> {
	return withPooledSshConnection(userId, serverId, input, async (ssh) => {
		const stream = await openTcpForward(
			ssh,
			input.remoteHost,
			input.remotePort,
		);
		try {
			return await run(stream);
		} finally {
			stream.end();
		}
	});
}

export async function proxyRequestOverSsh(input: {
	userId: string;
	serverId: string;
	ssh: SshConnectionInput;
	remoteHost: string;
	remotePort: number;
	request: Request;
	upstreamPath: string;
	upstreamHost?: string;
}) {
	return withSshTcpForward(
		input.userId,
		input.serverId,
		{
			...input.ssh,
			remoteHost: input.remoteHost,
			remotePort: input.remotePort,
		},
		(stream) =>
			proxyHttpOverStream({
				request: input.request,
				stream,
				upstreamPath: input.upstreamPath,
				upstreamHost: input.upstreamHost,
			}),
	);
}

function openTcpForward(
	ssh: NodeSSH,
	remoteHost: string,
	remotePort: number,
): Promise<TcpForwardStream> {
	const connection = ssh.connection;
	if (!connection) {
		return Promise.reject(new Error("SSH connection is not available"));
	}

	return new Promise((resolve, reject) => {
		connection.forwardOut(
			"127.0.0.1",
			0,
			remoteHost,
			remotePort,
			(error: Error | undefined, stream: TcpForwardStream) => {
				if (error) {
					reject(error);
					return;
				}

				resolve(stream);
			},
		);
	});
}

// ── URL/header rewriting ──────────────────────────────────────────────

function normalizeProxyBasePath(proxyBasePath: string) {
	return proxyBasePath.endsWith("/")
		? proxyBasePath.slice(0, -1)
		: proxyBasePath;
}

export function resolveProxyRequestTarget(
	requestUrl: string,
	proxyBasePath: string,
): string {
	const url = new URL(requestUrl);
	const normalizedBase = normalizeProxyBasePath(proxyBasePath);
	if (url.pathname === normalizedBase || url.pathname === proxyBasePath) {
		return "/";
	}

	return getUpstreamPath(requestUrl, proxyBasePath);
}

export function getUpstreamPath(requestUrl: string, proxyBasePath: string) {
	const url = new URL(requestUrl);
	const normalizedBase = normalizeProxyBasePath(proxyBasePath);
	const prefix = `${normalizedBase}/`;
	if (!url.pathname.startsWith(prefix)) {
		throw new Error(
			`Request path is not nested under proxy base: ${url.pathname}`,
		);
	}

	const subpath = url.pathname.slice(prefix.length);
	return subpath === "" ? "/" : `/${subpath}`;
}

function rewritePathLocationHeader(value: string, proxyBasePath: string) {
	const questionIndex = value.indexOf("?");
	const pathPart = questionIndex === -1 ? value : value.slice(0, questionIndex);
	const searchPart = questionIndex === -1 ? "" : value.slice(questionIndex + 1);

	const proxiedPath =
		pathPart === "/" ? proxyBasePath : joinProxyPath(proxyBasePath, pathPart);

	if (!searchPart) {
		return proxiedPath;
	}

	const params = new URLSearchParams(searchPart);
	rewriteNextSearchParam(params, proxyBasePath);
	const rewrittenSearch = params.toString();
	return rewrittenSearch ? `${proxiedPath}?${rewrittenSearch}` : proxiedPath;
}

function rewriteCookieSegment(segment: string, proxyBasePath: string) {
	const parts = segment.split(";").map((part) => part.trim());
	if (parts.length === 0) {
		return segment;
	}

	const rewritten = [parts[0] ?? ""];
	for (const attribute of parts.slice(1)) {
		const [namePart, ...valueParts] = attribute.split("=");
		const name = namePart.trim();
		const value = valueParts.join("=").trim();

		if (name.toLowerCase() === "path") {
			const nextPath =
				value === "/" ? proxyBasePath : joinProxyPath(proxyBasePath, value);
			rewritten.push(`Path=${nextPath}`);
			continue;
		}

		rewritten.push(attribute);
	}

	return rewritten.join("; ");
}

function joinProxyPath(proxyBasePath: string, upstreamPath: string) {
	const base = proxyBasePath.endsWith("/")
		? proxyBasePath.slice(0, -1)
		: proxyBasePath;
	const suffix = upstreamPath.startsWith("/")
		? upstreamPath
		: `/${upstreamPath}`;
	return `${base}${suffix}`;
}

function rewriteNextSearchParam(
	params: URLSearchParams,
	proxyBasePath: string,
) {
	const next = params.get("next");
	if (!next) {
		return;
	}

	params.set("next", rewriteUpstreamPathForProxy(next, proxyBasePath));
}

function rewriteUpstreamPathForProxy(
	upstreamPath: string,
	proxyBasePath: string,
) {
	if (upstreamPath === "/" || upstreamPath === "") {
		return proxyBasePath;
	}

	if (upstreamPath.startsWith("/")) {
		return joinProxyPath(proxyBasePath, upstreamPath);
	}

	return joinProxyPath(proxyBasePath, `/${upstreamPath}`);
}

export function rewriteLocationHeader(
	value: string,
	proxyBasePath: string,
	upstreamOrigin: string,
) {
	const trimmed = value.trim();
	if (trimmed.startsWith("/")) {
		return rewritePathLocationHeader(trimmed, proxyBasePath);
	}

	if (!trimmed.includes("://")) {
		return rewritePathLocationHeader(`/${trimmed}`, proxyBasePath);
	}

	try {
		const parsed = new URL(trimmed);
		if (parsed.origin === upstreamOrigin) {
			return rewritePathLocationHeader(
				`${parsed.pathname}${parsed.search}`,
				proxyBasePath,
			);
		}
	} catch {
		return value;
	}

	return value;
}

export function rewriteSetCookieHeader(value: string, proxyBasePath: string) {
	const segments = value.split(/,(?=\s*[^;=]+=)/);
	return segments
		.map((segment) => rewriteCookieSegment(segment.trim(), proxyBasePath))
		.join(", ");
}

export function rewriteProxyResponseHeaders(
	headers: Headers,
	proxyBasePath: string,
	upstreamOrigin: string,
) {
	const rewritten = new Headers();

	for (const [name, value] of headers.entries()) {
		const lowerName = name.toLowerCase();
		if (HOP_BY_HOP_RESPONSE_HEADERS.has(lowerName)) {
			continue;
		}

		if (lowerName === "location") {
			rewritten.set(
				name,
				rewriteLocationHeader(value, proxyBasePath, upstreamOrigin),
			);
			continue;
		}

		if (lowerName === "set-cookie") {
			rewritten.append(name, rewriteSetCookieHeader(value, proxyBasePath));
			continue;
		}

		rewritten.set(name, value);
	}

	return rewritten;
}

export function getPublicRequestEndpoint(request: Request) {
	const requestUrl = new URL(request.url);
	const forwardedHost = request.headers
		.get("x-forwarded-host")
		?.split(",")[0]
		?.trim();
	const hostHeader = request.headers.get("host")?.trim();
	const host = forwardedHost || hostHeader || requestUrl.host;

	const forwardedProto = request.headers
		.get("x-forwarded-proto")
		?.split(",")[0]
		?.trim()
		.toLowerCase();
	const proto =
		forwardedProto === "https" || forwardedProto === "http"
			? forwardedProto
			: requestUrl.protocol.replace(/:$/, "");

	return { host, proto };
}

export function buildUpstreamProxyHeaders(
	request: Request,
	upstreamHost: string,
): Record<string, string> {
	const { host, proto } = getPublicRequestEndpoint(request);
	const headers: Record<string, string> = {
		...filterRequestHeaders(request.headers),
		host: upstreamHost,
		connection: "close",
		"X-Forwarded-Host": host,
		"X-Forwarded-Proto": proto,
	};

	const forwardedFor = request.headers.get("x-forwarded-for");
	if (forwardedFor) {
		headers["X-Forwarded-For"] = forwardedFor;
	}

	return headers;
}

function filterRequestHeaders(headers: Headers) {
	const filtered: Record<string, string> = {};
	for (const [name, value] of headers.entries()) {
		if (!HOP_BY_HOP_REQUEST_HEADERS.has(name.toLowerCase())) {
			filtered[name] = value;
		}
	}
	return filtered;
}

// ── HTTP-over-stream proxy core ────────────────────────────────────────

export async function proxyHttpOverStream(input: {
	request: Request;
	stream: TcpForwardStream;
	upstreamPath: string;
	upstreamHost?: string;
}): Promise<Response> {
	if (input.request.headers.get("upgrade")?.toLowerCase() === "websocket") {
		throw new WebUiProxyError(
			"WebSocket connections are not supported through the HermesHub proxy yet.",
		);
	}

	const upstreamHost = input.upstreamHost ?? "127.0.0.1";
	const url = new URL(input.request.url);
	const path = `${input.upstreamPath}${url.search}`;

	return new Promise((resolve, reject) => {
		const outgoing = http.request(
			{
				createConnection: () => input.stream as Duplex,
				method: input.request.method,
				path,
				headers: buildUpstreamProxyHeaders(input.request, upstreamHost),
			},
			(incoming) => {
				const headers = new Headers();
				for (const [key, value] of Object.entries(incoming.headers)) {
					if (value === undefined) {
						continue;
					}

					if (Array.isArray(value)) {
						for (const item of value) {
							headers.append(key, item);
						}
					} else {
						headers.set(key, value);
					}
				}

				resolve(
					new Response(Readable.toWeb(incoming) as ReadableStream, {
						status: incoming.statusCode ?? 502,
						statusText: incoming.statusMessage,
						headers,
					}),
				);
			},
		);

		outgoing.on("error", reject);

		if (input.request.body) {
			Readable.fromWeb(
				input.request.body as Parameters<typeof Readable.fromWeb>[0],
			).pipe(outgoing);
		} else {
			outgoing.end();
		}
	});
}
