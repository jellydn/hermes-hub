import { zodResolver } from "@hookform/resolvers/zod";
import { useReducer } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";

import {
	type AiProviderId,
	getAiProviderOption,
	getDefaultAiModel,
} from "@/lib/ai-providers";
import type { TelegramDeployInfo } from "@/lib/load-telegram-deploy";
import { ProviderSelectionPanel } from "./provider-selection-panel";
import { ProviderSettingsAside } from "./provider-settings-aside";
import {
	createInitialProviderSettingsUiState,
	providerSettingsUiReducer,
} from "./provider-settings-state";

export type ProviderSettingsSummary = {
	provider: AiProviderId;
	model: string;
	keyLast4: string | null;
	hasStoredKey: boolean;
	baseUrl?: string | null;
};

type ProviderSettingsProps = {
	initialConfig: ProviderSettingsSummary | null;
	telegramDeploy?: TelegramDeployInfo | null;
};

type ProviderFormState = {
	provider: AiProviderId;
	model: string;
	apiKey: string;
	baseUrl: string;
};

const initialProvider = "openai" as AiProviderId;

const providerSchema = z.object({
	provider: z.custom<AiProviderId>(),
	model: z.string(),
	apiKey: z.string(),
	baseUrl: z.string(),
});

export function ProviderSettings({
	initialConfig,
	telegramDeploy,
}: ProviderSettingsProps) {
	const [uiState, dispatch] = useReducer(
		providerSettingsUiReducer,
		initialConfig,
		createInitialProviderSettingsUiState,
	);
	const { register, watch, setValue } = useForm<ProviderFormState>({
		resolver: zodResolver(providerSchema),
		defaultValues: createInitialFormState(initialConfig),
	});

	const form = watch();

	function updateProvider(provider: AiProviderId) {
		const option = getAiProviderOption(provider);
		setValue("provider", provider);
		setValue("model", getDefaultAiModel(provider));
		setValue("apiKey", "");
		setValue(
			"baseUrl",
			option?.id === uiState.savedConfig?.provider &&
				uiState.savedConfig?.baseUrl
				? uiState.savedConfig.baseUrl
				: (option?.defaultBaseUrl ?? ""),
		);
		dispatch({ type: "provider_changed" });
	}

	async function handleSave() {
		dispatch({ type: "save_started" });

		try {
			const response = await fetch("/api/providers", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(form),
			});

			const payload = (await response.json().catch(() => null)) as {
				error?: string;
				provider?: ProviderSettingsSummary;
			} | null;

			if (!response.ok || !payload?.provider) {
				dispatch({
					type: "save_failed",
					error: payload?.error ?? "Unable to save provider settings.",
				});
				return;
			}

			setValue("apiKey", "");
			dispatch({ type: "save_succeeded", config: payload.provider });
		} finally {
			dispatch({ type: "save_finished" });
		}
	}

	async function handleTestConnection() {
		dispatch({ type: "test_started" });

		try {
			const response = await fetch("/api/providers/test", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(form),
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
				<ProviderSelectionPanel
					form={form}
					register={register}
					savedConfig={uiState.savedConfig}
					isSaving={uiState.isSaving}
					isTesting={uiState.isTesting}
					saveMessage={uiState.saveMessage}
					saveError={uiState.saveError}
					testError={uiState.testError}
					isConnected={uiState.isConnected}
					telegramDeployed={Boolean(telegramDeploy)}
					onCodexAuthStatusChange={(change) =>
						dispatch({
							type: "codex_auth_status_changed",
							status: change.status,
							isLoading: change.isLoading,
							error: change.error,
						})
					}
					onProviderChange={updateProvider}
					onSave={() => void handleSave()}
					onTest={() => void handleTestConnection()}
				/>

				<ProviderSettingsAside
					savedConfig={uiState.savedConfig}
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

function createInitialFormState(initialConfig: ProviderSettingsSummary | null) {
	const provider = initialConfig?.provider ?? initialProvider;
	const option = getAiProviderOption(provider);

	return {
		provider,
		model: initialConfig?.model ?? getDefaultAiModel(provider),
		apiKey: "",
		baseUrl: initialConfig?.baseUrl ?? option?.defaultBaseUrl ?? "",
	};
}
