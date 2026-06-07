import {
	CheckCircle2,
	KeyRound,
	LoaderCircle,
	Radio,
	ShieldCheck,
} from "lucide-react";
import type { UseFormRegister } from "react-hook-form";

import { Button } from "@/components/ui/button";
import {
	type ApiProviderId,
	apiProviderOptions,
	formatAiProviderLabel,
	getAiProviderOption,
} from "@/lib/ai-providers";

import type { ApiProviderConfigSummary } from "../../../shared/contracts/model-access";
import {
	ProviderSettingsField,
	providerInputClassName,
} from "./provider-settings-ui";

type ProviderFormState = {
	provider: ApiProviderId;
	model: string;
	apiKey: string;
	baseUrl: string;
};

type ProviderSelectionPanelProps = {
	form: ProviderFormState;
	register: UseFormRegister<ProviderFormState>;
	savedConfig: ApiProviderConfigSummary | null;
	isSaving: boolean;
	isTesting: boolean;
	saveMessage: string | null;
	saveError: string | null;
	testError: string | null;
	isConnected: boolean;
	onProviderChange: (provider: ApiProviderId) => void;
	onSave: () => void;
	onTest: () => void;
};

export function ProviderSelectionPanel({
	form,
	register,
	savedConfig,
	isSaving,
	isTesting,
	saveMessage,
	saveError,
	testError,
	isConnected,
	onProviderChange,
	onSave,
	onTest,
}: ProviderSelectionPanelProps) {
	const providerOption = getAiProviderOption(form.provider);
	const existingKeyLast4 =
		savedConfig?.provider === form.provider ? savedConfig.keyLast4 : null;

	return (
		<section className="island-shell rounded-[2rem] p-6 sm:p-8">
			<div className="mb-8 flex flex-col gap-3">
				<p className="island-kicker m-0">API providers</p>
				<h3 className="m-0 text-2xl font-semibold text-[var(--sea-ink)]">
					Connect with an API key
				</h3>
				<p className="m-0 max-w-2xl text-sm text-[var(--sea-ink-soft)] sm:text-base">
					Pick an API provider, save your settings, and validate the connection
					before deploying to Hermes.
				</p>
			</div>

			<fieldset className="grid gap-4 border-0 p-0 sm:grid-cols-2 lg:grid-cols-3">
				<legend className="sr-only">API provider</legend>
				{apiProviderOptions.map((option) => {
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
								onChange={() => onProviderChange(option.id)}
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
				<ProviderSettingsField
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
						type="password"
						{...register("apiKey")}
						className={providerInputClassName}
						placeholder={
							existingKeyLast4 ? `••••${existingKeyLast4}` : "Paste API key"
						}
					/>
				</ProviderSettingsField>

				{providerOption?.requiresBaseUrl ? (
					<ProviderSettingsField
						label="Base URL"
						name="baseUrl"
						hint={`The base URL for the ${providerOption?.label ?? ""} endpoint.`}
					>
						<input
							id="baseUrl"
							type="text"
							{...register("baseUrl")}
							className={providerInputClassName}
							placeholder={
								providerOption?.defaultBaseUrl ??
								"https://api.yourprovider.com/v1"
							}
						/>
					</ProviderSettingsField>
				) : null}

				{providerOption?.requiresCustomModel ? (
					<ProviderSettingsField
						label="Custom model ID"
						name="model"
						hint={`Enter the model ID or name for ${providerOption?.label ?? ""}.`}
					>
						<input
							id="model"
							type="text"
							{...register("model")}
							className={providerInputClassName}
							placeholder={providerOption?.defaultModel || "deepseek-chat"}
						/>
					</ProviderSettingsField>
				) : (
					<ProviderSettingsField
						label="Model"
						name="model"
						hint="Pre-selected default for the chosen provider."
					>
						<select
							id="model"
							{...register("model")}
							className={providerInputClassName}
						>
							{providerOption?.models.map((model) => (
								<option key={model} value={model}>
									{model}
								</option>
							))}
						</select>
					</ProviderSettingsField>
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
				<Button type="button" onClick={onSave} disabled={isSaving}>
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
					onClick={onTest}
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
	);
}
