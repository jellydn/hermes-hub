import { Server } from "lucide-react";
import { ActiveRuntimeCard } from "#/features/providers/active-runtime-card";
import { ModelAccessDeployPanel } from "#/features/providers/model-access-deploy-panel";
import type { TelegramDeployInfo } from "#/lib/load-telegram-deploy";
import { subscriptionSupportsConnectionTest } from "#/lib/user-subscriptions";
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
};

export function ProviderSettingsAside({
	activeBackend,
	savedApiConfig,
	savedSubscription,
	telegramDeploy,
	codexAuthStatus,
	isLoadingCodexAuth,
}: ProviderSettingsAsideProps) {
	const activeModel =
		activeBackend === "subscription"
			? savedSubscription?.model
			: savedApiConfig?.model;
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
			<ActiveRuntimeCard
				activeBackend={activeBackend}
				savedApiConfig={savedApiConfig}
				savedSubscription={savedSubscription}
			/>

			<ModelAccessDeployPanel
				title="Hermes deployment"
				isDeployed={Boolean(telegramDeploy)}
				disabled={!canDeploy}
				emptyMessage={
					<>
						<p className="mt-3 mb-0 text-sm text-[var(--sea-ink-soft)]">
							Deploy a Telegram bot to a VPS first to enable Hermes deployment.
						</p>
						<div className="mt-4 flex items-center gap-2 text-sm text-[var(--sea-ink-soft)]">
							<Server className="h-4 w-4" />
							<span>Not deployed</span>
						</div>
					</>
				}
			>
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
			</ModelAccessDeployPanel>

			<section className="island-shell rounded-[2rem] p-6">
				<p className="island-kicker mb-2">Supported providers</p>
				<ul className="m-0 space-y-2 pl-5 text-sm text-[var(--sea-ink-soft)]">
					<li>
						<strong className="text-[var(--sea-ink)]">OpenAI</strong> — GPT-5.6,
						GPT-5.5, and GPT-5.4 variants
					</li>
					<li>
						<strong className="text-[var(--sea-ink)]">Anthropic</strong> —
						Fable, Opus, Sonnet, and Haiku variants
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
						<strong className="text-[var(--sea-ink)]">DeepSeek</strong> —
						deepseek-v4-flash and deepseek-v4-pro
					</li>
					<li>
						<strong className="text-[var(--sea-ink)]">Command Code</strong> —
						taste-1, DeepSeek, MiniMax, and MiMo models via user_* API key
						(coding plans from $1/mo)
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
