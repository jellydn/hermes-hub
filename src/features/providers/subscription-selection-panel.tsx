import {
	CheckCircle2,
	KeyRound,
	LoaderCircle,
	ShieldCheck,
} from "lucide-react";
import type { UseFormRegister } from "react-hook-form";
import { Button } from "#/components/ui/button";
import {
	formatUserSubscriptionLabel,
	getCredentialSubscriptionOption,
	getUserSubscriptionOption,
	subscriptionRequiresCredentials,
	type UserSubscriptionId,
	userSubscriptionOptions,
} from "#/lib/user-subscriptions";
import type { UserSubscriptionConfigSummary } from "#shared/contracts/model-access";
import { CodexAuthPanel, type CodexAuthStatusChange } from "./codex-auth-panel";
import {
	ProviderSettingsField,
	providerInputClassName,
} from "./provider-settings-ui";

type SubscriptionFormState = {
	subscriptionProvider: UserSubscriptionId;
	model: string;
	apiKey: string;
	baseUrl: string;
};

type SubscriptionSelectionPanelProps = {
	form: SubscriptionFormState;
	register: UseFormRegister<SubscriptionFormState>;
	savedSubscription: UserSubscriptionConfigSummary | null;
	isSaving: boolean;
	isTesting: boolean;
	saveMessage: string | null;
	saveError: string | null;
	testError: string | null;
	isConnected: boolean;
	telegramDeployed: boolean;
	onSubscriptionChange: (subscription: UserSubscriptionId) => void;
	onCodexAuthStatusChange: (change: CodexAuthStatusChange) => void;
	onSave: () => void;
	onTest: () => void;
};

export function SubscriptionSelectionPanel({
	form,
	register,
	savedSubscription,
	isSaving,
	isTesting,
	saveMessage,
	saveError,
	testError,
	isConnected,
	telegramDeployed,
	onSubscriptionChange,
	onCodexAuthStatusChange,
	onSave,
	onTest,
}: SubscriptionSelectionPanelProps) {
	const subscriptionOption = getUserSubscriptionOption(
		form.subscriptionProvider,
	);
	const requiresCredentials = subscriptionRequiresCredentials(
		form.subscriptionProvider,
	);
	const credentialOption = getCredentialSubscriptionOption(
		form.subscriptionProvider,
	);
	const existingKeyLast4 =
		savedSubscription?.subscriptionProvider === form.subscriptionProvider
			? savedSubscription.keyLast4
			: null;

	return (
		<section className="island-shell rounded-[2rem] p-6 sm:p-8">
			<div className="mb-8 flex flex-col gap-3">
				<h3 className="m-0 text-2xl font-semibold text-[var(--sea-ink)]">
					Use your subscription access
				</h3>
				<p className="m-0 max-w-2xl text-sm text-[var(--sea-ink-soft)] sm:text-base">
					Choose ChatGPT device-code login or MiMo Token Plan credentials to
					power Hermes on your deployed server.
				</p>
			</div>

			<fieldset className="grid gap-4 border-0 p-0">
				<legend className="sr-only">Subscription provider</legend>
				{userSubscriptionOptions.map((option) => {
					const isSelected = option.id === form.subscriptionProvider;

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
								name="subscriptionProvider"
								value={option.id}
								checked={isSelected}
								onChange={() => onSubscriptionChange(option.id)}
								className="sr-only"
							/>
							<h4 className="m-0 text-base font-semibold text-[var(--sea-ink)]">
								{option.label}
							</h4>
							<p className="mt-2 mb-0 text-sm text-[var(--sea-ink-soft)]">
								{option.description}
							</p>
						</label>
					);
				})}
			</fieldset>

			{savedSubscription?.subscriptionProvider === form.subscriptionProvider ? (
				<p className="mt-6 mb-0 text-sm text-[var(--sea-ink-soft)]">
					Saved subscription model:{" "}
					<span className="font-semibold text-[var(--sea-ink)]">
						{savedSubscription.model}
					</span>
				</p>
			) : null}

			<div className="mt-8 grid gap-5 md:grid-cols-2">
				<ProviderSettingsField
					label="Model"
					name="model"
					hint={`Pre-selected default for ${formatUserSubscriptionLabel(
						form.subscriptionProvider,
					)}.`}
				>
					<select
						id="subscription-model"
						{...register("model")}
						className={providerInputClassName}
					>
						{subscriptionOption?.models.map((model) => (
							<option key={model} value={model}>
								{model}
							</option>
						))}
					</select>
				</ProviderSettingsField>

				{requiresCredentials ? (
					<>
						<ProviderSettingsField
							label="API key"
							name="apiKey"
							hint={
								existingKeyLast4
									? `Stored key ending in ${existingKeyLast4}. Leave blank to keep it.`
									: "Paste your tp-* MiMo Token Plan API key."
							}
						>
							<input
								id="subscription-api-key"
								type="password"
								autoComplete="off"
								placeholder={existingKeyLast4 ? "••••••••••••" : "tp-..."}
								{...register("apiKey")}
								className={providerInputClassName}
							/>
						</ProviderSettingsField>

						<ProviderSettingsField
							label="Base URL"
							name="baseUrl"
							hint="MiMo Token Plan uses a dedicated OpenAI-compatible endpoint."
						>
							<input
								id="subscription-base-url"
								type="url"
								autoComplete="off"
								placeholder={credentialOption?.defaultBaseUrl}
								{...register("baseUrl")}
								className={providerInputClassName}
							/>
						</ProviderSettingsField>
					</>
				) : null}
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
				<div className="mt-6 flex items-center gap-2 rounded-[1.5rem] border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-[var(--sea-ink)]">
					<CheckCircle2 className="h-4 w-4 text-emerald-600" />
					<span>Provider connected</span>
				</div>
			) : null}

			<div className="mt-8 flex flex-wrap gap-3 border-t border-[var(--line)] pt-6">
				<Button type="button" onClick={onSave} disabled={isSaving}>
					{isSaving ? (
						<LoaderCircle className="h-4 w-4 animate-spin" />
					) : (
						<KeyRound className="h-4 w-4" />
					)}
					<span>{isSaving ? "Saving..." : "Save Subscription"}</span>
				</Button>

				{requiresCredentials ? (
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
				) : null}
			</div>

			{form.subscriptionProvider === "chatgpt" ? (
				<CodexAuthPanel
					telegramDeployed={telegramDeployed}
					onCodexAuthStatusChange={onCodexAuthStatusChange}
				/>
			) : null}
		</section>
	);
}
