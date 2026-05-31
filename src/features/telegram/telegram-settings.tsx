import {
	CheckCircle2,
	LoaderCircle,
	PlugZap,
	Rocket,
	Send,
	Unplug,
	XCircle,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export type TelegramSettingsSummary = {
	botUsername: string;
	botTokenLast4: string | null;
	isActive: boolean;
	deployedServerHost: string | null;
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

	// Deploy state
	const [isDeploying, setIsDeploying] = useState(false);
	const [deployError, setDeployError] = useState<string | null>(null);
	const [deploySuccess, setDeploySuccess] = useState<string | null>(null);

	// Test state
	const [testMessage, setTestMessage] = useState("");
	const [isTesting, setIsTesting] = useState(false);
	const [testResponse, setTestResponse] = useState<string | null>(null);
	const [testError, setTestError] = useState<string | null>(null);

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

			// Preserve the existing deployed host so a re-connect doesn't clear
			// the deploy status that was set by a prior deploy.
			setSavedConfig({
				...payload.telegram,
				deployedServerHost:
					payload.telegram.deployedServerHost ??
					savedConfig?.deployedServerHost ??
					null,
			});
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
			setTestResponse(null);
			setTestError(null);
			setSuccessMessage("Telegram bot disconnected");
		} finally {
			setIsDisconnecting(false);
		}
	}

	async function handleDeploy() {
		setIsDeploying(true);
		setDeployError(null);
		setDeploySuccess(null);

		try {
			const response = await fetch("/api/telegram/deploy", {
				method: "POST",
			});

			const payload = (await response.json().catch(() => null)) as {
				error?: string;
				status?: string;
				serverHost?: string;
			} | null;

			if (!response.ok) {
				setDeployError(payload?.error ?? "Deploy failed");
				return;
			}

			const serverHost = payload?.serverHost ?? null;
			// Update savedConfig so isDeployed / deployedHost derive from a single
			// source of truth rather than a separate currentDeployStatus atom.
			setSavedConfig((prev) =>
				prev ? { ...prev, deployedServerHost: serverHost } : prev,
			);
			setDeploySuccess(
				`Bot token deployed to ${serverHost ?? "server"}. Hermes is restarting...`,
			);
		} finally {
			setIsDeploying(false);
		}
	}

	async function handleTest() {
		if (!testMessage.trim()) {
			return;
		}

		setIsTesting(true);
		setTestResponse(null);
		setTestError(null);

		try {
			const response = await fetch("/api/telegram/test", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ message: testMessage }),
			});

			const payload = (await response.json().catch(() => null)) as {
				error?: string;
				response?: string;
			} | null;

			if (!response.ok) {
				setTestError(payload?.error ?? "Test failed");
				return;
			}

			setTestResponse(payload?.response ?? "(empty response)");
		} finally {
			setIsTesting(false);
		}
	}

	const isDeployed = Boolean(savedConfig?.deployedServerHost);
	const deployedHost = savedConfig?.deployedServerHost ?? null;

	return (
		<section className="space-y-6">
			<div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
				<div className="space-y-6">
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

					{savedConfig ? (
						<>
							<section className="island-shell rounded-[2rem] p-6 sm:p-8">
								<div className="mb-6 flex flex-col gap-3">
									<p className="island-kicker m-0">Deploy to server</p>
									<h3 className="m-0 text-2xl font-semibold text-[var(--sea-ink)]">
										Push the bot token to Hermes
									</h3>
									<p className="m-0 max-w-2xl text-sm text-[var(--sea-ink-soft)] sm:text-base">
										Deploy the Telegram bot token to your Hermes server so it
										can send and receive messages through Telegram.
									</p>
								</div>

								{isDeployed && deployedHost ? (
									<div className="rounded-[1.5rem] border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-[var(--sea-ink)]">
										<div className="flex items-center gap-3">
											<CheckCircle2 className="h-5 w-5 text-emerald-600" />
											<span>
												Deployed to <strong>{deployedHost}</strong>
											</span>
										</div>
									</div>
								) : null}

								{deploySuccess ? (
									<div className="mt-3 rounded-[1.5rem] border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-[var(--sea-ink)]">
										<div className="flex items-center gap-3">
											<CheckCircle2 className="h-5 w-5 text-emerald-600" />
											<span>{deploySuccess}</span>
										</div>
									</div>
								) : null}

								{deployError ? (
									<div className="mt-3 rounded-[1.5rem] border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-[var(--sea-ink)]">
										{deployError}
									</div>
								) : null}

								<div className="mt-6 flex flex-wrap gap-3 border-t border-[var(--line)] pt-6">
									<Button
										type="button"
										onClick={() => void handleDeploy()}
										disabled={isDeploying}
									>
										{isDeploying ? (
											<LoaderCircle className="h-4 w-4 animate-spin" />
										) : (
											<Rocket className="h-4 w-4" />
										)}
										<span>
											{isDeploying
												? "Deploying..."
												: isDeployed
													? "Redeploy"
													: "Deploy to VPS"}
										</span>
									</Button>
								</div>
							</section>

							<section className="island-shell rounded-[2rem] p-6 sm:p-8">
								<div className="mb-6 flex flex-col gap-3">
									<p className="island-kicker m-0">Test your bot</p>
									<h3 className="m-0 text-2xl font-semibold text-[var(--sea-ink)]">
										Try a test conversation
									</h3>
									<p className="m-0 max-w-2xl text-sm text-[var(--sea-ink-soft)] sm:text-base">
										Send a message to Hermes through the API server on your VPS
										and see the response.
									</p>
								</div>

								{!isDeployed ? (
									<div className="rounded-[1.5rem] border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-[var(--sea-ink)]">
										<div className="flex items-center gap-3">
											<XCircle className="h-5 w-5 text-amber-600" />
											<span>
												Deploy the bot token to a server first before testing.
											</span>
										</div>
									</div>
								) : (
									<>
										<div className="space-y-2">
											<label
												className="block text-sm font-semibold text-[var(--sea-ink)]"
												htmlFor="testMessage"
											>
												Message
											</label>
											<div className="flex gap-2">
												<input
													id="testMessage"
													type="text"
													value={testMessage}
													onChange={(event) =>
														setTestMessage(event.currentTarget.value)
													}
													onKeyDown={(event) => {
														if (event.key === "Enter" && !isTesting) {
															void handleTest();
														}
													}}
													className={inputClassName}
													placeholder="What can you do?"
													disabled={isTesting}
												/>
												<Button
													type="button"
													onClick={() => void handleTest()}
													disabled={isTesting || !testMessage.trim()}
												>
													{isTesting ? (
														<LoaderCircle className="h-4 w-4 animate-spin" />
													) : (
														<Send className="h-4 w-4" />
													)}
													<span>{isTesting ? "Sending..." : "Send"}</span>
												</Button>
											</div>
										</div>

										{isTesting ? (
											<div className="mt-4 rounded-[1.5rem] border border-[var(--line)] bg-[var(--surface-weak)] px-4 py-3 text-sm text-[var(--sea-ink-soft)]">
												Waiting for Hermes response...
											</div>
										) : null}

										{testResponse ? (
											<div className="mt-4 rounded-[1.5rem] border border-[var(--line)] bg-[var(--surface-weak)] px-4 py-3 text-sm text-[var(--sea-ink)]">
												<div className="mb-1 text-xs font-semibold text-[var(--sea-ink-soft)]">
													Hermes response
												</div>
												<div className="whitespace-pre-wrap">
													{testResponse}
												</div>
											</div>
										) : null}

										{testError ? (
											<div className="mt-4 rounded-[1.5rem] border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-[var(--sea-ink)]">
												{testError}
											</div>
										) : null}
									</>
								)}
							</section>
						</>
					) : null}
				</div>

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
						{isDeployed && deployedHost ? (
							<p className="mt-3 mb-0 text-sm text-[var(--sea-ink)]">
								<CheckCircle2 className="mr-1 inline h-3.5 w-3.5 text-emerald-600" />
								Deployed to {deployedHost}
							</p>
						) : null}
					</section>

					<section className="island-shell rounded-[2rem] p-6">
						<p className="island-kicker mb-2">Why this matters</p>
						<ul className="m-0 space-y-3 pl-5 text-sm text-[var(--sea-ink-soft)]">
							<li>Hermes uses your bot token to verify the bot is real.</li>
							<li>
								Deploy the token to your VPS so Hermes can send and receive
								messages through Telegram.
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
