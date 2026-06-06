import { useEffect, useReducer, useRef } from "react";

import type {
	ServerDetailChangeHandler,
	ServerDetailSnapshot,
} from "@/lib/server-detail";

import { subscribeWebUiDeployPolling } from "./web-ui-deploy-poll";

type WebUiSnapshot = NonNullable<ServerDetailSnapshot["webUi"]>;

type HermesWebUiState = {
	webUiOverride: WebUiSnapshot | null;
	error: string | null;
	isSubmitting: boolean;
	isRevealingPassword: boolean;
	revealedPassword: string | null;
	showPassword: boolean;
	successMessage: string | null;
};

type HermesWebUiAction =
	| { type: "deploy_started" }
	| { type: "deploy_failed"; error: string }
	| {
			type: "deploy_succeeded";
			webUi: WebUiSnapshot | null;
	  }
	| {
			type: "deploy_poll_succeeded";
			webUi: WebUiSnapshot;
			successMessage: string;
	  }
	| { type: "deploy_poll_failed"; webUi: WebUiSnapshot; error: string }
	| { type: "reveal_toggle" }
	| { type: "reveal_started" }
	| { type: "reveal_failed"; error: string }
	| { type: "reveal_succeeded"; password: string | null };

const initialHermesWebUiState: HermesWebUiState = {
	webUiOverride: null,
	error: null,
	isSubmitting: false,
	isRevealingPassword: false,
	revealedPassword: null,
	showPassword: false,
	successMessage: null,
};

function hermesWebUiReducer(
	state: HermesWebUiState,
	action: HermesWebUiAction,
): HermesWebUiState {
	switch (action.type) {
		case "deploy_started":
			return {
				...state,
				isSubmitting: true,
				error: null,
				successMessage: null,
			};
		case "deploy_failed":
			return {
				...state,
				isSubmitting: false,
				error: action.error,
			};
		case "deploy_succeeded":
			return {
				...state,
				webUiOverride: action.webUi,
				isSubmitting: false,
				error: null,
				successMessage: null,
				revealedPassword: null,
				showPassword: false,
			};
		case "deploy_poll_succeeded":
			return {
				...state,
				webUiOverride: action.webUi,
				error: null,
				successMessage: action.successMessage,
			};
		case "deploy_poll_failed":
			return {
				...state,
				webUiOverride: action.webUi,
				successMessage: null,
				error: action.error,
			};
		case "reveal_toggle":
			return {
				...state,
				showPassword: !state.showPassword,
			};
		case "reveal_started":
			return {
				...state,
				isRevealingPassword: true,
				error: null,
			};
		case "reveal_failed":
			return {
				...state,
				isRevealingPassword: false,
				error: action.error,
			};
		case "reveal_succeeded":
			return {
				...state,
				isRevealingPassword: false,
				revealedPassword: action.password,
				showPassword: true,
			};
		default:
			return state;
	}
}

function resolveWebUi(
	detailWebUi: ServerDetailSnapshot["webUi"],
	override: WebUiSnapshot | null,
) {
	if (!detailWebUi) {
		return override;
	}

	if (!override) {
		return detailWebUi;
	}

	return override.updatedAt >= detailWebUi.updatedAt ? override : detailWebUi;
}

export function useHermesWebUi(
	detail: ServerDetailSnapshot,
	onDetailChange?: ServerDetailChangeHandler,
) {
	const [state, dispatch] = useReducer(
		hermesWebUiReducer,
		initialHermesWebUiState,
	);
	const wasEnabledAtDeployStart = useRef(false);
	const onDetailChangeRef = useRef(onDetailChange);
	onDetailChangeRef.current = onDetailChange;

	const webUi = resolveWebUi(detail.webUi, state.webUiOverride);
	const isEnabled = webUi?.enabled === true;
	const isDeploying = webUi?.deployStatus === "deploying";

	useEffect(() => {
		if (!isDeploying) {
			return;
		}

		return subscribeWebUiDeployPolling(detail.server.id, (updated) => {
			if (!updated.webUi || updated.webUi.deployStatus === "deploying") {
				return;
			}

			onDetailChangeRef.current?.(updated);

			if (updated.webUi.deployStatus === "succeeded") {
				dispatch({
					type: "deploy_poll_succeeded",
					webUi: updated.webUi,
					successMessage: wasEnabledAtDeployStart.current
						? "Hermes Web UI redeployed. Try opening it again."
						: "Hermes Web UI is ready. Open it from HermesHub.",
				});
				return;
			}

			if (updated.webUi.deployStatus === "failed") {
				dispatch({
					type: "deploy_poll_failed",
					webUi: updated.webUi,
					error: updated.webUi.deployError ?? "Web UI setup failed.",
				});
			}
		});
	}, [detail.server.id, isDeploying]);

	async function deploy() {
		wasEnabledAtDeployStart.current = isEnabled;
		dispatch({ type: "deploy_started" });

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
				dispatch({
					type: "deploy_failed",
					error: payload?.error ?? "Web UI setup failed",
				});
				return;
			}

			if (payload?.webUi) {
				onDetailChangeRef.current?.((current) => ({
					...current,
					webUi: payload.webUi ?? null,
				}));
			}

			dispatch({
				type: "deploy_succeeded",
				webUi: payload?.webUi ?? null,
			});
		} catch {
			dispatch({
				type: "deploy_failed",
				error: "Web UI setup failed: Connection failed.",
			});
		}
	}

	async function revealPassword() {
		if (state.revealedPassword) {
			dispatch({ type: "reveal_toggle" });
			return;
		}

		dispatch({ type: "reveal_started" });

		try {
			const response = await fetch(
				`/api/servers/${detail.server.id}/web-ui/password`,
			);
			const payload = (await response.json().catch(() => null)) as {
				error?: string;
				password?: string;
			} | null;

			if (!response.ok) {
				dispatch({
					type: "reveal_failed",
					error: payload?.error ?? "Unable to reveal Web UI password",
				});
				return;
			}

			dispatch({
				type: "reveal_succeeded",
				password: payload?.password ?? null,
			});
		} catch {
			dispatch({
				type: "reveal_failed",
				error: "Unable to reveal Web UI password",
			});
		}
	}

	return {
		webUi,
		isEnabled,
		isDeploying,
		error: state.error,
		isSubmitting: state.isSubmitting,
		isRevealingPassword: state.isRevealingPassword,
		revealedPassword: state.revealedPassword,
		showPassword: state.showPassword,
		successMessage: state.successMessage,
		deploy,
		revealPassword,
	};
}
