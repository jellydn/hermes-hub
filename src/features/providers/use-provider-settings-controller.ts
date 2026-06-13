import { zodResolver } from "@hookform/resolvers/zod";
import { useReducer, useState } from "react";
import { useForm } from "react-hook-form";
import {
	type ApiProviderId,
	getAiProviderOption,
	getDefaultAiModel,
} from "#/lib/ai-providers";
import {
	getDefaultSubscriptionModel,
	getSubscriptionDefaultBaseUrl,
	subscriptionSupportsConnectionTest,
	type UserSubscriptionId,
} from "#/lib/user-subscriptions";
import type { ModelAccessSnapshot } from "#shared/contracts/model-access";

import {
	providerConnectionFingerprint,
	subscriptionConnectionFingerprint,
} from "./connection-fingerprint";
import {
	deployModelAccess,
	saveProviderAccess,
	saveSubscriptionAccess,
	testProviderAccess,
	testSubscriptionAccess,
} from "./provider-access-actions";
import {
	type ProviderAccessTab,
	resolveInitialProviderAccessTab,
} from "./provider-access-tab";
import {
	createInitialProviderFormState,
	createInitialSubscriptionFormState,
	providerSchema,
	subscriptionSchema,
} from "./provider-settings-forms";
import {
	createInitialProviderSettingsUiState,
	type ProviderSettingsUiAction,
	type ProviderSettingsUiState,
	providerSettingsUiReducer,
} from "./provider-settings-state";

export function useProviderSettingsController(
	initialAccess: ModelAccessSnapshot | null,
) {
	const [uiState, dispatch] = useReducer(
		providerSettingsUiReducer,
		initialAccess,
		createInitialProviderSettingsUiState,
	);
	const [selectedTab, setSelectedTab] = useState<ProviderAccessTab>(() =>
		resolveInitialProviderAccessTab(initialAccess?.activeBackend ?? null),
	);
	const providerForm = useForm({
		resolver: zodResolver(providerSchema),
		defaultValues: createInitialProviderFormState(initialAccess?.apiProvider),
	});
	const subscriptionForm = useForm({
		resolver: zodResolver(subscriptionSchema),
		defaultValues: createInitialSubscriptionFormState(
			initialAccess?.subscription,
		),
	});

	const apiForm = providerForm.watch();
	const subscriptionFormValues = subscriptionForm.watch();
	const activeConnectionFingerprint =
		selectedTab === "subscription"
			? subscriptionConnectionFingerprint(
					subscriptionFormValues.subscriptionProvider,
					{
						model: subscriptionFormValues.model,
						apiKey: subscriptionFormValues.apiKey,
						baseUrl: subscriptionFormValues.baseUrl,
						storedKeyLast4:
							uiState.savedSubscription?.subscriptionProvider ===
							subscriptionFormValues.subscriptionProvider
								? uiState.savedSubscription.keyLast4
								: null,
					},
				)
			: providerConnectionFingerprint(apiForm.provider, {
					model: apiForm.model,
					apiKey: apiForm.apiKey,
					baseUrl: apiForm.baseUrl,
					storedKeyLast4:
						uiState.savedApiConfig?.provider === apiForm.provider
							? uiState.savedApiConfig.keyLast4
							: null,
				});
	const isConnected =
		uiState.verifiedConnectionFingerprint !== null &&
		uiState.verifiedConnectionFingerprint === activeConnectionFingerprint;

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

	function updateSubscription(subscription: UserSubscriptionId) {
		subscriptionForm.setValue("subscriptionProvider", subscription);
		subscriptionForm.setValue(
			"model",
			getDefaultSubscriptionModel(subscription),
		);
		subscriptionForm.setValue("apiKey", "");
		subscriptionForm.setValue(
			"baseUrl",
			uiState.savedSubscription?.subscriptionProvider === subscription &&
				uiState.savedSubscription.baseUrl
				? uiState.savedSubscription.baseUrl
				: getSubscriptionDefaultBaseUrl(subscription),
		);
		dispatch({ type: "subscription_changed" });
	}

	async function handleSaveProvider() {
		dispatch({ type: "provider_save_started" });

		try {
			const result = await saveProviderAccess(apiForm);

			if (!result.ok) {
				dispatch({
					type: "provider_save_failed",
					error: result.error,
				});
				return;
			}

			providerForm.setValue("apiKey", "");
			dispatch({ type: "provider_save_succeeded", config: result.provider });
			setSelectedTab("api");
		} finally {
			dispatch({ type: "provider_save_finished" });
		}
	}

	async function handleSaveSubscription() {
		dispatch({ type: "subscription_save_started" });

		try {
			const priorFingerprint = subscriptionConnectionFingerprint(
				subscriptionFormValues.subscriptionProvider,
				{
					model: subscriptionFormValues.model,
					apiKey: subscriptionFormValues.apiKey,
					baseUrl: subscriptionFormValues.baseUrl,
					storedKeyLast4:
						uiState.savedSubscription?.subscriptionProvider ===
						subscriptionFormValues.subscriptionProvider
							? uiState.savedSubscription.keyLast4
							: null,
				},
			);
			const result = await saveSubscriptionAccess(subscriptionFormValues);

			if (!result.ok) {
				dispatch({
					type: "subscription_save_failed",
					error: result.error,
				});
				return;
			}

			if (
				subscriptionSupportsConnectionTest(
					subscriptionFormValues.subscriptionProvider,
				)
			) {
				subscriptionForm.setValue("apiKey", "");
			}

			const savedFingerprint = subscriptionSupportsConnectionTest(
				subscriptionFormValues.subscriptionProvider,
			)
				? subscriptionConnectionFingerprint(
						subscriptionFormValues.subscriptionProvider,
						{
							model: result.subscription.model,
							apiKey: "",
							baseUrl:
								result.subscription.baseUrl ?? subscriptionFormValues.baseUrl,
							storedKeyLast4: result.subscription.keyLast4,
						},
					)
				: null;

			dispatch({
				type: "subscription_save_succeeded",
				config: result.subscription,
				connectionFingerprint:
					uiState.verifiedConnectionFingerprint === priorFingerprint
						? savedFingerprint
						: null,
			});
			setSelectedTab("subscription");
		} finally {
			dispatch({ type: "subscription_save_finished" });
		}
	}

	async function handleTestSubscription() {
		dispatch({ type: "test_started" });

		try {
			const result = await testSubscriptionAccess(subscriptionFormValues);

			if (!result.ok) {
				dispatch({
					type: "test_failed",
					error: result.error,
				});
				return;
			}

			dispatch({
				type: "test_succeeded",
				fingerprint: subscriptionConnectionFingerprint(
					subscriptionFormValues.subscriptionProvider,
					{
						model: subscriptionFormValues.model,
						apiKey: subscriptionFormValues.apiKey,
						baseUrl: subscriptionFormValues.baseUrl,
						storedKeyLast4:
							uiState.savedSubscription?.subscriptionProvider ===
							subscriptionFormValues.subscriptionProvider
								? uiState.savedSubscription.keyLast4
								: null,
					},
				),
			});
		} finally {
			dispatch({ type: "test_finished" });
		}
	}

	async function handleTestConnection() {
		dispatch({ type: "test_started" });

		try {
			const result = await testProviderAccess(apiForm);

			if (!result.ok) {
				dispatch({
					type: "test_failed",
					error: result.error,
				});
				return;
			}

			dispatch({
				type: "test_succeeded",
				fingerprint: providerConnectionFingerprint(apiForm.provider, {
					model: apiForm.model,
					apiKey: apiForm.apiKey,
					baseUrl: apiForm.baseUrl,
					storedKeyLast4:
						uiState.savedApiConfig?.provider === apiForm.provider
							? uiState.savedApiConfig.keyLast4
							: null,
				}),
			});
		} finally {
			dispatch({ type: "test_finished" });
		}
	}

	async function handleDeployToHermes() {
		dispatch({ type: "deploy_started" });

		try {
			const result = await deployModelAccess();

			if (!result.ok) {
				dispatch({
					type: "deploy_failed",
					error: result.error,
				});
				return;
			}

			dispatch({
				type: "deploy_succeeded",
				message: result.message,
			});
		} finally {
			dispatch({ type: "deploy_finished" });
		}
	}

	function dispatchUiAction(action: ProviderSettingsUiAction) {
		dispatch(action);
	}

	return {
		uiState,
		selectedTab,
		setSelectedTab,
		providerForm,
		subscriptionForm,
		apiForm,
		subscriptionFormValues,
		isConnected,
		updateProvider,
		updateSubscription,
		handleSaveProvider,
		handleSaveSubscription,
		handleTestSubscription,
		handleTestConnection,
		handleDeployToHermes,
		dispatchUiAction,
	};
}

export type ProviderSettingsController = ReturnType<
	typeof useProviderSettingsController
>;

export type { ProviderSettingsUiState };
