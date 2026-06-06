const REMOTE_PORT_UNREACHABLE_MARKERS = [
	"Connection refused",
	"Channel open failure",
] as const;

const WEB_UI_UNREACHABLE_PROXY_MESSAGE =
	"Hermes Web UI is not reachable on the server (127.0.0.1:{port}). The container may have stopped or was removed during a later deploy. Open the server page and run Redeploy Web UI.";

export function isRemotePortUnreachable(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);
	return REMOTE_PORT_UNREACHABLE_MARKERS.some((marker) =>
		message.includes(marker),
	);
}

export function formatWebUiProxyError(error: unknown, port: number) {
	if (isRemotePortUnreachable(error)) {
		return WEB_UI_UNREACHABLE_PROXY_MESSAGE.replace("{port}", String(port));
	}

	return error instanceof Error ? error.message : String(error);
}
