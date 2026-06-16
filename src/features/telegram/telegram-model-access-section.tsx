import {
	ArrowRight,
	CheckCircle2,
	ExternalLink,
	LoaderCircle,
	RefreshCw,
} from "lucide-react";
import { useCallback, useReducer } from "react";

import { AlertPanel } from "#/components/ui/alert-panel";
import { Button } from "#/components/ui/button";
import { useMountEffect } from "#/lib/use-mount-effect";
import type { ModelAccessOptionsResponse } from "#shared/contracts/telegram-model-access";

type TelegramModelAccessSectionProps = {
	isDeployed: boolean;
};

type FormState = {
	optionsState: ModelAccessOptionsResponse | null;
	selectedOptionId: string;
	selectedModel: string;
	isLoading: boolean;
	isSwitching: boolean;
	message: { type: "error" | "success"; text: string } | null;
};

type FormAction =
	| { type: "fetchStarted" }
	| { type: "fetchSucceeded"; data: ModelAccessOptionsResponse }
	| { type: "fetchFailed"; error: string }
	| { type: "optionSelected"; optionId: string; model: string }
	| { type: "modelChanged"; model: string }
	| { type: "switchStarted" }
	| { type: "switchSucceeded" }
	| { type: "switchFailed"; error: string }
	| { type: "messageCleared" };

function formReducer(state: FormState, action: FormAction): FormState {
	switch (action.type) {
		case "fetchStarted":
			return { ...state, isLoading: true, message: null };
		case "fetchSucceeded": {
			const { data } = action;
			return {
				...state,
				isLoading: false,
				optionsState: data,
				selectedOptionId: state.selectedOptionId || data.activeOptionId || "",
				selectedModel:
					state.selectedModel ||
					data.options?.find((o) => o.optionId === data.activeOptionId)
						?.model ||
					"",
			};
		}
		case "fetchFailed":
			return {
				...state,
				isLoading: false,
				message: { type: "error", text: action.error },
			};
		case "optionSelected":
			return {
				...state,
				selectedOptionId: action.optionId,
				selectedModel: action.model,
				message: null,
			};
		case "modelChanged":
			return { ...state, selectedModel: action.model, message: null };
		case "switchStarted":
			return { ...state, isSwitching: true, message: null };
		case "switchSucceeded":
			return {
				...state,
				isSwitching: false,
				message: {
					type: "success",
					text: "Model access switched successfully.",
				},
			};
		case "switchFailed":
			return {
				...state,
				isSwitching: false,
				message: { type: "error", text: action.error },
			};
		case "messageCleared":
			return { ...state, message: null };
		default:
			return state;
	}
}

const initialState: FormState = {
	optionsState: null,
	selectedOptionId: "",
	selectedModel: "",
	isLoading: false,
	isSwitching: false,
	message: null,
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

	const modelsForSelected = selectedOption
		? selectedOption.allowsCustomModel
			? null
			: selectedOption.fixedModels
		: null;

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

			{selectedOption && modelsForSelected ? (
				<div>
					<label
						htmlFor="model-access-model"
						className="mb-1.5 block text-sm font-medium text-[var(--sea-ink)]"
					>
						Model
					</label>
					<select
						id="model-access-model"
						className={selectClassName}
						value={selectedModel}
						onChange={(e) => {
							onModelChange(e.target.value);
						}}
					>
						<option value="">— Select —</option>
						{modelsForSelected.map((m) => (
							<option key={m} value={m}>
								{m}
							</option>
						))}
					</select>
				</div>
			) : null}

			{selectedOption?.allowsCustomModel ? (
				<div>
					<label
						htmlFor="model-access-custom-model"
						className="mb-1.5 block text-sm font-medium text-[var(--sea-ink)]"
					>
						Model
					</label>
					<input
						id="model-access-custom-model"
						type="text"
						className={selectClassName}
						placeholder="Enter model name (e.g. gpt-4o)"
						value={selectedModel}
						onChange={(e) => {
							onModelChange(e.target.value);
						}}
					/>
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
}: TelegramModelAccessSectionProps) {
	const [state, dispatch] = useReducer(formReducer, initialState);

	const fetchOptions = useCallback(async () => {
		dispatch({ type: "fetchStarted" });
		try {
			const res = await fetch("/api/telegram/model-access-options");
			const data = (await res.json()) as ModelAccessOptionsResponse & {
				error?: string;
			};
			if (!res.ok) {
				dispatch({
					type: "fetchFailed",
					error: data.error ?? "Failed to load options",
				});
				return;
			}
			dispatch({ type: "fetchSucceeded", data });
		} catch {
			dispatch({ type: "fetchFailed", error: "Network error loading options" });
		}
	}, []);

	// Fetch options on mount when deployed. isDeployed is set by the parent
	// based on external server state (not a user event), so this is a
	// mount-time data fetch — the same pattern used by telegram-pairing-section.
	useMountEffect(() => {
		if (!isDeployed) {
			return;
		}
		void fetchOptions();
	});

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
	} = state;

	const activeOption = optionsState?.options?.find(
		(o) => o.optionId === optionsState?.activeOptionId,
	);

	async function handleSwitch() {
		if (!selectedOptionId || !selectedModel) {
			return;
		}

		dispatch({ type: "switchStarted" });

		try {
			const res = await fetch("/api/telegram/model-switch", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					optionId: selectedOptionId,
					model: selectedModel,
				}),
			});
			const data = (await res.json()) as {
				error?: string;
				status?: string;
			};

			if (!res.ok) {
				dispatch({
					type: "switchFailed",
					error: data.error ?? "Switch failed",
				});
				return;
			}

			dispatch({ type: "switchSucceeded" });
			void fetchOptions();
		} catch {
			dispatch({ type: "switchFailed", error: "Network error during switch" });
		}
	}

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
