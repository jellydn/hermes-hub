import { CheckCircle2, LoaderCircle, Rocket } from "lucide-react";
import { useReducer } from "react";
import { AlertPanel } from "#/components/ui/alert-panel";
import { Button } from "#/components/ui/button";
import { HostKeyTrustPanel } from "#/components/ui/host-key-trust-panel";
import {
	type HostKeyErrorPayload,
	parseHostKeyErrorPayload,
} from "#/features/servers/host-key-recovery";
import { useStaleRef } from "#/lib/use-stale-ref";
import { maskHost } from "#/lib/utils";
import type { TelegramSettingsSummary } from "./telegram-settings";

type DeployState = {
	isDeploying: boolean;
	isAcceptingKey: boolean;
	error: string | null;
	successMessage: string | null;
	hostKeyError: HostKeyErrorPayload | null;
};

type DeployAction =
	| { type: "deployStarted" }
	| { type: "deploySucceeded"; serverHost: string }
	| { type: "deployFailed"; error: string }
	| { type: "deployHostKeyDetected"; hostKeyError: HostKeyErrorPayload }
	| { type: "acceptKeyStarted" }
	| { type: "acceptKeyFailed"; error: string }
	| { type: "acceptKeySucceeded" }
	| { type: "hostKeyCleared" };

function deployReducer(state: DeployState, action: DeployAction): DeployState {
	switch (action.type) {
		case "deployStarted":
			return {
				...state,
				isDeploying: true,
				error: null,
				successMessage: null,
				hostKeyError: null,
			};
		case "deploySucceeded":
			return {
				...state,
				isDeploying: false,
				successMessage: action.serverHost,
			};
		case "deployFailed":
			return { ...state, isDeploying: false, error: action.error };
		case "deployHostKeyDetected":
			return {
				...state,
				isDeploying: false,
				hostKeyError: action.hostKeyError,
			};
		case "acceptKeyStarted":
			return { ...state, isAcceptingKey: true, error: null };
		case "acceptKeyFailed":
			return { ...state, isAcceptingKey: false, error: action.error };
		case "acceptKeySucceeded":
			return { ...state, isAcceptingKey: false, hostKeyError: null };
		case "hostKeyCleared":
			return { ...state, hostKeyError: null };
		default:
			return state;
	}
}

const initialDeployState: DeployState = {
	isDeploying: false,
	isAcceptingKey: false,
	error: null,
	successMessage: null,
	hostKeyError: null,
};

type TelegramDeploySectionProps = {
	savedConfig: TelegramSettingsSummary;
	onConfigChange: (config: TelegramSettingsSummary) => void;
};

export function TelegramDeploySection({
	savedConfig,
	onConfigChange,
}: TelegramDeploySectionProps) {
	const [state, dispatch] = useReducer(deployReducer, initialDeployState);
	const stateRef = useStaleRef(state);

	const isDeployed = Boolean(savedConfig.deployedServerHost);
	const deployedHost = savedConfig.deployedServerHost;

	async function handleDeploy() {
		dispatch({ type: "deployStarted" });

		try {
			const response = await fetch("/api/telegram/deploy", {
				method: "POST",
			});

			const payload = (await response.json().catch(() => null)) as {
				error?: string;
				status?: string;
				serverHost?: string;
			} | null;

			if (!response.ok) {
				const hostKeyErrorPayload = parseHostKeyErrorPayload(payload);
				if (hostKeyErrorPayload) {
					dispatch({
						type: "deployHostKeyDetected",
						hostKeyError: hostKeyErrorPayload,
					});
					return;
				}
				dispatch({
					type: "deployFailed",
					error: payload?.error ?? "Deploy failed",
				});
				return;
			}

			const serverHost = payload?.serverHost ?? null;
			onConfigChange({
				...savedConfig,
				deployedServerHost: serverHost,
			});
			dispatch({
				type: "deploySucceeded",
				serverHost: `Bot token deployed to ${
					serverHost ? maskHost(serverHost) : "server"
				}. Hermes is restarting...`,
			});
		} catch {
			dispatch({ type: "deployFailed", error: "Deploy failed" });
		}
	}

	async function handleTrustAndRetryDeploy() {
		const { hostKeyError } = stateRef.current;
		if (!hostKeyError) return;

		dispatch({ type: "acceptKeyStarted" });

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

			const data = (await res.json().catch(() => null)) as {
				error?: string;
			} | null;

			if (!res.ok || data?.error) {
				dispatch({
					type: "acceptKeyFailed",
					error: data?.error ?? "Failed to trust host key",
				});
				return;
			}

			dispatch({ type: "acceptKeySucceeded" });
			void handleDeploy();
		} catch {
			dispatch({
				type: "acceptKeyFailed",
				error: "Network error during host key acceptance",
			});
		}
	}

	return (
		<section className="island-shell rounded-[2rem] p-6 sm:p-8">
			<div className="mb-6 flex flex-col gap-3">
				<p className="island-kicker m-0">Deploy to server</p>
				<h3 className="m-0 text-2xl font-semibold text-[var(--sea-ink)]">
					Push the bot token to Hermes
				</h3>
				<p className="m-0 max-w-2xl text-sm text-[var(--sea-ink-soft)] sm:text-base">
					Deploy the Telegram bot token to your Hermes server so it can send and
					receive messages through Telegram.
				</p>
			</div>

			{isDeployed && deployedHost ? (
				<AlertPanel
					tone="success"
					LeadingIcon={CheckCircle2}
					leadingIconClassName="h-5 w-5 text-[var(--alert-success-fg)]"
				>
					Deployed to <strong>{maskHost(deployedHost)}</strong>
				</AlertPanel>
			) : null}

			{state.successMessage ? (
				<AlertPanel
					tone="success"
					className="mt-3"
					LeadingIcon={CheckCircle2}
					leadingIconClassName="h-5 w-5 text-[var(--alert-success-fg)]"
				>
					{state.successMessage}
				</AlertPanel>
			) : null}

			{state.hostKeyError ? (
				<HostKeyTrustPanel
					hostKeyError={state.hostKeyError}
					isAcceptingKey={state.isAcceptingKey}
					onTrustAndRetry={() => void handleTrustAndRetryDeploy()}
					onDismiss={() => dispatch({ type: "hostKeyCleared" })}
				/>
			) : null}

			{state.error ? (
				<AlertPanel tone="error" className="mt-3">
					{state.error}
				</AlertPanel>
			) : null}

			<div className="mt-6 flex flex-wrap gap-3 border-t border-[var(--line)] pt-6">
				<Button
					type="button"
					onClick={() => void handleDeploy()}
					disabled={state.isDeploying}
				>
					{state.isDeploying ? (
						<LoaderCircle className="h-4 w-4 animate-spin" />
					) : (
						<Rocket className="h-4 w-4" />
					)}
					<span>
						{state.isDeploying
							? "Deploying..."
							: isDeployed
								? "Redeploy"
								: "Deploy to VPS"}
					</span>
				</Button>
			</div>
		</section>
	);
}
