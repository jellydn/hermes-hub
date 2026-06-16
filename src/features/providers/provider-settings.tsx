import type { TelegramDeployInfo } from "#/lib/load-telegram-deploy";
import type {
	ApiProviderConfigSummary,
	ModelAccessSnapshot,
	UserSubscriptionConfigSummary,
} from "#shared/contracts/model-access";

export type { ApiProviderConfigSummary, UserSubscriptionConfigSummary };

import { ProviderAccessTabs } from "./provider-access-tabs";
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
		<section className="space-y-6">
			<div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
				<div className="space-y-4">
					<ProviderAccessTabs
						selectedTab={controller.selectedTab}
						activeBackend={controller.uiState.activeBackend}
						onTabChange={controller.setSelectedTab}
					/>

					{controller.selectedTab === "subscription" ? (
						<div
							role="tabpanel"
							id="provider-access-panel-subscription"
							aria-labelledby="provider-access-tab-subscription"
						>
							<SubscriptionSelectionPanel
								form={controller.subscriptionFormValues}
								register={controller.subscriptionForm.register}
								savedSubscription={controller.uiState.savedSubscription}
								isSaving={controller.uiState.isSavingSubscription}
								isTesting={controller.uiState.isTesting}
								saveMessage={controller.uiState.subscriptionSaveMessage}
								saveError={controller.uiState.subscriptionSaveError}
								testError={controller.uiState.testError}
								isConnected={controller.isConnected}
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
						</div>
					) : (
						<div
							role="tabpanel"
							id="provider-access-panel-api"
							aria-labelledby="provider-access-tab-api"
						>
							<ProviderSelectionPanel
								form={controller.apiForm}
								register={controller.providerForm.register}
								savedConfig={controller.uiState.savedApiConfig}
								isSaving={controller.uiState.isSavingProvider}
								isTesting={controller.uiState.isTesting}
								saveMessage={controller.uiState.providerSaveMessage}
								saveError={controller.uiState.providerSaveError}
								testError={controller.uiState.testError}
								isConnected={controller.isConnected}
								onProviderChange={controller.updateProvider}
								onSave={() => void controller.handleSaveProvider()}
								onTest={() => void controller.handleTestConnection()}
							/>
						</div>
					)}
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
		</section>
	);
}
