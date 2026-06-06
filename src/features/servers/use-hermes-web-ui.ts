import { useEffect, useRef, useState } from "react";

import type {
	ServerDetailChangeHandler,
	ServerDetailSnapshot,
} from "@/lib/server-detail";

type WebUiState = {
	error: string | null;
	isSubmitting: boolean;
	isRevealingPassword: boolean;
	revealedPassword: string | null;
	showPassword: boolean;
	successMessage: string | null;
};

export function useHermesWebUi(
	detail: ServerDetailSnapshot,
	onDetailChange?: ServerDetailChangeHandler,
) {
	const [deployedWebUi, setDeployedWebUi] =
		useState<ServerDetailSnapshot["webUi"]>(null);
	const [state, setState] = useState<WebUiState>({
		error: null,
		isSubmitting: false,
		isRevealingPassword: false,
		revealedPassword: null,
		showPassword: false,
		successMessage: null,
	});
	const wasEnabledAtDeployStart = useRef(false);

	useEffect(() => {
		setDeployedWebUi((current) => {
			if (!detail.webUi) {
				return null;
			}
			if (!current) {
				return null;
			}

			const matchesIncoming =
				current.updatedAt === detail.webUi.updatedAt &&
				current.deployStatus === detail.webUi.deployStatus &&
				current.enabled === detail.webUi.enabled &&
				current.deployError === detail.webUi.deployError;

			return matchesIncoming ? current : null;
		});
	}, [detail.webUi]);

	const webUi = deployedWebUi ?? detail.webUi;
	const isEnabled = webUi?.enabled === true;
	const isDeploying = webUi?.deployStatus === "deploying";

	useEffect(() => {
		if (webUi?.deployStatus !== "deploying") {
			return;
		}

		let aborted = false;
		let timeoutId: ReturnType<typeof setTimeout> | undefined;

		async function poll() {
			try {
				const response = await fetch(`/api/servers/${detail.server.id}`);
				if (aborted) {
					return;
				}
				if (!response.ok) {
					timeoutId = setTimeout(poll, 5000);
					return;
				}

				const payload = (await response.json()) as {
					serverDetail?: ServerDetailSnapshot;
				};
				if (aborted) {
					return;
				}

				const updated = payload.serverDetail;
				if (!updated?.webUi || updated.webUi.deployStatus === "deploying") {
					timeoutId = setTimeout(poll, 5000);
					return;
				}

				setDeployedWebUi(updated.webUi);
				onDetailChange?.(updated);

				if (updated.webUi.deployStatus === "succeeded") {
					setState((current) => ({
						...current,
						error: null,
						successMessage: wasEnabledAtDeployStart.current
							? "Hermes Web UI redeployed. Try opening it again."
							: "Hermes Web UI is ready. Open it from HermesHub.",
					}));
					return;
				}

				if (updated.webUi.deployStatus === "failed") {
					setState((current) => ({
						...current,
						successMessage: null,
						error: updated.webUi?.deployError ?? "Web UI setup failed.",
					}));
				}
			} catch {
				// Keep polling on transient fetch failures.
				if (!aborted) {
					timeoutId = setTimeout(poll, 5000);
				}
			}
		}

		timeoutId = setTimeout(poll, 5000);

		return () => {
			aborted = true;
			clearTimeout(timeoutId);
		};
	}, [webUi?.deployStatus, detail.server.id, onDetailChange]);

	async function deploy() {


		setState((current) => ({
			...current,
			isSubmitting: true,
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
					isSubmitting: false,
					error: payload?.error ?? "Web UI setup failed",
				}));
				return;
			}

			if (payload?.webUi) {
				setDeployedWebUi(payload.webUi);
				onDetailChange?.((current) => ({
					...current,
					webUi: payload.webUi ?? null,
				}));
			}

			setState((current) => ({
				...current,
				isSubmitting: false,
				error: null,
				successMessage: null,
				revealedPassword: null,
				showPassword: false,
			}));
		} catch {
			setState((current) => ({
				...current,
				isSubmitting: false,
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
		isDeploying,
		...state,
		deploy,
		revealPassword,
	};
}
