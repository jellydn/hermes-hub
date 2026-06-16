import { Duplex } from "node:stream";

import { describe, expect, it } from "vitest";
import type { TcpForwardStream } from "./proxy";
import { proxyHttpOverStream, WebUiProxyError } from "./proxy";

function createMockForwardStream(response: string) {
	let responded = false;

	return new (class extends Duplex {
		_write(
			_chunk: Buffer,
			_encoding: BufferEncoding,
			callback: (error?: Error | null) => void,
		) {
			if (!responded) {
				responded = true;
				this.push(Buffer.from(response));
				this.push(null);
			}
			callback();
		}

		_read() {}

		// node:_http_client calls sock.setTimeout(msecs, callback)
		// when ClientRequest.setTimeout is used on a createConnection socket.
		setTimeout(_msecs?: number, _callback?: () => void) {
			return this;
		}
	})() as TcpForwardStream;
}

describe("proxyHttpOverStream integration", () => {
	it("proxies a GET response over a forwarded stream", async () => {
		const stream = createMockForwardStream(
			"HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: 5\r\nConnection: close\r\n\r\nhello",
		);

		const response = await proxyHttpOverStream({
			request: new Request(
				"http://localhost:3000/api/servers/server_123/web-ui/proxy/app?q=1",
			),
			stream,
			upstreamPath: "/app",
		});

		expect(response.status).toBe(200);
		expect(await response.text()).toBe("hello");
	});

	it("rejects WebSocket upgrade requests", async () => {
		const stream = createMockForwardStream("");

		await expect(
			proxyHttpOverStream({
				request: new Request("http://localhost:3000/proxy", {
					headers: { Upgrade: "websocket" },
				}),
				stream,
				upstreamPath: "/",
			}),
		).rejects.toBeInstanceOf(WebUiProxyError);
	});
});
