import { Cpu, Server, Sparkles } from "lucide-react";

import { formatAiProviderLabel } from "#/lib/ai-providers";
import { formatUserSubscriptionLabel } from "#/lib/user-subscriptions";
import type {
	ApiProviderConfigSummary,
	ModelAccessSnapshot,
	UserSubscriptionConfigSummary,
} from "#shared/contracts/model-access";

type ActiveRuntimeCardProps = {
	activeBackend: ModelAccessSnapshot["activeBackend"];
	savedApiConfig: ApiProviderConfigSummary | null;
	savedSubscription: UserSubscriptionConfigSummary | null;
	emptyMessage?: React.ReactNode;
};

/**
 * Shared sidebar card that shows the currently active model access config
 * (provider/subscription, model, endpoint, key last 4).
 *
 * Used by both the AI Provider page's aside and the Telegram page's sidebar
 * so the rendering logic stays in one place.
 */
export function ActiveRuntimeCard({
	activeBackend,
	savedApiConfig,
	savedSubscription,
	emptyMessage = "Save an access method below to power Hermes responses.",
}: ActiveRuntimeCardProps) {
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
					{emptyMessage}
				</p>
			)}
		</section>
	);
}
