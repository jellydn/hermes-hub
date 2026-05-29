import http from "node:http";
import { Readable } from "node:stream";
import app from "../dist/server/server.js";

const host = process.env.HOST ?? "0.0.0.0";
const port = Number.parseInt(process.env.PORT ?? "3000", 10);

const server = http.createServer(async (req, res) => {
	const headers = req.headers.host
		? req.headers.host.startsWith("http")
			? req.headers.host
			: `http://${req.headers.host}`
		: `http://${host}:${port}`;
	const url = new URL(req.url ?? "/", headers);
	const canHaveBody = req.method !== "GET" && req.method !== "HEAD";
	const body = canHaveBody ? Readable.toWeb(req) : undefined;

	try {
		const response = await app.fetch(
			new Request(url, {
				method: req.method,
				headers: req.headers,
				body,
				duplex: canHaveBody ? "half" : undefined,
			}),
		);

		res.statusCode = response.status;
		res.statusMessage = response.statusText;

		const setCookies = response.headers.getSetCookie?.() ?? [];
		if (setCookies.length > 0) {
			res.setHeader("set-cookie", setCookies);
		}

		response.headers.forEach((value, key) => {
			if (key === "set-cookie") {
				return;
			}
			res.setHeader(key, value);
		});

		if (!response.body) {
			res.end();
			return;
		}

		Readable.fromWeb(response.body).pipe(res);
	} catch (error) {
		console.error(error);
		if (!res.headersSent) {
			res.statusCode = 500;
			res.setHeader("content-type", "application/json");
		}
		res.end(JSON.stringify({ error: "Internal Server Error" }));
	}
});

server.listen(port, host, () => {
	console.log(`HermesHub listening on http://${host}:${port}`);
});
