import {
	ArrowRight,
	CheckCircle2,
	ExternalLink,
	LoaderCircle,
	RefreshCw,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { AlertPanel } from "#/components/ui/alert-panel";
import { Button } from "#/components/ui/button";
import type { ModelAccessOption as ModelAccessOptionType } from "#shared/contracts/telegram-model-access";

type TelegramModelAccessSectionProps = {
	isDeployed: boolean;
};

type OptionsState = {
	options: ModelAccessOptionType[];
	activeOptionId: string | null;
};

export function TelegramModelAccessSection({
	isDeployed,
}: TelegramModelAccessSectionProps) {
	const [optionsState, setOptionsState] = useState<OptionsState | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [selectedOptionId, setSelectedOptionId] = useState<string>("");
	const [selectedModel, setSelectedModel] = useState<string>("");
	const [isSwitching, setIsSwitching] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [successMsg, setSuccessMsg] = useState<string | null>(null);

	const fetchOptions = useCallback(async () => {
		setIsLoading(true);
		setError(null);
		try {
			const res = await fetch("/api/telegram/model-access-options");
			const data = (await res.json()) as OptionsState & { error?: string };
			if (!res.ok) {
				setError(data.error ?? "Failed to load options");
				return;
			}
			setOptionsState(data);
			// react-doctor-disable-next-line react-doctor/no-derived-state
			setSelectedOptionId((prev) => prev || data.activeOptionId || "");
			// react-doctor-disable-next-line react-doctor/no-derived-state
			setSelectedModel((prev) => {
				if (prev) return prev;
				return (
					data.options?.find((o) => o.optionId === data.activeOptionId)
						?.model ?? ""
				);
			});
		} catch {
			setError("Network error loading options");
		} finally {
			setIsLoading(false);
		}
	}, []);

	// react-doctor-disable-next-line react-doctor/no-event-handler
	useEffect(() => {
		if (isDeployed) {
			void fetchOptions();
		}
	}, [isDeployed, fetchOptions]);

	if (!isDeployed) {
		return null;
	}

	const selectedOption = optionsState?.options?.find(
		(o) => o.optionId === selectedOptionId,
	);

	const activeOption = optionsState?.options?.find(
		(o) => o.optionId === optionsState?.activeOptionId,
	);

	async function handleSwitch() {
		if (!selectedOptionId || !selectedModel) {
			return;
		}

		setIsSwitching(true);
		setError(null);
		setSuccessMsg(null);

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
				setError(data.error ?? "Switch failed");
				return;
			}

			setSuccessMsg("Model access switched successfully.");
			// Refresh options to show updated active state
			void fetchOptions();
		} catch {
			setError("Network error during switch");
		} finally {
			setIsSwitching(false);
		}
	}

	const modelsForSelected = selectedOption
		? selectedOption.allowsCustomModel
			? null
			: selectedOption.fixedModels
		: null;

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

			{successMsg ? (
				<AlertPanel
					tone="success"
					className="mt-3"
					LeadingIcon={CheckCircle2}
					leadingIconClassName="h-5 w-5 text-[var(--alert-success-fg)]"
				>
					{successMsg}
				</AlertPanel>
			) : null}

			{error ? (
				<AlertPanel tone="error" className="mt-3">
					{error}
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
				<div className="mt-4 space-y-4">
					{/* Option selector */}
					<div>
						<label
							htmlFor="model-access-option"
							className="mb-1.5 block text-sm font-medium text-[var(--sea-ink)]"
						>
							Provider / Subscription
						</label>
						<select
							id="model-access-option"
							className="block w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--sea-ink)] outline-none ring-[var(--focus-ring)] transition-shadow focus:ring-2"
							value={selectedOptionId}
							onChange={(e) => {
								setSelectedOptionId(e.target.value);
								setSelectedModel("");
								setError(null);
								setSuccessMsg(null);
								const opt = optionsState?.options.find(
									(o) => o.optionId === e.target.value,
								);
								if (opt) {
									setSelectedModel(opt.model);
								}
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
								{selectedOption.baseUrl
									? ` · URL: ${selectedOption.baseUrl}`
									: ""}
							</p>
						) : null}
					</div>

					{/* Model selector */}
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
								className="block w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--sea-ink)] outline-none ring-[var(--focus-ring)] transition-shadow focus:ring-2"
								value={selectedModel}
								onChange={(e) => {
									setSelectedModel(e.target.value);
									setError(null);
									setSuccessMsg(null);
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

					{/* Custom model input */}
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
								className="block w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--sea-ink)] outline-none ring-[var(--focus-ring)] transition-shadow focus:ring-2"
								placeholder="Enter model name (e.g. gpt-4o)"
								value={selectedModel}
								onChange={(e) => {
									setSelectedModel(e.target.value);
									setError(null);
									setSuccessMsg(null);
								}}
							/>
						</div>
					) : null}

					{/* Switch button */}
					<div className="flex flex-wrap gap-3 border-t border-[var(--line)] pt-6">
						<Button
							type="button"
							disabled={isSwitching || !selectedOptionId || !selectedModel}
							onClick={() => void handleSwitch()}
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
							onClick={() => void fetchOptions()}
						>
							<RefreshCw
								className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
							/>
							<span>Refresh</span>
						</Button>
					</div>
				</div>
			)}
		</section>
	);
}
