import { useState } from "react";

import type { ServerHealthCheckResult } from "../../../shared/contracts/server-health-check";

type HealthCheckState = {
	error: string | null;
	pending: boolean;
	result: ServerHealthCheckResult | null;
};

export function useServerHealthCheck(serverId: string) {
	const [state, setState] = useState<HealthCheckState>({
		error: null,
		pending: false,
		result: null,
	});

	async function runHealthCheck() {
		setState({
			error: null,
			pending: true,
			result: null,
		});

		try {
			const response = await fetch(`/api/servers/${serverId}/health-check`, {
				method: "POST",
			});
			const payload = (await response.json().catch(() => null)) as {
				error?: string;
				healthCheck?: ServerHealthCheckResult;
			} | null;

			if (!response.ok || !payload?.healthCheck) {
				setState({
					error: payload?.error ?? "Health check failed.",
					pending: false,
					result: null,
				});
				return;
			}

			setState({
				error: null,
				pending: false,
				result: payload.healthCheck,
			});
		} catch {
			setState({
				error: "Health check failed: Connection failed.",
				pending: false,
				result: null,
			});
		}
	}

	return {
		healthCheckState: state,
		runHealthCheck: () => {
			void runHealthCheck();
		},
	};
}
