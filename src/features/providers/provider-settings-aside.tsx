import {
	CheckCircle2,
	CloudUpload,
	LoaderCircle,
	Server,
	TriangleAlert,
} from "lucide-react";
import { Button } from "#/components/ui/button";
import { FormFeedback } from "#/components/ui/form-feedback";
import { formatAiProviderLabel } from "#/lib/ai-providers";
import type { TelegramDeployInfo } from "#/lib/load-telegram-deploy";
import {
	formatUserSubscriptionLabel,
	subscriptionSupportsConnectionTest,
} from "#/lib/user-subscriptions";
import type { CodexAuthStatus } from "#shared/contracts/codex-auth";
import type {
	ApiProviderConfigSummary,
	ModelAccessSnapshot,
	UserSubscriptionConfigSummary,
} from "#shared/contracts/model-access";
import type { HostKeyErrorPayload } from "./provider-access-actions";

type ProviderSettingsAsideProps = {
	activeBackend: ModelAccessSnapshot["activeBackend"];
	savedApiConfig: ApiProviderConfigSummary | null;
	savedSubscription: UserSubscriptionConfigSummary | null;
	telegramDeploy?: TelegramDeployInfo | null;
	codexAuthStatus: CodexAuthStatus | null;
	isLoadingCodexAuth: boolean;
	isDeploying: boolean;
	deployError: string | null;
	deployResult: string | null;
	hostKeyError: HostKeyErrorPayload | null;
	isAcceptingKey: boolean;
	onDeploy: () => void;
	onTrustAndRetry: () => void;
	onDismissHostKey: () => void;
};

export function ProviderSettingsAside({
	activeBackend,
	savedApiConfig,
	savedSubscription,
	telegramDeploy,
	codexAuthStatus,
	isLoadingCodexAuth,
	isDeploying,
	deployError,
	deployResult,
	hostKeyError,
	isAcceptingKey,
	onDeploy,
	onTrustAndRetry,
	onDismissHostKey,
}: ProviderSettingsAsideProps) {
	const activeModel =
		activeBackend === "subscription"
			? savedSubscription?.model
			: savedApiConfig?.model;
	const activeLabel =
		activeBackend === "subscription" && savedSubscription
			? formatUserSubscriptionLabel(savedSubscription.subscriptionProvider)
			: savedApiConfig
				? formatAiProviderLabel(savedApiConfig.provider)
				: null;
	const requiresCodexAuth =
		activeBackend === "subscription" &&
		savedSubscription &&
		!subscriptionSupportsConnectionTest(savedSubscription.subscriptionProvider);
	const codexReadyForDeploy =
		!requiresCodexAuth ||
		(!isLoadingCodexAuth && codexAuthStatus?.authenticated === true);
	const canDeploy =
		Boolean(activeBackend) && Boolean(telegramDeploy) && codexReadyForDeploy;

	return (
		<aside className="space-y-4">
			<section className="island-shell rounded-[2rem] p-6">
				<p className="island-kicker mb-2">Active model access</p>
				<h3 className="m-0 text-xl font-semibold text-[var(--sea-ink)]">
					{activeLabel ?? "No model access configured"}
				</h3>
				<p className="mt-3 mb-0 text-sm text-[var(--sea-ink-soft)]">
					{activeModel
						? `Model: ${activeModel}`
						: "Save an API provider or subscription to power Hermes responses."}
				</p>
				{savedApiConfig?.baseUrl ? (
					<p className="mt-3 mb-0 text-xs text-[var(--sea-ink-soft)] truncate">
						Base URL: {savedApiConfig.baseUrl}
					</p>
				) : null}
				{savedApiConfig?.keyLast4 ? (
					<p className="mt-3 mb-0 text-sm text-[var(--sea-ink)]">
						Stored key ending in {savedApiConfig.keyLast4}
					</p>
				) : null}
				{savedSubscription?.baseUrl ? (
					<p className="mt-3 mb-0 text-xs text-[var(--sea-ink-soft)] truncate">
						Base URL: {savedSubscription.baseUrl}
					</p>
				) : null}
				{savedSubscription?.keyLast4 ? (
					<p className="mt-3 mb-0 text-sm text-[var(--sea-ink)]">
						Stored key ending in {savedSubscription.keyLast4}
					</p>
				) : null}
			</section>

			<section className="island-shell rounded-[2rem] p-6">
				<p className="island-kicker mb-2">Hermes deployment</p>
				{telegramDeploy ? (
					<>
						<p className="mt-3 mb-0 text-sm text-[var(--sea-ink)]">
							Push your active model access config to the Hermes server.
						</p>
						{activeModel ? (
							<p className="mt-3 mb-0 text-sm text-[var(--sea-ink-soft)]">
								Model:{" "}
								<span className="font-semibold text-[var(--sea-ink)]">
									{activeModel}
								</span>
							</p>
						) : null}
						{requiresCodexAuth && !codexReadyForDeploy ? (
							<p className="mt-3 mb-0 text-sm text-[var(--sea-ink-soft)]">
								{isLoadingCodexAuth
									? "Checking remote Codex auth status..."
									: "Complete ChatGPT device-code login before deploying to Hermes."}
							</p>
						) : null}
						<div className="mt-4">
							<Button
								type="button"
								onClick={onDeploy}
								disabled={isDeploying || !canDeploy}
							>
								{isDeploying ? (
									<LoaderCircle className="h-4 w-4 animate-spin" />
								) : (
									<CloudUpload className="h-4 w-4" />
								)}
								<span>
									{isDeploying ? "Deploying..." : "Deploy to Hermes Server"}
								</span>
							</Button>
						</div>

						{hostKeyError ? (
							<div className="mt-3 rounded-2xl border border-[var(--alert-warning-line)] bg-[var(--alert-warning-bg)] p-4">
								<div className="flex items-start gap-3">
									<TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-[var(--alert-warning-fg)]" />
									<div className="min-w-0 flex-1">
										<p className="m-0 text-sm font-medium text-[var(--alert-warning-fg)]">
											{hostKeyError.code === "host_key_missing"
												? "Host key not yet trusted"
												: "Host key mismatch"}
										</p>
										<p className="mb-3 mt-1 text-sm text-[var(--sea-ink-soft)]">
											{hostKeyError.code === "host_key_missing" ? (
												<>
													The server{" "}
													<code className="rounded bg-[var(--bg-subtle)] px-1 py-0.5 text-xs">
														{hostKeyError.serverHost}
													</code>{" "}
													has no stored host key. Review the fingerprint below
													and trust it to continue.
												</>
											) : (
												<>
													The fingerprint for{" "}
													<code className="rounded bg-[var(--bg-subtle)] px-1 py-0.5 text-xs">
														{hostKeyError.serverHost}
													</code>{" "}
													does not match the stored key.
												</>
											)}
										</p>

										<div className="mb-4 space-y-1 rounded-xl bg-[var(--bg-subtle)] p-3 font-mono text-xs">
											<div className="flex gap-2">
												<span className="shrink-0 text-[var(--sea-ink-soft)]">
													Fingerprint:
												</span>
												<span className="break-all text-[var(--sea-ink)]">
													{hostKeyError.observedFingerprint}
												</span>
											</div>
											<div className="flex gap-2">
												<span className="shrink-0 text-[var(--sea-ink-soft)]">
													Algorithm:
												</span>
												<span className="text-[var(--sea-ink)]">
													{hostKeyError.observedAlgorithm}
												</span>
											</div>
											{hostKeyError.expectedFingerprint ? (
												<div className="flex gap-2">
													<span className="shrink-0 text-[var(--sea-ink-soft)]">
														Expected:
													</span>
													<span className="break-all text-[var(--sea-ink)]">
														{hostKeyError.expectedFingerprint}
													</span>
												</div>
											) : null}
										</div>

										<div className="flex flex-wrap gap-3">
											<Button
												type="button"
												disabled={isAcceptingKey}
												onClick={onTrustAndRetry}
											>
												{isAcceptingKey ? (
													<LoaderCircle className="h-4 w-4 animate-spin" />
												) : (
													<CheckCircle2 className="h-4 w-4" />
												)}
												<span>
													{isAcceptingKey
														? "Trusting..."
														: "Trust host key and retry"}
												</span>
											</Button>
											<Button
												type="button"
												variant="secondary"
												disabled={isAcceptingKey}
												onClick={onDismissHostKey}
											>
												Cancel
											</Button>
										</div>
									</div>
								</div>
							</div>
						) : null}

						{deployError ? (
							<FormFeedback className="mt-3 mb-0 text-sm" tone="error">
								{deployError}
							</FormFeedback>
						) : null}
						{deployResult ? (
							<FormFeedback className="mt-3 mb-0 text-sm" tone="success">
								{deployResult}
							</FormFeedback>
						) : null}
					</>
				) : (
					<>
						<p className="mt-3 mb-0 text-sm text-[var(--sea-ink-soft)]">
							Deploy a Telegram bot to a VPS first to enable Hermes deployment.
						</p>
						<div className="mt-4 flex items-center gap-2 text-sm text-[var(--sea-ink-soft)]">
							<Server className="h-4 w-4" />
							<span>Not deployed</span>
						</div>
					</>
				)}
			</section>

			<section className="island-shell rounded-[2rem] p-6">
				<p className="island-kicker mb-2">Model notes</p>
				<ul className="m-0 space-y-2 pl-5 text-sm text-[var(--sea-ink-soft)]">
					<li>OpenAI: gpt-4o, gpt-4o-mini, gpt-4-turbo.</li>
					<li>Anthropic: Sonnet and Haiku variants.</li>
					<li>OpenRouter accepts any model ID.</li>
					<li>Ollama: Run local open-weight models (e.g. llama3).</li>
					<li>Custom: Connect to custom OpenAI-compatible endpoints.</li>
					<li>
						ChatGPT: Subscription models via device-code OAuth on the deployed
						Hermes server.
					</li>
					<li>
						Xiaomi MiMo Token Plan: mimo-v2.5-pro and mimo-v2.5 via tp-* API key
						and the MiMo base URL.
					</li>
				</ul>
			</section>
		</aside>
	);
}
