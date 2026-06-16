// Barrel re-exports from split proxy modules.
// See individual files for implementation details.

export { requireEnabledWebUi } from "./proxy-auth";
export {
	buildUpstreamProxyHeaders,
	getPublicRequestEndpoint,
	proxyHttpOverStream,
} from "./proxy-http";

export {
	getUpstreamPath,
	resolveProxyRequestTarget,
	rewriteLocationHeader,
	rewriteProxyResponseHeaders,
	rewriteSetCookieHeader,
} from "./proxy-rewrite";
export {
	proxyRequestOverSsh,
	withSshTcpForward,
} from "./proxy-ssh";
export {
	type EnabledWebUiContext,
	HOP_BY_HOP_REQUEST_HEADERS,
	HOP_BY_HOP_RESPONSE_HEADERS,
	type TcpForwardStream,
	WebUiProxyError,
} from "./proxy-types";
