import { useCallback, useReducer, useRef } from "react";

import {
	type HostKeyErrorPayload,
	parseHostKeyErrorPayload,
} from "#/features/servers/host-key-recovery";
import { useMountEffect } from "#/lib/use-mount-effect";
import type { HostKeyErrorCode } from "#shared/contracts/host-key-error";
import type { ModelAccessOptionsResponse } from "#shared/contracts/telegram-model-access";

export type FormState = {
	optionsState: ModelAccessOptionsResponse | null;
	selectedOptionId: string;
	selectedModel: string;
	isLoading: boolean;
	isSwitching: boolean;
	isAcceptingKey: boolean;
	message: { type: "error" | "success"; text: string } | null;
	hostKeyError: HostKeyErrorPayload | null;
};

export type FormAction =
	| { type: "fetchStarted" }
	| { type: "fetchSucceeded"; data: ModelAccessOptionsResponse }
	| { type: "fetchFailed"; error: string }
	| { type: "optionSelected"; optionId: string; model: string }
	| { type: "modelChanged"; model: string }
	| { type: "switchStarted" }
	| { type: "switchSucceeded" }
	| { type: "switchFailed"; error: string }
	| { type: "hostKeyDetected"; hostKeyError: HostKeyErrorPayload }
	| { type: "hostKeyCleared" }
	| { type: "hostKeyTrustStarting" }
	| { type: "hostKeyTrustFailed"; error: string }
	| { type: "messageCleared" };

export function formReducer(state: FormState, action: FormAction): FormState {
	switch (action.type) {
		case "fetchStarted":
			return { ...state, isLoading: true, message: null };
		case "fetchSucceeded": {
			const { data } = action;
			return {
				...state,
				isLoading: false,
				optionsState: data,
				selectedOptionId: state.selectedOptionId || data.activeOptionId || "",
				selectedModel:
					state.selectedModel ||
					data.options?.find((o) => o.optionId === data.activeOptionId)
						?.model ||
					"",
			};
		}
		case "fetchFailed":
			return {
				...state,
				isLoading: false,
				message: { type: "error", text: action.error },
			};
		case "optionSelected":
			return {
				...state,
				selectedOptionId: action.optionId,
				selectedModel: action.model,
				message: null,
			};
		case "modelChanged":
			return { ...state, selectedModel: action.model, message: null };
		case "switchStarted":
			return { ...state, isSwitching: true, message: null };
		case "switchSucceeded":
			return {
				...state,
				isSwitching: false,
				message: {
					type: "success",
					text: "Model access switched successfully.",
				},
			};
		case "switchFailed":
			return {
				...state,
				isSwitching: false,
				message: { type: "error", text: action.error },
			};
		case "hostKeyDetected":
			return {
				...state,
				isSwitching: false,
				hostKeyError: action.hostKeyError,
			};
		case "hostKeyCleared":
			return { ...state, hostKeyError: null, isAcceptingKey: false };
		case "hostKeyTrustStarting":
			return { ...state, isAcceptingKey: true, message: null };
		case "hostKeyTrustFailed":
			return {
				...state,
				isAcceptingKey: false,
				message: { type: "error", text: action.error },
			};
		case "messageCleared":
			return { ...state, message: null };
		default:
			return state;
	}
}

const initialState: FormState = {
	optionsState: null,
	selectedOptionId: "",
	selectedModel: "",
	isLoading: false,
	isSwitching: false,
	isAcceptingKey: false,
	message: null,
	hostKeyError: null,
};

export type UseModelAccessControllerParams = {
	isDeployed: boolean;
	/**
	 * Called after a successful switch so the parent can refetch any server-side
	 * state that should reflect the new active backend (e.g. the route loader's
	 * model access snapshot that drives the sidebar).
	 */
	onSwitched?: () => void;
};

export function useModelAccessController({
	isDeployed,
	onSwitched,
}: UseModelAccessControllerParams) {
	const [state, dispatch] = useReducer(formReducer, initialState);
	const stateRef = useRef(state);
	stateRef.current = state;

	const fetchOptions = useCallback(async () => {
		dispatch({ type: "fetchStarted" });
		try {
			const res = await fetch("/api/telegram/model-access-options");
			const data = (await res.json()) as ModelAccessOptionsResponse & {
				error?: string;
			};
			if (!res.ok) {
				dispatch({
					type: "fetchFailed",
					error: data.error ?? "Failed to load options",
				});
				return;
			}
			dispatch({ type: "fetchSucceeded", data });
		} catch {
			dispatch({ type: "fetchFailed", error: "Network error loading options" });
		}
	}, []);

	useMountEffect(() => {
		if (!isDeployed) {
			return;
		}
		void fetchOptions();
	});

	const handleSwitch = useCallback(async () => {
		const { selectedOptionId, selectedModel } = stateRef.current;
		if (!selectedOptionId || !selectedModel) {
			return;
		}

		dispatch({ type: "switchStarted" });

		try {
			const res = await fetch("/api/telegram/model-switch", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					optionId: selectedOptionId,
					model: selectedModel,
				}),
			});
			const data = (await res.json()) as {
				error?: string;
				status?: string;
				code?: HostKeyErrorCode;
				serverId?: string;
				serverHost?: string;
				hostKey?: {
					observedFingerprint: string;
					observedAlgorithm: string;
					expectedFingerprint?: string;
				};
			};

			if (!res.ok) {
				const hostKeyErrorPayload = parseHostKeyErrorPayload(data);
				if (hostKeyErrorPayload) {
					dispatch({
						type: "hostKeyDetected",
						hostKeyError: hostKeyErrorPayload,
					});
					return;
				}

				dispatch({
					type: "switchFailed",
					error: data.error ?? "Switch failed",
				});
				return;
			}
			dispatch({ type: "switchSucceeded" });
			void fetchOptions();
			onSwitched?.();
		} catch {
			dispatch({ type: "switchFailed", error: "Network error during switch" });
		}
	}, [fetchOptions, onSwitched]);

	const handleTrustAndRetrySwitch = useCallback(async () => {
		const { hostKeyError } = stateRef.current;
		if (!hostKeyError) {
			return;
		}

		dispatch({ type: "hostKeyTrustStarting" });

		try {
			const res = await fetch(
				`/api/servers/${encodeURIComponent(hostKeyError.serverId)}/host-key/accept`,
				{
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						fingerprint: hostKeyError.observedFingerprint,
						algorithm: hostKeyError.observedAlgorithm,
					}),
				},
			);

			if (!res.ok) {
				const data = (await res.json().catch(() => null)) as {
					error?: string;
				} | null;
				dispatch({
					type: "hostKeyTrustFailed",
					error: data?.error ?? "Failed to accept host key",
				});
				return;
			}

			// Dismiss the host-key panel and retry switch
			dispatch({ type: "hostKeyCleared" });
			void handleSwitch();
		} catch {
			dispatch({
				type: "hostKeyTrustFailed",
				error: "Network error during host key acceptance",
			});
		}
	}, [handleSwitch]);

	return {
		state,
		dispatch,
		fetchOptions,
		handleSwitch,
		handleTrustAndRetrySwitch,
	};
}
