import {
	ArrowRight,
	CheckCircle2,
	ExternalLink,
	LoaderCircle,
	RefreshCw,
} from "lucide-react";

import { AlertPanel } from "#/components/ui/alert-panel";
import { Button } from "#/components/ui/button";
import { HostKeyTrustPanel } from "#/components/ui/host-key-trust-panel";
import type { ModelAccessOptionsResponse } from "#shared/contracts/telegram-model-access";
import { useModelAccessController } from "./use-model-access-controller";

type TelegramModelAccessSectionProps = {
	isDeployed: boolean;
	onSwitched?: () => void;
};

const selectClassName =
	"block w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--sea-ink)] outline-none ring-[var(--focus-ring)] transition-shadow focus:ring-2";

type ModelAccessFormProps = {
	optionsState: ModelAccessOptionsResponse | null;
	selectedOptionId: string;
	selectedModel: string;
	isSwitching: boolean;
	isLoading: boolean;
	selectClassName: string;
	onOptionChange: (optionId: string, model: string) => void;
	onModelChange: (model: string) => void;
	onSwitch: () => void;
	onRefresh: () => void;
};

function ModelAccessForm({
	optionsState,
	selectedOptionId,
	selectedModel,
	isSwitching,
	isLoading,
	selectClassName,
	onOptionChange,
	onModelChange,
	onSwitch,
	onRefresh,
}: ModelAccessFormProps) {
	const selectedOption = optionsState?.options?.find(
		(o) => o.optionId === selectedOptionId,
	);

	return (
		<div className="mt-4 space-y-4">
			<div>
				<label
					htmlFor="model-access-option"
					className="mb-1.5 block text-sm font-medium text-[var(--sea-ink)]"
				>
					Provider / Subscription
				</label>
				<select
					id="model-access-option"
					className={selectClassName}
					value={selectedOptionId}
					onChange={(e) => {
						const opt = optionsState?.options.find(
							(o) => o.optionId === e.target.value,
						);
						onOptionChange(e.target.value, opt?.model ?? "");
					}}
				>
					<option value="">— Select —</option>
					{optionsState?.options?.map((opt) => (
						<option key={opt.optionId} value={opt.optionId}>
							{opt.label}
							{opt.isActive ? " (active)" : ""}
							{opt.keyLast4 ? ` (••••${opt.keyLast4})` : ""}
						</option>
					))}
				</select>
				{selectedOption?.keyLast4 ? (
					<p className="mt-1 text-xs text-[var(--sea-ink-soft)]">
						Key: ••••{selectedOption.keyLast4}
						{selectedOption.baseUrl ? ` · URL: ${selectedOption.baseUrl}` : ""}
					</p>
				) : null}
			</div>

			{selectedOption ? (
				<div>
					<label
						htmlFor="model-access-model"
						className="mb-1.5 block text-sm font-medium text-[var(--sea-ink)]"
					>
						Model
					</label>
					<input
						id="model-access-model"
						type="text"
						className={selectClassName}
						placeholder="Enter model name (e.g. gpt-4o)"
						value={selectedModel}
						list="model-access-suggestions"
						onChange={(e) => {
							onModelChange(e.target.value);
						}}
					/>
					{selectedOption.fixedModels &&
					selectedOption.fixedModels.length > 0 ? (
						<datalist id="model-access-suggestions">
							{selectedOption.fixedModels.map((m) => (
								<option key={m} value={m} />
							))}
						</datalist>
					) : null}
				</div>
			) : null}

			<div className="flex flex-wrap gap-3 border-t border-[var(--line)] pt-6">
				<Button
					type="button"
					disabled={isSwitching || !selectedOptionId || !selectedModel}
					onClick={onSwitch}
				>
					{isSwitching ? (
						<LoaderCircle className="h-4 w-4 animate-spin" />
					) : (
						<ArrowRight className="h-4 w-4" />
					)}
					<span>{isSwitching ? "Switching..." : "Switch"}</span>
				</Button>
				<Button
					type="button"
					variant="secondary"
					disabled={isLoading}
					onClick={onRefresh}
				>
					<RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
					<span>Refresh</span>
				</Button>
			</div>
		</div>
	);
}

export function TelegramModelAccessSection({
	isDeployed,
	onSwitched,
}: TelegramModelAccessSectionProps) {
	const {
		state,
		dispatch,
		fetchOptions,
		handleSwitch,
		handleTrustAndRetrySwitch,
	} = useModelAccessController({ isDeployed, onSwitched });

	if (!isDeployed) {
		return null;
	}

	const {
		optionsState,
		selectedOptionId,
		selectedModel,
		isLoading,
		isSwitching,
		message,
		hostKeyError,
		isAcceptingKey,
	} = state;

	const activeOption = optionsState?.options?.find(
		(o) => o.optionId === optionsState?.activeOptionId,
	);

	return (
		<section className="island-shell rounded-[2rem] p-6 sm:p-8">
			<div className="mb-6 flex flex-col gap-3">
				<p className="island-kicker m-0">Model Access</p>
				<h3 className="m-0 text-2xl font-semibold text-[var(--sea-ink)]">
					Switch model or provider
				</h3>
				<p className="m-0 max-w-2xl text-sm text-[var(--sea-ink-soft)] sm:text-base">
					Choose a saved AI provider or subscription and model to use with the
					deployed Hermes runtime.
				</p>
			</div>

			{activeOption ? (
				<AlertPanel
					tone="success"
					LeadingIcon={CheckCircle2}
					leadingIconClassName="h-5 w-5 text-[var(--alert-success-fg)]"
				>
					Active: <strong>{activeOption.label}</strong> —{" "}
					<code className="rounded bg-[var(--bg-subtle)] px-1 py-0.5 text-xs">
						{activeOption.model}
					</code>
				</AlertPanel>
			) : null}

			{message ? (
				<AlertPanel
					tone={message.type === "success" ? "success" : "error"}
					className="mt-3"
					LeadingIcon={message.type === "success" ? CheckCircle2 : undefined}
					leadingIconClassName={
						message.type === "success"
							? "h-5 w-5 text-[var(--alert-success-fg)]"
							: undefined
					}
				>
					{message.text}
				</AlertPanel>
			) : null}

			{hostKeyError ? (
				<HostKeyTrustPanel
					hostKeyError={hostKeyError}
					isAcceptingKey={isAcceptingKey}
					onTrustAndRetry={() => void handleTrustAndRetrySwitch()}
					onDismiss={() => dispatch({ type: "hostKeyCleared" })}
				/>
			) : null}

			{isLoading ? (
				<div className="flex items-center gap-2 py-8 text-sm text-[var(--sea-ink-soft)]">
					<LoaderCircle className="h-4 w-4 animate-spin" />
					Loading saved options...
				</div>
			) : optionsState && optionsState.options?.length === 0 ? (
				<div className="rounded-2xl border border-[var(--line)] p-6 text-center">
					<p className="mb-3 text-sm text-[var(--sea-ink-soft)]">
						No saved AI provider or subscription found. Save one first.
					</p>
					<Button variant="secondary" asChild>
						<a href="/ai-provider">
							Go to AI Provider settings
							<ExternalLink className="h-4 w-4" />
						</a>
					</Button>
				</div>
			) : (
				<ModelAccessForm
					optionsState={optionsState}
					selectedOptionId={selectedOptionId}
					selectedModel={selectedModel}
					isSwitching={isSwitching}
					isLoading={isLoading}
					selectClassName={selectClassName}
					onOptionChange={(optionId, model) =>
						dispatch({ type: "optionSelected", optionId, model })
					}
					onModelChange={(model) => dispatch({ type: "modelChanged", model })}
					onSwitch={() => void handleSwitch()}
					onRefresh={() => void fetchOptions()}
				/>
			)}
		</section>
	);
}
