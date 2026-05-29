import { execSync } from "node:child_process";
import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import http from "node:http";
import path, { join } from "node:path";
import { Readable } from "node:stream";
import app from "../dist/server/server.js";

const clientDir = path.join(import.meta.dirname, "..", "dist", "client");

const MIME_TYPES = {
	".css": "text/css; charset=utf-8",
	".js": "application/javascript; charset=utf-8",
	".mjs": "application/javascript; charset=utf-8",
	".json": "application/json",
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".gif": "image/gif",
	".svg": "image/svg+xml",
	".ico": "image/x-icon",
	".webp": "image/webp",
	".woff2": "font/woff2",
	".woff": "font/woff",
	".ttf": "font/ttf",
	".txt": "text/plain; charset=utf-8",
	".html": "text/html; charset=utf-8",
	".xml": "application/xml",
};

async function serveStatic(urlPath, res) {
	const method = res.req.method;
	if (method !== "GET" && method !== "HEAD") {
		return false;
	}

	const filePath = path.join(clientDir, urlPath);

	// Prevent directory traversal
	const relative = path.relative(clientDir, filePath);
	if (relative.startsWith("..") || path.isAbsolute(relative)) {
		return false;
	}

	if (!existsSync(filePath)) {
		return false;
	}

	try {
		const stats = await stat(filePath);
		if (!stats.isFile()) {
			return false;
		}

		const ext = path.extname(filePath).toLowerCase();
		const contentType = MIME_TYPES[ext] ?? "application/octet-stream";

		res.statusCode = 200;
		res.setHeader("content-type", contentType);
		res.setHeader("content-length", stats.size);

		// Aggressive caching for content-hashed assets
		if (/-[a-zA-Z0-9_-]{8,}\.\w+$/.test(urlPath)) {
			res.setHeader("cache-control", "public, max-age=31536000, immutable");
		} else {
			res.setHeader("cache-control", "public, max-age=3600");
		}

		if (method === "GET") {
			createReadStream(filePath).pipe(res);
		} else {
			res.end();
		}

		return true;
	} catch {
		return false;
	}
}

const host = process.env.HOST ?? "0.0.0.0";
const port = Number.parseInt(process.env.PORT ?? "3000", 10);

// Run database migrations before starting the server
if (process.env.DATABASE_URL) {
	console.log("Running database migrations...");
	try {
		execSync("npx drizzle-kit migrate", {
			cwd: join(import.meta.dirname, ".."),
			stdio: "inherit",
			env: process.env,
		});
		console.log("Migrations complete.");
	} catch (err) {
		console.error("Migration failed:", err.message);
		process.exit(1);
	}
} else {
	console.log("DATABASE_URL not set, skipping database migrations.");
}

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
		// Try to serve static files from dist/client first
		if (await serveStatic(url.pathname, res)) {
			return;
		}

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
