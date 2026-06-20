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
	return segment.replace(/;\s*path\s*=\s*([^;\s]+)/i, (_, pathVal) => {
		const nextPath =
			pathVal === "/" ? proxyBasePath : joinProxyPath(proxyBasePath, pathVal);
		return `; Path=${nextPath}`;
	});
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
	return upstreamPath === "" || upstreamPath === "/"
		? proxyBasePath
		: joinProxyPath(proxyBasePath, upstreamPath);
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
