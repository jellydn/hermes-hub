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
import { buildUpstreamProxyHeaders } from "./rewriter";
import { withPooledSshConnection } from "./ssh-pool";

// ── Types ────────────────────────────────────────────────────────────

export type TcpForwardStream = EventEmitter & {
	write(chunk: Buffer | string): boolean;
	end(): void;
};

export type EnabledWebUiContext = OwnedServerSshContext & {
	webUi: ServerWebUiRecord;
};

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
