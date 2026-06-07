import { KeyRound, LoaderCircle } from "lucide-react";
import type { UseFormRegister } from "react-hook-form";

import { Button } from "@/components/ui/button";
import {
	formatUserSubscriptionLabel,
	getUserSubscriptionOption,
	userSubscriptionOptions,
} from "@/lib/user-subscriptions";
import type { UserSubscriptionConfigSummary } from "../../../shared/contracts/model-access";
import { CodexAuthPanel, type CodexAuthStatusChange } from "./codex-auth-panel";
import {
	ProviderSettingsField,
	providerInputClassName,
} from "./provider-settings-ui";

type SubscriptionFormState = {
	subscriptionProvider: "chatgpt";
	model: string;
};

type SubscriptionSelectionPanelProps = {
	form: SubscriptionFormState;
	register: UseFormRegister<SubscriptionFormState>;
	savedSubscription: UserSubscriptionConfigSummary | null;
	isSaving: boolean;
	saveMessage: string | null;
	saveError: string | null;
	telegramDeployed: boolean;
	onCodexAuthStatusChange: (change: CodexAuthStatusChange) => void;
	onSave: () => void;
};

export function SubscriptionSelectionPanel({
	form,
	register,
	savedSubscription,
	isSaving,
	saveMessage,
	saveError,
	telegramDeployed,
	onCodexAuthStatusChange,
	onSave,
}: SubscriptionSelectionPanelProps) {
	const subscriptionOption = getUserSubscriptionOption(
		form.subscriptionProvider,
	);

	return (
		<section className="island-shell rounded-[2rem] p-6 sm:p-8">
			<div className="mb-8 flex flex-col gap-3">
				<h3 className="m-0 text-2xl font-semibold text-[var(--sea-ink)]">
					Use your ChatGPT subscription
				</h3>
				<p className="m-0 max-w-2xl text-sm text-[var(--sea-ink-soft)] sm:text-base">
					Authenticate on your deployed Hermes server with ChatGPT device-code
					login. OAuth tokens stay on the VPS — HermesHub never stores them.
				</p>
			</div>

			<fieldset className="grid gap-4 border-0 p-0">
				<legend className="sr-only">Subscription provider</legend>
				{userSubscriptionOptions.map((option) => {
					const isSelected = option.id === form.subscriptionProvider;

					return (
						<div
							key={option.id}
							className={[
								"rounded-[1.75rem] border p-5 text-left",
								isSelected
									? "border-[color:var(--lagoon)] bg-[rgba(79,184,178,0.14)]"
									: "border-[var(--chip-line)] bg-[var(--chip-bg)]",
							].join(" ")}
						>
							<h4 className="m-0 text-base font-semibold text-[var(--sea-ink)]">
								{option.label}
							</h4>
							<p className="mt-2 mb-0 text-sm text-[var(--sea-ink-soft)]">
								{option.description}
							</p>
						</div>
					);
				})}
			</fieldset>

			{savedSubscription ? (
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
					hint={`Pre-selected default for ${formatUserSubscriptionLabel(form.subscriptionProvider)}.`}
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

			<div className="mt-8 flex flex-wrap gap-3 border-t border-[var(--line)] pt-6">
				<Button type="button" onClick={onSave} disabled={isSaving}>
					{isSaving ? (
						<LoaderCircle className="h-4 w-4 animate-spin" />
					) : (
						<KeyRound className="h-4 w-4" />
					)}
					<span>{isSaving ? "Saving..." : "Save Subscription"}</span>
				</Button>
			</div>

			<CodexAuthPanel
				telegramDeployed={telegramDeployed}
				onCodexAuthStatusChange={onCodexAuthStatusChange}
			/>
		</section>
	);
}
