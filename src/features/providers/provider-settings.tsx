import type { TelegramDeployInfo } from "#/lib/load-telegram-deploy";
import type {
	ApiProviderConfigSummary,
	ModelAccessSnapshot,
	UserSubscriptionConfigSummary,
} from "#shared/contracts/model-access";

export type { ApiProviderConfigSummary, UserSubscriptionConfigSummary };

import { ProviderSelectionPanel } from "./provider-selection-panel";
import { ProviderSettingsAside } from "./provider-settings-aside";
import { SubscriptionSelectionPanel } from "./subscription-selection-panel";
import { useProviderSettingsController } from "./use-provider-settings-controller";

type ProviderSettingsProps = {
	initialAccess: ModelAccessSnapshot | null;
	telegramDeploy?: TelegramDeployInfo | null;
};

export function ProviderSettings({
	initialAccess,
	telegramDeploy,
}: ProviderSettingsProps) {
	const controller = useProviderSettingsController(initialAccess);
	const { activeBackend } = controller.uiState;

	const subscriptionActive = activeBackend === "subscription";
	const subscriptionInactive = activeBackend !== null && !subscriptionActive;
	const apiActive = activeBackend === "api-provider";
	const apiInactive = activeBackend !== null && !apiActive;

	return (
		<div className="space-y-6">
			<div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
				<div className="space-y-6">
					<section
						className={`space-y-4 transition-opacity${
							subscriptionInactive ? " opacity-60" : ""
						}`}
					>
						<div className="mb-2 flex flex-col gap-1">
							<h3 className="m-0 flex items-center gap-3 text-xl font-semibold text-[var(--sea-ink)]">
								Subscriptions
								{subscriptionActive ? (
									<span className="rounded-full bg-[rgba(79,184,178,0.2)] px-2.5 py-0.5 text-xs font-semibold text-[var(--lagoon-deep)]">
										Active
									</span>
								) : null}
								{subscriptionInactive ? (
									<span className="rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] px-2.5 py-0.5 text-xs font-medium text-[var(--sea-ink-soft)]">
										Inactive
									</span>
								) : null}
							</h3>
							<p className="m-1 max-w-2xl text-sm text-[var(--sea-ink-soft)]">
								Use your existing subscription access to power Hermes on your
								deployed server.
							</p>
						</div>
						<SubscriptionSelectionPanel
							form={controller.subscriptionFormValues}
							register={controller.subscriptionForm.register}
							savedSubscription={controller.uiState.savedSubscription}
							isSaving={controller.uiState.isSavingSubscription}
							isTesting={controller.uiState.isTestingSubscription}
							saveMessage={controller.uiState.subscriptionSaveMessage}
							saveError={controller.uiState.subscriptionSaveError}
							testError={controller.uiState.subscriptionTestError}
							isConnected={controller.isSubscriptionConnected}
							telegramDeployed={Boolean(telegramDeploy)}
							onSubscriptionChange={controller.updateSubscription}
							onCodexAuthStatusChange={(change) =>
								controller.dispatch({
									type: "codex_auth_status_changed",
									status: change.status,
									isLoading: change.isLoading,
									error: change.error,
								})
							}
							onSave={() => void controller.handleSaveSubscription()}
							onTest={() => void controller.handleTestSubscription()}
						/>
					</section>

					<section
						className={`space-y-4 transition-opacity${
							apiInactive ? " opacity-60" : ""
						}`}
					>
						<div className="mb-2 flex flex-col gap-1">
							<h3 className="m-0 flex items-center gap-3 text-xl font-semibold text-[var(--sea-ink)]">
								API Keys
								{apiActive ? (
									<span className="rounded-full bg-[rgba(79,184,178,0.2)] px-2.5 py-0.5 text-xs font-semibold text-[var(--lagoon-deep)]">
										Active
									</span>
								) : null}
								{apiInactive ? (
									<span className="rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] px-2.5 py-0.5 text-xs font-medium text-[var(--sea-ink-soft)]">
										Inactive
									</span>
								) : null}
							</h3>
							<p className="m-0 max-w-2xl text-sm text-[var(--sea-ink-soft)]">
								Bring your own API key from any supported provider.
							</p>
						</div>
						<ProviderSelectionPanel
							form={controller.apiForm}
							register={controller.providerForm.register}
							savedConfig={controller.uiState.savedApiConfig}
							isSaving={controller.uiState.isSavingProvider}
							isTesting={controller.uiState.isTestingApiProvider}
							saveMessage={controller.uiState.providerSaveMessage}
							saveError={controller.uiState.providerSaveError}
							testError={controller.uiState.apiTestError}
							isConnected={controller.isApiProviderConnected}
							onProviderChange={controller.updateProvider}
							onSave={() => void controller.handleSaveProvider()}
							onTest={() => void controller.handleTestConnection()}
						/>
					</section>
				</div>

				<ProviderSettingsAside
					activeBackend={controller.uiState.activeBackend}
					savedApiConfig={controller.uiState.savedApiConfig}
					savedSubscription={controller.uiState.savedSubscription}
					telegramDeploy={telegramDeploy}
					codexAuthStatus={controller.uiState.codexAuthStatus}
					isLoadingCodexAuth={controller.uiState.isLoadingCodexAuth}
				/>
			</div>
		</div>
	);
}
