import { CloudUpload, LoaderCircle, Server } from "lucide-react";
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
