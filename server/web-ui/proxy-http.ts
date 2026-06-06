import http from "node:http";
import type { Duplex } from "node:stream";
import { Readable } from "node:stream";

import type { TcpForwardStream } from "./tcp-stream";

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

export class WebUiProxyError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "WebUiProxyError";
	}
}

export function getUpstreamPath(requestUrl: string, proxyBasePath: string) {
	const url = new URL(requestUrl);
	const normalizedBase = proxyBasePath.endsWith("/")
		? proxyBasePath.slice(0, -1)
		: proxyBasePath;
	const prefix = `${normalizedBase}/`;
	const pathname = url.pathname.startsWith(prefix)
		? `/${url.pathname.slice(prefix.length)}`
		: url.pathname === normalizedBase
			? "/"
			: url.pathname;
	return pathname === "" ? "/" : pathname;
}

export function rewriteLocationHeader(
	value: string,
	proxyBasePath: string,
	upstreamOrigin: string,
) {
	const trimmed = value.trim();
	if (trimmed.startsWith("/")) {
		return joinProxyPath(proxyBasePath, trimmed);
	}

	try {
		const parsed = new URL(trimmed);
		if (parsed.origin === upstreamOrigin) {
			return joinProxyPath(proxyBasePath, `${parsed.pathname}${parsed.search}`);
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

function filterRequestHeaders(headers: Headers) {
	const filtered: Record<string, string> = {};
	for (const [name, value] of headers.entries()) {
		if (!HOP_BY_HOP_REQUEST_HEADERS.has(name.toLowerCase())) {
			filtered[name] = value;
		}
	}
	return filtered;
}

function rewriteCookieSegment(segment: string, proxyBasePath: string) {
	const parts = segment.split(";").map((part) => part.trim());
	if (parts.length === 0) {
		return segment;
	}

	const rewritten = [parts[0] ?? ""];
	for (const attribute of parts.slice(1)) {
		const separator = attribute.indexOf("=");
		const name = (
			separator === -1 ? attribute : attribute.slice(0, separator)
		).trim();
		const value = separator === -1 ? "" : attribute.slice(separator + 1).trim();

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
