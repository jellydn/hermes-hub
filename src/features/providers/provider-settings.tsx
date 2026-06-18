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

	return (
		<div className="space-y-6">
			<div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
				<div className="space-y-6">
					<section className="space-y-4">
						<div className="mb-2 flex flex-col gap-1">
							<h3 className="m-0 text-xl font-semibold text-[var(--sea-ink)]">
								Subscriptions
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
								controller.dispatchUiAction({
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

					<section className="space-y-4">
						<div className="mb-2 flex flex-col gap-1">
							<h3 className="m-0 text-xl font-semibold text-[var(--sea-ink)]">
								API Keys
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
					isDeploying={controller.uiState.isDeploying}
					deployError={controller.uiState.deployError}
					deployResult={controller.uiState.deployResult}
					hostKeyError={controller.uiState.hostKeyError}
					isAcceptingKey={controller.uiState.isAcceptingKey}
					onDeploy={() => void controller.handleDeployToHermes()}
					onTrustAndRetry={() => void controller.handleTrustAndRetryDeploy()}
					onDismissHostKey={() =>
						controller.dispatchUiAction({ type: "deploy_trust_cancelled" })
					}
				/>
			</div>
		</div>
	);
}
