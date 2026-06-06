import { useState } from "react";

import type { ServerDetailSnapshot } from "@/lib/server-detail";

type WebUiState = {
	error: string | null;
	isDeploying: boolean;
	isRevealingPassword: boolean;
	revealedPassword: string | null;
	showPassword: boolean;
	successMessage: string | null;
};

export function useHermesWebUi(
	detail: ServerDetailSnapshot,
	onDetailChange?: (detail: ServerDetailSnapshot) => void,
) {
	const [deployedWebUi, setDeployedWebUi] =
		useState<ServerDetailSnapshot["webUi"]>(null);
	const [state, setState] = useState<WebUiState>({
		error: null,
		isDeploying: false,
		isRevealingPassword: false,
		revealedPassword: null,
		showPassword: false,
		successMessage: null,
	});

	const webUi = deployedWebUi ?? detail.webUi;
	const isEnabled = webUi?.enabled === true;

	async function deploy() {
		const wasEnabled = isEnabled;

		setState((current) => ({
			...current,
			isDeploying: true,
			error: null,
			successMessage: null,
		}));

		try {
			const response = await fetch(
				`/api/servers/${detail.server.id}/web-ui/deploy`,
				{ method: "POST" },
			);
			const payload = (await response.json().catch(() => null)) as {
				error?: string;
				webUi?: ServerDetailSnapshot["webUi"];
			} | null;

			if (!response.ok) {
				setState((current) => ({
					...current,
					isDeploying: false,
					error: payload?.error ?? "Web UI setup failed",
				}));
				return;
			}

			if (payload?.webUi) {
				setDeployedWebUi(payload.webUi);
				onDetailChange?.({
					...detail,
					webUi: payload.webUi,
				});
			}

			setState({
				isDeploying: false,
				isRevealingPassword: false,
				error: null,
				revealedPassword: null,
				showPassword: false,
				successMessage: wasEnabled
					? "Hermes Web UI redeployed. Try opening it again."
					: "Hermes Web UI is ready. Open it from HermesHub.",
			});
		} catch {
			setState((current) => ({
				...current,
				isDeploying: false,
				error: "Web UI setup failed: Connection failed.",
			}));
		}
	}

	async function revealPassword() {
		if (state.revealedPassword) {
			setState((current) => ({
				...current,
				showPassword: !current.showPassword,
			}));
			return;
		}

		setState((current) => ({
			...current,
			isRevealingPassword: true,
			error: null,
		}));

		try {
			const response = await fetch(
				`/api/servers/${detail.server.id}/web-ui/password`,
			);
			const payload = (await response.json().catch(() => null)) as {
				error?: string;
				password?: string;
			} | null;

			if (!response.ok) {
				setState((current) => ({
					...current,
					isRevealingPassword: false,
					error: payload?.error ?? "Unable to reveal Web UI password",
				}));
				return;
			}

			setState((current) => ({
				...current,
				isRevealingPassword: false,
				revealedPassword: payload?.password ?? null,
				showPassword: true,
			}));
		} catch {
			setState((current) => ({
				...current,
				isRevealingPassword: false,
				error: "Unable to reveal Web UI password",
			}));
		}
	}

	return {
		webUi,
		isEnabled,
		...state,
		deploy,
		revealPassword,
	};
}
