import http from "node:http";
import type { Duplex } from "node:stream";
import { Readable } from "node:stream";

import {
	HOP_BY_HOP_REQUEST_HEADERS,
	type TcpForwardStream,
	WebUiProxyError,
} from "./proxy-types";

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

function filterRequestHeaders(headers: Headers) {
	const filtered: Record<string, string> = {};
	for (const [name, value] of headers.entries()) {
		if (!HOP_BY_HOP_REQUEST_HEADERS.has(name.toLowerCase())) {
			filtered[name] = value;
		}
	}
	return filtered;
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
