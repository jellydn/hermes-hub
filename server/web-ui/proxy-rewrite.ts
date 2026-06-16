import { HOP_BY_HOP_RESPONSE_HEADERS } from "./proxy-types";

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
			// Deferred: use getSetCookie() below for robust multi-cookie handling
			continue;
		}

		rewritten.set(name, value);
	}

	if (typeof headers.getSetCookie === "function") {
		for (const cookie of headers.getSetCookie()) {
			rewritten.append(
				"Set-Cookie",
				rewriteCookieSegment(cookie.trim(), proxyBasePath),
			);
		}
	}

	return rewritten;
}
