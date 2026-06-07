import { useReducer, useRef } from "react";

import { useMountEffect } from "@/lib/use-mount-effect";
import {
	CODEX_MAX_POLL_ATTEMPTS,
	type CodexAuthCompleteResponse,
	type CodexAuthStartResponse,
	type CodexAuthStatus,
	type CodexAuthStatusResponse,
} from "../../../shared/contracts/codex-auth";

import {
	codexAuthPanelReducer,
	createInitialCodexAuthPanelState,
} from "./codex-auth-panel-state";
import {
	CodexAuthDeviceCodeSection,
	CodexAuthStatusSection,
} from "./codex-auth-panel-ui";

export type CodexAuthStatusChange = {
	status: CodexAuthStatus | null;
	isLoading: boolean;
	error: string | null;
};

type CodexAuthPanelProps = {
	telegramDeployed: boolean;
	onCodexAuthStatusChange?: (change: CodexAuthStatusChange) => void;
};

export function CodexAuthPanel({
	telegramDeployed,
	onCodexAuthStatusChange,
}: CodexAuthPanelProps) {
	const [state, dispatch] = useReducer(
		codexAuthPanelReducer,
		undefined,
		createInitialCodexAuthPanelState,
	);
	const pollIntervalSecondsRef = useRef(5);
	const abortControllerRef = useRef<AbortController | null>(null);

	function publishCodexAuthStatus(change: CodexAuthStatusChange) {
		onCodexAuthStatusChange?.(change);
	}

	useMountEffect(() => {
		return () => {
			abortControllerRef.current?.abort();
		};
	});

	async function refreshStatus() {
		if (!telegramDeployed) {
			dispatch({ type: "status_reset" });
			publishCodexAuthStatus({
				status: null,
				isLoading: false,
				error: null,
			});
			return;
		}

		dispatch({ type: "status_load_started" });
		publishCodexAuthStatus({
			status: state.status,
			isLoading: true,
			error: null,
		});

		try {
			const response = await fetch("/api/providers/codex-auth/status");
			const payload = (await response
				.json()
				.catch(() => null)) as CodexAuthStatusResponse | null;

			if (!response.ok || !payload?.codexAuth) {
				const error = payload?.error ?? "Unable to check Codex auth status.";
				dispatch({ type: "status_load_failed", error });
				publishCodexAuthStatus({
					status: null,
					isLoading: false,
					error,
				});
				return;
			}

			dispatch({
				type: "status_load_succeeded",
				status: payload.codexAuth,
			});
			publishCodexAuthStatus({
				status: payload.codexAuth,
				isLoading: false,
				error: null,
			});
		} catch {
			const error =
				"Network error while checking Codex auth status. Try again.";
			dispatch({ type: "status_load_failed", error });
			publishCodexAuthStatus({
				status: null,
				isLoading: false,
				error,
			});
		} finally {
			dispatch({ type: "status_load_finished" });
		}
	}

	useMountEffect(() => {
		void refreshStatus();
	});

	async function handleStartAuth() {
		dispatch({ type: "start_auth_started" });

		try {
			const response = await fetch("/api/providers/codex-auth/start", {
				method: "POST",
			});
			const payload = (await response
				.json()
				.catch(() => null)) as CodexAuthStartResponse | null;

			if (!response.ok || !payload?.codexAuth) {
				dispatch({
					type: "start_auth_failed",
					error: payload?.error ?? "Unable to start Codex authentication.",
				});
				return;
			}

			pollIntervalSecondsRef.current = payload.codexAuth.pollIntervalSeconds;
			dispatch({
				type: "start_auth_succeeded",
				userCode: payload.codexAuth.userCode,
				verificationUrl: payload.codexAuth.verificationUrl,
			});
		} catch {
			dispatch({
				type: "start_auth_failed",
				error: "Network error while starting Codex authentication. Try again.",
			});
		} finally {
			dispatch({ type: "start_auth_finished" });
		}
	}

	async function pollUntilAuthenticated(attempt = 0): Promise<void> {
		if (attempt === 0) {
			dispatch({ type: "complete_auth_started" });
			abortControllerRef.current = new AbortController();
		}

		const signal = abortControllerRef.current?.signal;

		try {
			if (attempt >= CODEX_MAX_POLL_ATTEMPTS) {
				dispatch({
					type: "complete_auth_failed",
					error: "Codex authentication timed out. Start again.",
				});
				return;
			}

			const response = await fetch("/api/providers/codex-auth/complete", {
				method: "POST",
				signal,
			});
			const payload = (await response
				.json()
				.catch(() => null)) as CodexAuthCompleteResponse | null;

			if (response.ok && payload?.status === "authenticated") {
				dispatch({ type: "complete_auth_succeeded" });
				await refreshStatus();
				return;
			}

			if (response.ok && payload?.status === "pending") {
				await new Promise<void>((resolve, reject) => {
					const timeout = setTimeout(
						resolve,
						pollIntervalSecondsRef.current * 1000,
					);
					signal?.addEventListener("abort", () => {
						clearTimeout(timeout);
						reject(new DOMException("Aborted", "AbortError"));
					});
				});
				await pollUntilAuthenticated(attempt + 1);
				return;
			}

			dispatch({
				type: "complete_auth_failed",
				error: payload?.error ?? "Codex authentication failed.",
			});
		} catch (error) {
			if (error instanceof Error && error.name === "AbortError") {
				return;
			}

			dispatch({
				type: "complete_auth_failed",
				error:
					"Network error while completing Codex authentication. Try again.",
			});
		} finally {
			if (attempt === 0) {
				dispatch({ type: "complete_auth_finished" });
			}
		}
	}

	if (!telegramDeployed) {
		return (
			<div className="mt-6 rounded-[1.5rem] border border-[var(--line)] bg-[var(--surface)] px-4 py-4 text-sm text-[var(--sea-ink-soft)]">
				Deploy a Telegram bot to a VPS first. Codex OAuth runs on that deployed
				Hermes server.
			</div>
		);
	}

	return (
		<div className="mt-6 rounded-[1.5rem] border border-[var(--line)] bg-[var(--surface)] px-4 py-4">
			<p className="m-0 text-sm font-medium text-[var(--sea-ink)]">
				ChatGPT device-code login
			</p>
			<p className="mt-2 mb-0 text-sm text-[var(--sea-ink-soft)]">
				HermesHub never stores Codex OAuth tokens in its database. Sign in on
				OpenAI, then HermesHub writes auth state to the remote Hermes volume.
			</p>

			<CodexAuthStatusSection
				status={state.status}
				isLoadingStatus={state.isLoadingStatus}
				statusError={state.statusError}
				isStarting={state.isStarting}
				isCompleting={state.isCompleting}
				onStartAuth={() => void handleStartAuth()}
				onRefreshStatus={() => void refreshStatus()}
			/>

			{state.startError ? (
				<p className="mt-3 mb-0 text-sm text-red-600">{state.startError}</p>
			) : null}

			<CodexAuthDeviceCodeSection
				state={state}
				onPollUntilAuthenticated={() => void pollUntilAuthenticated()}
			/>

			{state.completeError ? (
				<p className="mt-3 mb-0 text-sm text-red-600">{state.completeError}</p>
			) : null}
		</div>
	);
}
