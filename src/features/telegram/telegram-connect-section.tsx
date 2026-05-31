import { CheckCircle2, LoaderCircle, PlugZap, Unplug } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { inputClassName } from "./telegram-input-class";
import type { TelegramSettingsSummary } from "./telegram-settings";

type TelegramConnectSectionProps = {
	savedConfig: TelegramSettingsSummary | null;
	onConfigChange: (config: TelegramSettingsSummary) => void;
	onDisconnect: () => void;
};

export function TelegramConnectSection({
	savedConfig,
	onConfigChange,
	onDisconnect,
}: TelegramConnectSectionProps) {
	const {
		register,
		watch,
		setValue,
		setError: setFormError,
		clearErrors,
		formState: { errors: formErrors },
	} = useForm<{ botToken: string }>({
		defaultValues: { botToken: "" },
	});

	const botToken = watch("botToken");
	const [isConnecting, setIsConnecting] = useState(false);
	const [isDisconnecting, setIsDisconnecting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [successMessage, setSuccessMessage] = useState<string | null>(null);

	async function handleConnect() {
		if (!botToken.trim()) {
			setFormError("botToken", {
				type: "manual",
				message: "Telegram bot token is required.",
			});
			return;
		}
		clearErrors("botToken");

		setIsConnecting(true);
		setError(null);
		setSuccessMessage(null);

		try {
			const response = await fetch("/api/telegram/connect", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ botToken }),
			});

			const payload = (await response.json().catch(() => null)) as {
				error?: string;
				telegram?: TelegramSettingsSummary;
			} | null;

			if (!response.ok || !payload?.telegram) {
				setError(payload?.error ?? "Connection failed");
				return;
			}

			onConfigChange(payload.telegram);
			setValue("botToken", "");
			setSuccessMessage("Telegram bot connected");
		} finally {
			setIsConnecting(false);
		}
	}

	async function handleDisconnect() {
		setIsDisconnecting(true);
		setError(null);
		setSuccessMessage(null);

		try {
			const response = await fetch("/api/telegram/disconnect", {
				method: "POST",
			});

			const payload = (await response.json().catch(() => null)) as {
				error?: string;
			} | null;

			if (!response.ok) {
				setError(payload?.error ?? "Unable to disconnect Telegram");
				return;
			}

			onDisconnect();
			setSuccessMessage("Telegram bot disconnected");
		} finally {
			setIsDisconnecting(false);
		}
	}

	return (
		<section className="island-shell rounded-[2rem] p-6 sm:p-8">
			<div className="mb-8 flex flex-col gap-3">
				<p className="island-kicker m-0">Bot onboarding</p>
				<h3 className="m-0 text-2xl font-semibold text-[var(--sea-ink)]">
					Connect Telegram in two steps
				</h3>
				<p className="m-0 max-w-2xl text-sm text-[var(--sea-ink-soft)] sm:text-base">
					Create a bot in BotFather, paste the token here, and HermesHub will
					verify the bot before saving it.
				</p>
			</div>

			<ol className="m-0 space-y-4 pl-5 text-sm text-[var(--sea-ink-soft)]">
				<li>Open Telegram and start a chat with BotFather.</li>
				<li>
					Run <code>/newbot</code>, choose a name, and copy the bot token.
				</li>
			</ol>

			<div className="mt-8 space-y-2">
				<label
					className="block text-sm font-semibold text-[var(--sea-ink)]"
					htmlFor="botToken"
				>
					Bot token
				</label>
				<input
					id="botToken"
					type="password"
					{...register("botToken")}
					onChange={(event) => {
						void register("botToken").onChange(event);
						clearErrors("botToken");
					}}
					className={inputClassName}
					placeholder={
						savedConfig?.botTokenLast4
							? `••••${savedConfig.botTokenLast4}`
							: "123456789:AA..."
					}
				/>
				{formErrors.botToken ? (
					<p className="mt-1 text-xs text-red-500">
						{formErrors.botToken.message}
					</p>
				) : null}
				<p className="block min-h-5 text-xs text-[var(--sea-ink-soft)]">
					{savedConfig?.botTokenLast4
						? `Stored token ending in ${savedConfig.botTokenLast4}. Paste a new one to replace it.`
						: "Telegram bot token from BotFather. HermesHub validates it with Telegram before saving."}
				</p>
			</div>

			{successMessage ? (
				<div className="mt-6 rounded-[1.5rem] border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-[var(--sea-ink)]">
					<div className="flex items-center gap-3">
						<CheckCircle2 className="h-5 w-5 text-emerald-600" />
						<span>{successMessage}</span>
					</div>
				</div>
			) : null}

			{error ? (
				<div className="mt-6 rounded-[1.5rem] border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-[var(--sea-ink)]">
					{error}
				</div>
			) : null}

			<div className="mt-8 flex flex-wrap gap-3 border-t border-[var(--line)] pt-6">
				<Button
					type="button"
					onClick={() => void handleConnect()}
					disabled={isConnecting}
				>
					{isConnecting ? (
						<LoaderCircle className="h-4 w-4 animate-spin" />
					) : (
						<PlugZap className="h-4 w-4" />
					)}
					<span>{isConnecting ? "Connecting..." : "Connect"}</span>
				</Button>
				{savedConfig ? (
					<Button
						type="button"
						variant="secondary"
						onClick={() => void handleDisconnect()}
						disabled={isDisconnecting}
					>
						{isDisconnecting ? (
							<LoaderCircle className="h-4 w-4 animate-spin" />
						) : (
							<Unplug className="h-4 w-4" />
						)}
						<span>{isDisconnecting ? "Disconnecting..." : "Disconnect"}</span>
					</Button>
				) : null}
			</div>
		</section>
	);
}
