import { ExternalLink, KeyRound, LoaderCircle } from "lucide-react";
import { useReducer, useRef } from "react";

import { Button } from "@/components/ui/button";
import { useMountEffect } from "@/lib/use-mount-effect";

import {
	type CodexAuthStatus,
	codexAuthPanelReducer,
	createInitialCodexAuthPanelState,
} from "./codex-auth-panel-state";

type CodexAuthPanelProps = {
	telegramDeployed: boolean;
	onAuthStatusChange?: (authenticated: boolean) => void;
};

export function CodexAuthPanel({
	telegramDeployed,
	onAuthStatusChange,
}: CodexAuthPanelProps) {
	const [state, dispatch] = useReducer(
		codexAuthPanelReducer,
		undefined,
		createInitialCodexAuthPanelState,
	);
	const pollIntervalSecondsRef = useRef(5);

	async function refreshStatus() {
		if (!telegramDeployed) {
			dispatch({ type: "status_reset" });
			onAuthStatusChange?.(false);
			return;
		}

		dispatch({ type: "status_load_started" });

		try {
			const response = await fetch("/api/providers/codex-auth/status");
			const payload = (await response.json().catch(() => null)) as {
				error?: string;
				codexAuth?: CodexAuthStatus;
			} | null;

			if (!response.ok || !payload?.codexAuth) {
				dispatch({
					type: "status_load_failed",
					error: payload?.error ?? "Unable to check Codex auth status.",
				});
				onAuthStatusChange?.(false);
				return;
			}

			dispatch({
				type: "status_load_succeeded",
				status: payload.codexAuth,
			});
			onAuthStatusChange?.(payload.codexAuth.authenticated);
		} catch {
			dispatch({
				type: "status_load_failed",
				error: "Network error while checking Codex auth status. Try again.",
			});
			onAuthStatusChange?.(false);
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
			const payload = (await response.json().catch(() => null)) as {
				error?: string;
				codexAuth?: {
					userCode: string;
					verificationUrl: string;
					pollIntervalSeconds: number;
				};
			} | null;

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
		}

		try {
			if (attempt >= 180) {
				dispatch({
					type: "complete_auth_failed",
					error: "Codex authentication timed out. Start again.",
				});
				return;
			}

			const response = await fetch("/api/providers/codex-auth/complete", {
				method: "POST",
			});
			const payload = (await response.json().catch(() => null)) as {
				error?: string;
				status?: string;
			} | null;

			if (response.ok && payload?.status === "authenticated") {
				dispatch({ type: "complete_auth_succeeded" });
				await refreshStatus();
				return;
			}

			if (response.ok && payload?.status === "pending") {
				await new Promise((resolve) =>
					setTimeout(resolve, pollIntervalSecondsRef.current * 1000),
				);
				await pollUntilAuthenticated(attempt + 1);
				return;
			}

			dispatch({
				type: "complete_auth_failed",
				error: payload?.error ?? "Codex authentication failed.",
			});
		} catch {
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

			{state.status?.authenticated ? (
				<p className="mt-3 mb-0 text-sm text-emerald-600">
					Codex is authenticated on{" "}
					{state.status.serverHost ?? "your deployed server"}.
				</p>
			) : (
				<p className="mt-3 mb-0 text-sm text-[var(--sea-ink-soft)]">
					{state.isLoadingStatus
						? "Checking remote Codex auth status..."
						: "Codex is not authenticated on the deployed Hermes server yet."}
				</p>
			)}

			{state.statusError ? (
				<p className="mt-3 mb-0 text-sm text-red-600">{state.statusError}</p>
			) : null}

			<div className="mt-4 flex flex-wrap gap-3">
				<Button
					type="button"
					onClick={() => void handleStartAuth()}
					disabled={state.isStarting || state.isCompleting}
				>
					{state.isStarting ? (
						<LoaderCircle className="h-4 w-4 animate-spin" />
					) : (
						<KeyRound className="h-4 w-4" />
					)}
					<span>
						{state.isStarting ? "Starting..." : "Start ChatGPT Login"}
					</span>
				</Button>
				<Button
					type="button"
					variant="secondary"
					onClick={() => void refreshStatus()}
					disabled={state.isLoadingStatus}
				>
					{state.isLoadingStatus ? (
						<LoaderCircle className="h-4 w-4 animate-spin" />
					) : null}
					<span>Refresh Status</span>
				</Button>
			</div>

			{state.startError ? (
				<p className="mt-3 mb-0 text-sm text-red-600">{state.startError}</p>
			) : null}

			{state.userCode && state.verificationUrl ? (
				<div className="mt-4 space-y-3 rounded-[1.25rem] border border-[var(--chip-line)] bg-white/70 px-4 py-4 text-sm text-[var(--sea-ink)]">
					<p className="m-0">
						1. Open{" "}
						<a
							href={state.verificationUrl}
							target="_blank"
							rel="noreferrer"
							className="inline-flex items-center gap-1 font-medium text-[var(--lagoon-deep)]"
						>
							{state.verificationUrl}
							<ExternalLink className="h-4 w-4" />
						</a>
					</p>
					<p className="m-0">
						2. Enter this one-time code:{" "}
						<span className="font-semibold tracking-[0.2em]">
							{state.userCode}
						</span>
					</p>
					<Button
						type="button"
						onClick={() => void pollUntilAuthenticated()}
						disabled={state.isCompleting}
					>
						{state.isCompleting ? (
							<LoaderCircle className="h-4 w-4 animate-spin" />
						) : null}
						<span>
							{state.isCompleting
								? "Waiting for approval..."
								: "I entered the code"}
						</span>
					</Button>
				</div>
			) : null}

			{state.completeError ? (
				<p className="mt-3 mb-0 text-sm text-red-600">{state.completeError}</p>
			) : null}
		</div>
	);
}
