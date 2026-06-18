import { CheckCircle2, CloudUpload, LoaderCircle } from "lucide-react";
import { useReducer } from "react";

import { Button } from "#/components/ui/button";
import { FormFeedback } from "#/components/ui/form-feedback";
import { HostKeyTrustPanel } from "#/components/ui/host-key-trust-panel";
import {
	acceptHostKey,
	deployModelAccess,
	type HostKeyErrorPayload,
} from "#/features/providers/provider-access-actions";

import type { TelegramSettingsSummary } from "./telegram-settings";

type TelegramSidebarProps = {
	savedConfig: TelegramSettingsSummary | null;
};

type DeployState = {
	busy: "idle" | "deploying" | "accepting-key";
	error: string | null;
	result: string | null;
	hostKeyError: HostKeyErrorPayload | null;
};

type DeployAction =
	| { type: "DEPLOY" }
	| { type: "DEPLOY_DONE"; message: string }
	| { type: "DEPLOY_FAIL"; error: string }
	| { type: "HOST_KEY_ERROR"; payload: HostKeyErrorPayload }
	| { type: "ACCEPT_KEY" }
	| { type: "ACCEPT_KEY_DONE" }
	| { type: "ACCEPT_KEY_FAIL"; error: string }
	| { type: "DISMISS_HOST_KEY" };

function deployReducer(state: DeployState, action: DeployAction): DeployState {
	switch (action.type) {
		case "DEPLOY":
			return {
				busy: "deploying",
				error: null,
				result: null,
				hostKeyError: null,
			};
		case "DEPLOY_DONE":
			return { ...state, busy: "idle", result: action.message };
		case "DEPLOY_FAIL":
			return { ...state, busy: "idle", error: action.error };
		case "HOST_KEY_ERROR":
			return { ...state, busy: "idle", hostKeyError: action.payload };
		case "ACCEPT_KEY":
			return { ...state, busy: "accepting-key" };
		case "ACCEPT_KEY_DONE":
			return { ...state, busy: "idle" };
		case "ACCEPT_KEY_FAIL":
			return {
				...state,
				busy: "idle",
				error: action.error,
				hostKeyError: null,
			};
		case "DISMISS_HOST_KEY":
			return { ...state, hostKeyError: null };
	}
}

export function TelegramSidebar({ savedConfig }: TelegramSidebarProps) {
	const isDeployed = Boolean(savedConfig?.deployedServerHost);
	const deployedHost = savedConfig?.deployedServerHost ?? null;

	const [state, dispatch] = useReducer(deployReducer, {
		busy: "idle",
		error: null,
		result: null,
		hostKeyError: null,
	});

	async function handleDeploy() {
		dispatch({ type: "DEPLOY" });

		try {
			const result = await deployModelAccess();

			if (!result.ok) {
				if (result.hostKeyError) {
					dispatch({ type: "HOST_KEY_ERROR", payload: result.hostKeyError });
				} else {
					dispatch({ type: "DEPLOY_FAIL", error: result.error });
				}
				return;
			}

			dispatch({ type: "DEPLOY_DONE", message: result.message });
		} catch {
			dispatch({
				type: "DEPLOY_FAIL",
				error: "Network error. Please check your connection and try again.",
			});
		}
	}

	async function handleTrustAndRetry() {
		if (!state.hostKeyError) {
			return;
		}

		dispatch({ type: "ACCEPT_KEY" });

		try {
			const result = await acceptHostKey(
				state.hostKeyError.serverId,
				state.hostKeyError.observedFingerprint,
				state.hostKeyError.observedAlgorithm,
			);

			if (!result.ok) {
				dispatch({ type: "ACCEPT_KEY_FAIL", error: result.error });
				return;
			}

			dispatch({ type: "ACCEPT_KEY_DONE" });
			void handleDeploy();
		} catch {
			dispatch({
				type: "ACCEPT_KEY_FAIL",
				error: "Network error during host key acceptance",
			});
		}
	}

	return (
		<aside className="space-y-4">
			<section className="island-shell rounded-[2rem] p-6">
				<p className="island-kicker mb-2">Connected bot</p>
				<h3 className="m-0 text-xl font-semibold text-[var(--sea-ink)]">
					{savedConfig?.botUsername ?? "No Telegram bot connected"}
				</h3>
				<p className="mt-3 mb-0 text-sm text-[var(--sea-ink-soft)]">
					{savedConfig
						? `Status: ${savedConfig.isActive ? "Connected" : "Disconnected"}`
						: "Connect your Telegram bot to let Hermes reply in chat."}
				</p>
				{savedConfig?.botTokenLast4 ? (
					<p className="mt-3 mb-0 text-sm text-[var(--sea-ink)]">
						Stored token ending in {savedConfig.botTokenLast4}
					</p>
				) : null}
				{isDeployed && deployedHost ? (
					<p className="mt-3 mb-0 text-sm text-[var(--sea-ink)]">
						<CheckCircle2 className="mr-1 inline h-3.5 w-3.5 text-[var(--alert-success-fg)]" />
						Deployed to {deployedHost}
					</p>
				) : null}
			</section>

			{isDeployed ? (
				<section className="island-shell rounded-[2rem] p-6">
					<p className="island-kicker mb-2">Model Access Deployment</p>
					<p className="mt-3 mb-0 text-sm text-[var(--sea-ink)]">
						Push your active model access config to the Hermes server.
					</p>
					<div className="mt-4">
						<Button
							type="button"
							onClick={() => void handleDeploy()}
							disabled={state.busy !== "idle"}
						>
							{state.busy === "deploying" ? (
								<LoaderCircle className="h-4 w-4 animate-spin" />
							) : (
								<CloudUpload className="h-4 w-4" />
							)}
							<span>
								{state.busy === "deploying"
									? "Deploying..."
									: "Deploy to Hermes Server"}
							</span>
						</Button>
					</div>

					{state.hostKeyError ? (
						<div className="mt-3">
							<HostKeyTrustPanel
								hostKeyError={state.hostKeyError}
								isAcceptingKey={state.busy === "accepting-key"}
								onTrustAndRetry={() => void handleTrustAndRetry()}
								onDismiss={() => dispatch({ type: "DISMISS_HOST_KEY" })}
							/>
						</div>
					) : null}

					{state.error ? (
						<FormFeedback className="mt-3 mb-0 text-sm" tone="error">
							{state.error}
						</FormFeedback>
					) : null}
					{state.result ? (
						<FormFeedback className="mt-3 mb-0 text-sm" tone="success">
							{state.result}
						</FormFeedback>
					) : null}
				</section>
			) : (
				<section className="island-shell rounded-[2rem] p-6">
					<p className="island-kicker mb-2">Model Access Deployment</p>
					<p className="mt-3 mb-0 text-sm text-[var(--sea-ink-soft)]">
						Deploy your Telegram bot to a VPS first to enable model access
						deployment.
					</p>
				</section>
			)}

			<section className="island-shell rounded-[2rem] p-6">
				<p className="island-kicker mb-2">Why this matters</p>
				<ul className="m-0 space-y-3 pl-5 text-sm text-[var(--sea-ink-soft)]">
					<li>Hermes uses your bot token to verify the bot is real.</li>
					<li>
						Deploy the token to your VPS so Hermes can send and receive messages
						through Telegram.
					</li>
					<li>
						Disconnect keeps the saved history but disables the active bot.
					</li>
				</ul>
			</section>
		</aside>
	);
}
