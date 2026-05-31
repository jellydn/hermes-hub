import {
	CheckCircle2,
	KeyRound,
	LoaderCircle,
	Radio,
	ShieldCheck,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
	type AiProviderId,
	aiProviderOptions,
	formatAiProviderLabel,
	getAiProviderOption,
	getDefaultAiModel,
} from "@/lib/ai-providers";

export type ProviderSettingsSummary = {
	provider: AiProviderId;
	model: string;
	keyLast4: string | null;
	hasStoredKey: boolean;
	baseUrl?: string | null;
};

type ProviderSettingsProps = {
	initialConfig: ProviderSettingsSummary | null;
};

type ProviderFormState = {
	provider: AiProviderId;
	model: string;
	apiKey: string;
	baseUrl: string;
};

const initialProvider = aiProviderOptions[0]?.id ?? "openai";

export function ProviderSettings({ initialConfig }: ProviderSettingsProps) {
	const [savedConfig, setSavedConfig] =
		useState<ProviderSettingsSummary | null>(initialConfig);
	const [form, setForm] = useState<ProviderFormState>(() =>
		createInitialFormState(initialConfig),
	);
	const [isSaving, setIsSaving] = useState(false);
	const [isTesting, setIsTesting] = useState(false);
	const [saveMessage, setSaveMessage] = useState<string | null>(null);
	const [saveError, setSaveError] = useState<string | null>(null);
	const [testError, setTestError] = useState<string | null>(null);
	const [isConnected, setIsConnected] = useState(false);

	const providerOption = getAiProviderOption(form.provider);
	const existingKeyLast4 =
		savedConfig?.provider === form.provider ? savedConfig.keyLast4 : null;

	function updateProvider(provider: AiProviderId) {
		const option = getAiProviderOption(provider);
		setForm({
			provider,
			model: getDefaultAiModel(provider),
			apiKey: "",
			baseUrl:
				option?.id === savedConfig?.provider && savedConfig?.baseUrl
					? savedConfig.baseUrl
					: (option?.defaultBaseUrl ?? ""),
		});
		setSaveMessage(null);
		setSaveError(null);
		setTestError(null);
		setIsConnected(false);
	}

	async function handleSave() {
		setIsSaving(true);
		setSaveMessage(null);
		setSaveError(null);
		setTestError(null);

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
				setSaveError(payload?.error ?? "Unable to save provider settings.");
				return;
			}

			setSavedConfig(payload.provider);
			setForm((currentForm) => ({ ...currentForm, apiKey: "" }));
			setSaveMessage("Provider settings saved.");
		} finally {
			setIsSaving(false);
		}
	}

	async function handleTestConnection() {
		setIsTesting(true);
		setTestError(null);
		setSaveError(null);
		setIsConnected(false);

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
				setTestError(payload?.error ?? "Connection failed");
				return;
			}

			setIsConnected(payload?.status === "connected");
		} finally {
			setIsTesting(false);
		}
	}

	return (
		<section className="space-y-6">
			<div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
				<section className="island-shell rounded-[2rem] p-6 sm:p-8">
					<div className="mb-8 flex flex-col gap-3">
						<p className="island-kicker m-0">Provider selection</p>
						<h3 className="m-0 text-2xl font-semibold text-[var(--sea-ink)]">
							Choose your model backend
						</h3>
						<p className="m-0 max-w-2xl text-sm text-[var(--sea-ink-soft)] sm:text-base">
							Pick a provider, save your API key, and validate the connection
							before wiring it into Telegram and the dashboard.
						</p>
					</div>

					<fieldset className="grid gap-4 border-0 p-0 sm:grid-cols-2 lg:grid-cols-3">
						<legend className="sr-only">AI provider</legend>
						{aiProviderOptions.map((option) => {
							const isSelected = option.id === form.provider;

							return (
								<label
									key={option.id}
									className={[
										"block cursor-pointer rounded-[1.75rem] border p-5 text-left transition",
										isSelected
											? "border-[color:var(--lagoon)] bg-[rgba(79,184,178,0.14)]"
											: "border-[var(--chip-line)] bg-[var(--chip-bg)]",
									].join(" ")}
								>
									<input
										type="radio"
										name="provider"
										value={option.id}
										checked={isSelected}
										onChange={() => updateProvider(option.id)}
										className="sr-only"
									/>
									<div className="mb-4 inline-flex rounded-2xl border border-[var(--chip-line)] bg-white/70 p-3 text-[var(--lagoon-deep)]">
										<Radio className="h-5 w-5" />
									</div>
									<div className="space-y-2">
										<div className="flex items-center justify-between gap-3">
											<h4 className="m-0 text-base font-semibold text-[var(--sea-ink)]">
												{option.label}
											</h4>
											<span
												className={[
													"rounded-full px-3 py-1 text-xs font-semibold",
													isSelected
														? "bg-[rgba(79,184,178,0.2)] text-[var(--lagoon-deep)]"
														: "bg-white/70 text-[var(--sea-ink-soft)]",
												].join(" ")}
											>
												{isSelected ? "Selected" : "Choose"}
											</span>
										</div>
										<p className="m-0 text-sm text-[var(--sea-ink-soft)]">
											{option.description}
										</p>
									</div>
								</label>
							);
						})}
					</fieldset>

					<div className="mt-8 grid gap-5 md:grid-cols-2">
						<Field
							label="API key"
							name="apiKey"
							hint={
								existingKeyLast4
									? `Stored key ending in ${existingKeyLast4}. Leave blank to keep it.`
									: providerOption?.requiresBaseUrl
										? "API Key (optional for providers using a base URL)."
										: `Paste your ${formatAiProviderLabel(form.provider)} API key.`
							}
						>
							<input
								id="apiKey"
								name="apiKey"
								type="password"
								value={form.apiKey}
								onChange={(event) =>
									setForm((currentForm) => ({
										...currentForm,
										apiKey: event.currentTarget.value,
									}))
								}
								className={inputClassName}
								placeholder={
									existingKeyLast4 ? `••••${existingKeyLast4}` : "Paste API key"
								}
							/>
						</Field>

						{providerOption?.requiresBaseUrl ? (
							<Field
								label="Base URL"
								name="baseUrl"
								hint={`The base URL for the ${providerOption?.label ?? ""} endpoint.`}
							>
								<input
									id="baseUrl"
									name="baseUrl"
									type="text"
									value={form.baseUrl}
									onChange={(event) =>
										setForm((currentForm) => ({
											...currentForm,
											baseUrl: event.currentTarget.value,
										}))
									}
									className={inputClassName}
									placeholder={
										providerOption?.defaultBaseUrl ??
										"https://api.yourprovider.com/v1"
									}
								/>
							</Field>
						) : null}

						{providerOption?.requiresCustomModel ? (
							<Field
								label="Custom model ID"
								name="model"
								hint={`Enter the model ID or name for ${providerOption?.label ?? ""}.`}
							>
								<input
									id="model"
									name="model"
									type="text"
									value={form.model}
									onChange={(event) =>
										setForm((currentForm) => ({
											...currentForm,
											model: event.currentTarget.value,
										}))
									}
									className={inputClassName}
									placeholder={providerOption?.defaultModel || "deepseek-chat"}
								/>
							</Field>
						) : (
							<Field
								label="Model"
								name="model"
								hint="Pre-selected default for the chosen provider."
							>
								<select
									id="model"
									name="model"
									value={form.model}
									onChange={(event) =>
										setForm((currentForm) => ({
											...currentForm,
											model: event.currentTarget.value,
										}))
									}
									className={inputClassName}
								>
									{providerOption?.models.map((model) => (
										<option key={model} value={model}>
											{model}
										</option>
									))}
								</select>
							</Field>
						)}
					</div>

					{saveMessage ? (
						<div className="mt-6 rounded-[1.5rem] border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-[var(--sea-ink)]">
							{saveMessage}
						</div>
					) : null}

					{saveError ? (
						<div className="mt-6 rounded-[1.5rem] border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-[var(--sea-ink)]">
							{saveError}
						</div>
					) : null}

					{testError ? (
						<div className="mt-6 rounded-[1.5rem] border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-[var(--sea-ink)]">
							{testError}
						</div>
					) : null}

					{isConnected ? (
						<div className="mt-6 rounded-[1.5rem] border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-[var(--sea-ink)]">
							<div className="flex items-center gap-3">
								<CheckCircle2 className="h-5 w-5 text-emerald-600" />
								<span>Provider connected</span>
							</div>
						</div>
					) : null}

					<div className="mt-8 flex flex-wrap gap-3 border-t border-[var(--line)] pt-6">
						<Button
							type="button"
							onClick={() => void handleSave()}
							disabled={isSaving}
						>
							{isSaving ? (
								<LoaderCircle className="h-4 w-4 animate-spin" />
							) : (
								<KeyRound className="h-4 w-4" />
							)}
							<span>{isSaving ? "Saving..." : "Save Provider"}</span>
						</Button>
						<Button
							type="button"
							variant="secondary"
							onClick={() => void handleTestConnection()}
							disabled={isTesting}
						>
							{isTesting ? (
								<LoaderCircle className="h-4 w-4 animate-spin" />
							) : (
								<ShieldCheck className="h-4 w-4" />
							)}
							<span>{isTesting ? "Testing..." : "Test Connection"}</span>
						</Button>
					</div>
				</section>

				<aside className="space-y-4">
					<section className="island-shell rounded-[2rem] p-6">
						<p className="island-kicker mb-2">Current config</p>
						<h3 className="m-0 text-xl font-semibold text-[var(--sea-ink)]">
							{savedConfig
								? formatAiProviderLabel(savedConfig.provider)
								: "No provider connected"}
						</h3>
						<p className="mt-3 mb-0 text-sm text-[var(--sea-ink-soft)]">
							{savedConfig
								? `Model: ${savedConfig.model}`
								: "Save a provider configuration to power Hermes responses."}
						</p>
						{savedConfig?.baseUrl ? (
							<p className="mt-3 mb-0 text-xs text-[var(--sea-ink-soft)] truncate">
								Base URL: {savedConfig.baseUrl}
							</p>
						) : null}
						{savedConfig?.keyLast4 ? (
							<p className="mt-3 mb-0 text-sm text-[var(--sea-ink)]">
								Stored key ending in {savedConfig.keyLast4}
							</p>
						) : null}
					</section>

					<section className="island-shell rounded-[2rem] p-6">
						<p className="island-kicker mb-2">Model notes</p>
						<ul className="m-0 space-y-2 pl-5 text-sm text-[var(--sea-ink-soft)]">
							<li>OpenAI: gpt-4o, gpt-4o-mini, gpt-4-turbo.</li>
							<li>Anthropic: Sonnet and Haiku variants.</li>
							<li>OpenRouter accepts any model ID.</li>
							<li>Ollama: Run local open-weight models (e.g. llama3).</li>
							<li>Custom: Connect to custom OpenAI-compatible endpoints.</li>
						</ul>
					</section>
				</aside>
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

function Field({
	children,
	hint,
	label,
	name,
}: {
	children: React.ReactNode;
	hint: string;
	label: string;
	name: string;
}) {
	return (
		<div className="space-y-2">
			<label
				className="block text-sm font-semibold text-[var(--sea-ink)]"
				htmlFor={name}
			>
				{label}
			</label>
			{children}
			<p className="block min-h-5 text-xs text-[var(--sea-ink-soft)]">{hint}</p>
		</div>
	);
}

const inputClassName =
	"w-full rounded-full border border-[var(--chip-line)] bg-white/80 px-4 py-3 text-sm text-[var(--sea-ink)] outline-none focus:border-[color:var(--lagoon)] focus:ring-2 focus:ring-[rgba(79,184,178,0.18)]";
