import { CloudUpload, Cpu, LoaderCircle, Server, Sparkles } from "lucide-react";
import { Button } from "#/components/ui/button";
import { FormFeedback } from "#/components/ui/form-feedback";
import { HostKeyTrustPanel } from "#/components/ui/host-key-trust-panel";
import type { HostKeyErrorPayload } from "#/features/servers/host-key-recovery";
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
	const activeLabel = activeBackend
		? activeBackend === "subscription" && savedSubscription
			? formatUserSubscriptionLabel(savedSubscription.subscriptionProvider)
			: savedApiConfig
				? formatAiProviderLabel(savedApiConfig.provider)
				: null
		: null;
	const currentConfig =
		activeBackend === "subscription" ? savedSubscription : savedApiConfig;
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
				<div className="mb-3 flex items-center gap-2">
					<div className="inline-flex rounded-xl border border-[var(--chip-line)] bg-[var(--chip-bg)] p-2 text-[var(--lagoon-deep)]">
						{activeBackend ? (
							activeBackend === "subscription" ? (
								<Sparkles className="h-5 w-5" />
							) : (
								<Cpu className="h-5 w-5" />
							)
						) : (
							<Server className="h-5 w-5" />
						)}
					</div>
					<div>
						<p className="island-kicker m-1">Active Runtime</p>
						<h3 className="m-0 text-lg font-semibold text-[var(--sea-ink)]">
							{activeLabel ?? "Not configured"}
						</h3>
					</div>
				</div>

				{activeBackend && activeModel ? (
					<div className="space-y-3 rounded-[1.5rem] border border-[var(--chip-line)] bg-[var(--chip-bg)] p-4">
						<div className="flex items-center justify-between gap-3">
							<span className="text-sm text-[var(--sea-ink-soft)]">Model</span>
							<span className="text-sm font-semibold text-[var(--sea-ink)]">
								{activeModel}
							</span>
						</div>
						{currentConfig?.baseUrl ? (
							<div className="flex items-center justify-between gap-3">
								<span className="text-sm text-[var(--sea-ink-soft)]">
									Endpoint
								</span>
								<span className="max-w-[180px] truncate text-xs text-[var(--sea-ink)]">
									{currentConfig.baseUrl}
								</span>
							</div>
						) : null}
						{currentConfig?.keyLast4 ? (
							<div className="flex items-center justify-between gap-3">
								<span className="text-sm text-[var(--sea-ink-soft)]">Key</span>
								<span className="text-xs text-[var(--sea-ink)]">
									···{currentConfig.keyLast4}
								</span>
							</div>
						) : null}
					</div>
				) : (
					<p className="mt-3 mb-0 text-sm text-[var(--sea-ink-soft)]">
						Save an access method below to power Hermes responses.
					</p>
				)}
			</section>

			<section className="island-shell rounded-[2rem] p-6">
				<p className="island-kicker mb-2">Hermes deployment</p>
				{telegramDeploy ? (
					<>
						<p className="mt-3 mb-0 text-sm text-[var(--sea-ink)]">
							Push your active model access config to the Hermes server.
						</p>
						{activeBackend && activeModel ? (
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
							<div className="mt-3">
								<HostKeyTrustPanel
									hostKeyError={hostKeyError}
									isAcceptingKey={isAcceptingKey}
									onTrustAndRetry={onTrustAndRetry}
									onDismiss={onDismissHostKey}
								/>
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
				<p className="island-kicker mb-2">Supported providers</p>
				<ul className="m-0 space-y-2 pl-5 text-sm text-[var(--sea-ink-soft)]">
					<li>
						<strong className="text-[var(--sea-ink)]">OpenAI</strong> — gpt-4o,
						gpt-4o-mini, gpt-4-turbo
					</li>
					<li>
						<strong className="text-[var(--sea-ink)]">Anthropic</strong> —
						Sonnet and Haiku variants
					</li>
					<li>
						<strong className="text-[var(--sea-ink)]">OpenRouter</strong> — any
						model ID
					</li>
					<li>
						<strong className="text-[var(--sea-ink)]">Ollama</strong> — local
						open-weight models (e.g. llama3)
					</li>
					<li>
						<strong className="text-[var(--sea-ink)]">Custom</strong> — any
						OpenAI-compatible endpoint
					</li>
					<li>
						<strong className="text-[var(--sea-ink)]">ChatGPT</strong> —
						subscription models via device-code OAuth
					</li>
					<li>
						<strong className="text-[var(--sea-ink)]">MiMo</strong> —
						mimo-v2.5-pro and mimo-v2.5 via tp-* API key
					</li>
				</ul>
			</section>
		</aside>
	);
}
