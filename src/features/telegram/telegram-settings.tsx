import { CheckCircle2, LoaderCircle, PlugZap, Unplug } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export type TelegramSettingsSummary = {
	botUsername: string;
	botTokenLast4: string | null;
	isActive: boolean;
};

type TelegramSettingsProps = {
	initialConfig: TelegramSettingsSummary | null;
};

export function TelegramSettings({ initialConfig }: TelegramSettingsProps) {
	const [savedConfig, setSavedConfig] =
		useState<TelegramSettingsSummary | null>(initialConfig);
	const [botToken, setBotToken] = useState("");
	const [isConnecting, setIsConnecting] = useState(false);
	const [isDisconnecting, setIsDisconnecting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [successMessage, setSuccessMessage] = useState<string | null>(null);

	async function handleConnect() {
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

			setSavedConfig(payload.telegram);
			setBotToken("");
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

			setSavedConfig(null);
			setSuccessMessage("Telegram bot disconnected");
		} finally {
			setIsDisconnecting(false);
		}
	}

	return (
		<section className="space-y-6">
			<div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
				<section className="island-shell rounded-[2rem] p-6 sm:p-8">
					<div className="mb-8 flex flex-col gap-3">
						<p className="island-kicker m-0">Bot onboarding</p>
						<h3 className="m-0 text-2xl font-semibold text-[var(--sea-ink)]">
							Connect Telegram in two steps
						</h3>
						<p className="m-0 max-w-2xl text-sm text-[var(--sea-ink-soft)] sm:text-base">
							Create a bot in BotFather, paste the token here, and HermesHub
							will verify the bot before saving it.
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
							name="botToken"
							type="password"
							value={botToken}
							onChange={(event) => setBotToken(event.currentTarget.value)}
							className={inputClassName}
							placeholder={
								savedConfig?.botTokenLast4
									? `••••${savedConfig.botTokenLast4}`
									: "123456789:AA..."
							}
						/>
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
								<span>
									{isDisconnecting ? "Disconnecting..." : "Disconnect"}
								</span>
							</Button>
						) : null}
					</div>
				</section>

				<aside className="space-y-4">
					<section className="island-shell rounded-[2rem] p-6">
						<p className="island-kicker mb-2">Connected bot</p>
						<h3 className="m-0 text-xl font-semibold text-[var(--sea-ink)]">
							{savedConfig?.botUsername ?? "No Telegram bot connected"}
						</h3>
						<p className="mt-3 mb-0 text-sm text-[var(--sea-ink-soft)]">
							{savedConfig
								? `Status: ${savedConfig.isActive ? "Connected" : "Disconnected"}`
								: "Connect your Telegram bot to let Hermes reply in chat."}
						</p>
						{savedConfig?.botTokenLast4 ? (
							<p className="mt-3 mb-0 text-sm text-[var(--sea-ink)]">
								Stored token ending in {savedConfig.botTokenLast4}
							</p>
						) : null}
					</section>

					<section className="island-shell rounded-[2rem] p-6">
						<p className="island-kicker mb-2">Why this matters</p>
						<ul className="m-0 space-y-3 pl-5 text-sm text-[var(--sea-ink-soft)]">
							<li>Hermes uses your bot token to verify the bot is real.</li>
							<li>
								After connect, the dashboard can surface Telegram status cards.
							</li>
							<li>
								Disconnect keeps the saved history but disables the active bot.
							</li>
						</ul>
					</section>
				</aside>
			</div>
		</section>
	);
}

const inputClassName =
	"w-full rounded-full border border-[var(--chip-line)] bg-white/80 px-4 py-3 text-sm text-[var(--sea-ink)] outline-none focus:border-[color:var(--lagoon)] focus:ring-2 focus:ring-[rgba(79,184,178,0.18)]";
