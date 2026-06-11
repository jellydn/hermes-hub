import type { ServerWebUiSnapshot } from "#/lib/server-detail";

type WebUiDeployPollHandler = (webUi: ServerWebUiSnapshot) => void;

const POLL_INTERVAL_MS = 5000;

async function fetchWebUiStatus(serverId: string) {
	const response = await fetch(`/api/servers/${serverId}/web-ui`);
	if (!response.ok) {
		return null;
	}

	const payload = (await response.json()) as {
		webUi?: ServerWebUiSnapshot | null;
	};

	return payload.webUi ?? null;
}

export function subscribeWebUiDeployPolling(
	serverId: string,
	onUpdate: WebUiDeployPollHandler,
) {
	let isActive = true;

	async function poll() {
		if (!isActive) {
			return;
		}

		try {
			const webUi = await fetchWebUiStatus(serverId);
			if (!isActive || !webUi) {
				return;
			}

			onUpdate(webUi);
		} catch {
			// Keep polling on transient fetch failures.
		}
	}

	void poll();

	const interval = setInterval(() => {
		void poll();
	}, POLL_INTERVAL_MS);

	return () => {
		isActive = false;
		clearInterval(interval);
	};
}
