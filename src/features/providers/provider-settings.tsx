import { zodResolver } from "@hookform/resolvers/zod";
import { useReducer, useState } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";
import {
	type ApiProviderId,
	getAiProviderOption,
	getDefaultAiModel,
} from "@/lib/ai-providers";
import type { TelegramDeployInfo } from "@/lib/load-telegram-deploy";
import { getDefaultSubscriptionModel } from "@/lib/user-subscriptions";
import type {
	ApiProviderConfigSummary,
	ModelAccessSnapshot,
	UserSubscriptionConfigSummary,
} from "../../../shared/contracts/model-access";

export type { ApiProviderConfigSummary, UserSubscriptionConfigSummary };

import {
	type ProviderAccessTab,
	resolveInitialProviderAccessTab,
} from "./provider-access-tab";
import { ProviderAccessTabs } from "./provider-access-tabs";
import { ProviderSelectionPanel } from "./provider-selection-panel";
import { ProviderSettingsAside } from "./provider-settings-aside";
import {
	createInitialProviderSettingsUiState,
	providerSettingsUiReducer,
} from "./provider-settings-state";
import { SubscriptionSelectionPanel } from "./subscription-selection-panel";

type ProviderSettingsProps = {
	initialAccess: ModelAccessSnapshot | null;
	telegramDeploy?: TelegramDeployInfo | null;
};

type ProviderFormState = {
	provider: ApiProviderId;
	model: string;
	apiKey: string;
	baseUrl: string;
};

type SubscriptionFormState = {
	subscriptionProvider: "chatgpt";
	model: string;
};

const initialProvider = "openai" as ApiProviderId;

const providerSchema = z.object({
	provider: z.custom<ApiProviderId>(),
	model: z.string(),
	apiKey: z.string(),
	baseUrl: z.string(),
});

const subscriptionSchema = z.object({
	subscriptionProvider: z.literal("chatgpt"),
	model: z.string(),
});

export function ProviderSettings({
	initialAccess,
	telegramDeploy,
}: ProviderSettingsProps) {
	const [uiState, dispatch] = useReducer(
		providerSettingsUiReducer,
		initialAccess,
		createInitialProviderSettingsUiState,
	);
	const [selectedTab, setSelectedTab] = useState<ProviderAccessTab>(() =>
		resolveInitialProviderAccessTab(initialAccess?.activeBackend ?? null),
	);
	const providerForm = useForm<ProviderFormState>({
		resolver: zodResolver(providerSchema),
		defaultValues: createInitialProviderFormState(initialAccess?.apiProvider),
	});
	const subscriptionForm = useForm<SubscriptionFormState>({
		resolver: zodResolver(subscriptionSchema),
		defaultValues: createInitialSubscriptionFormState(
			initialAccess?.subscription,
		),
	});

	const apiForm = providerForm.watch();
	const subscriptionFormValues = subscriptionForm.watch();

	function updateProvider(provider: ApiProviderId) {
		const option = getAiProviderOption(provider);
		providerForm.setValue("provider", provider);
		providerForm.setValue("model", getDefaultAiModel(provider));
		providerForm.setValue("apiKey", "");
		providerForm.setValue(
			"baseUrl",
			option?.id === uiState.savedApiConfig?.provider &&
				uiState.savedApiConfig?.baseUrl
				? uiState.savedApiConfig.baseUrl
				: (option?.defaultBaseUrl ?? ""),
		);
		dispatch({ type: "provider_changed" });
	}

	async function handleSaveProvider() {
		dispatch({ type: "provider_save_started" });

		try {
			const response = await fetch("/api/providers", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(apiForm),
			});

			const payload = (await response.json().catch(() => null)) as {
				error?: string;
				provider?: ApiProviderConfigSummary;
			} | null;

			if (!response.ok || !payload?.provider) {
				dispatch({
					type: "provider_save_failed",
					error: payload?.error ?? "Unable to save provider settings.",
				});
				return;
			}

			providerForm.setValue("apiKey", "");
			dispatch({ type: "provider_save_succeeded", config: payload.provider });
			setSelectedTab("api");
		} finally {
			dispatch({ type: "provider_save_finished" });
		}
	}

	async function handleSaveSubscription() {
		dispatch({ type: "subscription_save_started" });

		try {
			const response = await fetch("/api/providers/subscriptions", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(subscriptionFormValues),
			});

			const payload = (await response.json().catch(() => null)) as {
				error?: string;
				subscription?: UserSubscriptionConfigSummary;
			} | null;

			if (!response.ok || !payload?.subscription) {
				dispatch({
					type: "subscription_save_failed",
					error: payload?.error ?? "Unable to save subscription settings.",
				});
				return;
			}

			dispatch({
				type: "subscription_save_succeeded",
				config: payload.subscription,
			});
			setSelectedTab("subscription");
		} finally {
			dispatch({ type: "subscription_save_finished" });
		}
	}

	async function handleTestConnection() {
		dispatch({ type: "test_started" });

		try {
			const response = await fetch("/api/providers/test", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(apiForm),
			});

			const payload = (await response.json().catch(() => null)) as {
				error?: string;
				status?: string;
			} | null;

			if (!response.ok) {
				dispatch({
					type: "test_failed",
					error: payload?.error ?? "Connection failed",
				});
				return;
			}

			dispatch({
				type: "test_succeeded",
				connected: payload?.status === "connected",
			});
		} finally {
			dispatch({ type: "test_finished" });
		}
	}

	async function handleDeployToHermes() {
		dispatch({ type: "deploy_started" });

		try {
			const response = await fetch("/api/providers/deploy", {
				method: "POST",
			});

			const payload = (await response.json().catch(() => null)) as {
				error?: string;
				status?: string;
				model?: string;
			} | null;

			if (!response.ok) {
				dispatch({
					type: "deploy_failed",
					error: payload?.error ?? "Deploy failed",
				});
				return;
			}

			dispatch({
				type: "deploy_succeeded",
				message: payload?.model
					? `Model "${payload.model}" deployed successfully.`
					: "Deployed successfully.",
			});
		} finally {
			dispatch({ type: "deploy_finished" });
		}
	}

	return (
		<section className="space-y-6">
			<div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
				<div className="space-y-4">
					<ProviderAccessTabs
						selectedTab={selectedTab}
						activeBackend={uiState.activeBackend}
						onTabChange={setSelectedTab}
					/>

					{selectedTab === "subscription" ? (
						<div
							role="tabpanel"
							id="provider-access-panel-subscription"
							aria-labelledby="provider-access-tab-subscription"
						>
							<SubscriptionSelectionPanel
								form={subscriptionFormValues}
								register={subscriptionForm.register}
								savedSubscription={uiState.savedSubscription}
								isSaving={uiState.isSavingSubscription}
								saveMessage={uiState.subscriptionSaveMessage}
								saveError={uiState.subscriptionSaveError}
								telegramDeployed={Boolean(telegramDeploy)}
								onCodexAuthStatusChange={(change) =>
									dispatch({
										type: "codex_auth_status_changed",
										status: change.status,
										isLoading: change.isLoading,
										error: change.error,
									})
								}
								onSave={() => void handleSaveSubscription()}
							/>
						</div>
					) : (
						<div
							role="tabpanel"
							id="provider-access-panel-api"
							aria-labelledby="provider-access-tab-api"
						>
							<ProviderSelectionPanel
								form={apiForm}
								register={providerForm.register}
								savedConfig={uiState.savedApiConfig}
								isSaving={uiState.isSavingProvider}
								isTesting={uiState.isTesting}
								saveMessage={uiState.providerSaveMessage}
								saveError={uiState.providerSaveError}
								testError={uiState.testError}
								isConnected={uiState.isConnected}
								onProviderChange={updateProvider}
								onSave={() => void handleSaveProvider()}
								onTest={() => void handleTestConnection()}
							/>
						</div>
					)}
				</div>

				<ProviderSettingsAside
					activeBackend={uiState.activeBackend}
					savedApiConfig={uiState.savedApiConfig}
					savedSubscription={uiState.savedSubscription}
					telegramDeploy={telegramDeploy}
					codexAuthStatus={uiState.codexAuthStatus}
					isLoadingCodexAuth={uiState.isLoadingCodexAuth}
					isDeploying={uiState.isDeploying}
					deployError={uiState.deployError}
					deployResult={uiState.deployResult}
					onDeploy={() => void handleDeployToHermes()}
				/>
			</div>
		</section>
	);
}

function createInitialProviderFormState(
	initialConfig: ApiProviderConfigSummary | null | undefined,
) {
	const provider = initialConfig?.provider ?? initialProvider;
	const option = getAiProviderOption(provider);

	return {
		provider,
		model: initialConfig?.model ?? getDefaultAiModel(provider),
		apiKey: "",
		baseUrl: initialConfig?.baseUrl ?? option?.defaultBaseUrl ?? "",
	};
}

function createInitialSubscriptionFormState(
	initialSubscription: UserSubscriptionConfigSummary | null | undefined,
) {
	return {
		subscriptionProvider: "chatgpt" as const,
		model: initialSubscription?.model ?? getDefaultSubscriptionModel("chatgpt"),
	};
}
