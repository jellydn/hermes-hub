import { CheckCircle2, Cpu, Server, Sparkles } from "lucide-react";

import { ModelAccessDeployPanel } from "#/features/providers/model-access-deploy-panel";
import { formatAiProviderLabel } from "#/lib/ai-providers";
import { formatUserSubscriptionLabel } from "#/lib/user-subscriptions";
import type {
	ApiProviderConfigSummary,
	ModelAccessSnapshot,
	UserSubscriptionConfigSummary,
} from "#shared/contracts/model-access";

import type { TelegramSettingsSummary } from "./telegram-settings";

type TelegramSidebarProps = {
	savedConfig: TelegramSettingsSummary | null;
	activeBackend: ModelAccessSnapshot["activeBackend"];
	savedApiConfig: ApiProviderConfigSummary | null;
	savedSubscription: UserSubscriptionConfigSummary | null;
};

export function TelegramSidebar({
	savedConfig,
	activeBackend,
	savedApiConfig,
	savedSubscription,
}: TelegramSidebarProps) {
	const isDeployed = Boolean(savedConfig?.deployedServerHost);
	const deployedHost = savedConfig?.deployedServerHost ?? null;
	const hasModelAccess = Boolean(activeBackend);

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
						Save an API provider or subscription to power Hermes responses.
					</p>
				)}
			</section>

			<ModelAccessDeployPanel
				title="Model Access Deployment"
				isDeployed={isDeployed}
				disabled={!hasModelAccess}
				emptyMessage={
					<p className="mt-3 mb-0 text-sm text-[var(--sea-ink-soft)]">
						Deploy your Telegram bot to a VPS first to enable model access
						deployment.
					</p>
				}
			>
				{hasModelAccess ? (
					<p className="mt-3 mb-0 text-sm text-[var(--sea-ink)]">
						Push your active model access config to the Hermes server.
					</p>
				) : (
					<p className="mt-3 mb-0 text-sm text-[var(--sea-ink-soft)]">
						No model access config found. Save an API provider or subscription
						first.
					</p>
				)}
			</ModelAccessDeployPanel>

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
