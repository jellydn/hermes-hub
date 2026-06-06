import type { ServerDetailSnapshot } from "@/lib/server-detail";

type WebUiDeployPollHandler = (detail: ServerDetailSnapshot) => void;

const POLL_INTERVAL_MS = 5000;

async function fetchServerDetail(serverId: string) {
	const response = await fetch(`/api/servers/${serverId}`);
	if (!response.ok) {
		return null;
	}

	const payload = (await response.json()) as {
		serverDetail?: ServerDetailSnapshot;
	};

	return payload.serverDetail ?? null;
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
			const updated = await fetchServerDetail(serverId);
			if (!isActive || !updated) {
				return;
			}

			onUpdate(updated);
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
