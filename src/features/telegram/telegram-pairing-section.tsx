import {
	CheckCircle2,
	LoaderCircle,
	RefreshCw,
	UserCheck,
	XCircle,
} from "lucide-react";
import { useReducer } from "react";

import { AlertPanel } from "#/components/ui/alert-panel";
import { Button } from "#/components/ui/button";
import { inputClassName } from "#/components/ui/input-class";
import { useMountEffect } from "#/lib/use-mount-effect";
import {
	initialTelegramPairingState,
	telegramPairingReducer,
} from "./telegram-pairing-state";

type TelegramPairingSectionProps = {
	isDeployed: boolean;
};

const PAIRING_REFRESH_INTERVAL_MS = 10_000;

export function TelegramPairingSection({
	isDeployed,
}: TelegramPairingSectionProps) {
	const [state, dispatch] = useReducer(
		telegramPairingReducer,
		initialTelegramPairingState,
	);

	async function loadPairings({ quiet = false }: { quiet?: boolean } = {}) {
		if (!isDeployed) {
			return;
		}

		if (!quiet) {
			dispatch({ type: "load_started" });
		}

		try {
			const response = await fetch("/api/telegram/pairings");
			const payload = (await response.json().catch(() => null)) as {
				error?: string;
				pairings?: typeof state.pairings;
			} | null;

			if (!response.ok || !payload?.pairings) {
				if (!quiet) {
					dispatch({
						type: "load_failed",
						error: payload?.error ?? "Unable to load pairings",
					});
				}
				return;
			}

			dispatch({ type: "load_succeeded", pairings: payload.pairings });
		} finally {
			if (!quiet) {
				dispatch({ type: "load_finished" });
			}
		}
	}

	async function handleApprovePairing(selectedCode?: string) {
		const code = (selectedCode ?? state.pairingCode).trim().toUpperCase();
		if (!code) {
			dispatch({
				type: "approve_failed",
				error: "Pairing code is required.",
			});
			return;
		}

		dispatch({ type: "approve_started" });

		try {
			const response = await fetch("/api/telegram/pairings/approve", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ code }),
			});

			const payload = (await response.json().catch(() => null)) as {
				error?: string;
				approved?: { userId: string; userName: string };
			} | null;

			if (!response.ok || !payload?.approved) {
				dispatch({
					type: "approve_failed",
					error: payload?.error ?? "Unable to approve pairing",
				});
				return;
			}

			const displayName = payload.approved.userName || payload.approved.userId;
			dispatch({ type: "approve_succeeded", displayName });
			void loadPairings({ quiet: true });
		} finally {
			dispatch({ type: "approve_finished" });
		}
	}

	useMountEffect(() => {
		if (!isDeployed) {
			return;
		}

		void loadPairings();
		const intervalId = window.setInterval(() => {
			void loadPairings({ quiet: true });
		}, PAIRING_REFRESH_INTERVAL_MS);

		return () => {
			window.clearInterval(intervalId);
		};
	});

	return (
		<section className="island-shell rounded-[2rem] p-6 sm:p-8">
			<div className="mb-6 flex flex-col gap-3">
				<p className="island-kicker m-0">Pair Telegram users</p>
				<h3 className="m-0 text-2xl font-semibold text-[var(--sea-ink)]">
					Approve a chat request
				</h3>
				<p className="m-0 max-w-2xl text-sm text-[var(--sea-ink-soft)] sm:text-base">
					When Hermes sends a pairing code in Telegram, approve it here. This
					panel tracks authorization requests, not live chat messages.
				</p>
			</div>

			{!isDeployed ? (
				<AlertPanel
					tone="warning"
					LeadingIcon={XCircle}
					leadingIconClassName="h-5 w-5 text-[var(--alert-warning-fg)]"
				>
					Deploy Hermes before managing pairings.
				</AlertPanel>
			) : (
				<>
					<div className="space-y-2">
						<label
							className="block text-sm font-semibold text-[var(--sea-ink)]"
							htmlFor="pairingCode"
						>
							Pairing code
						</label>
						<div className="flex gap-2">
							<input
								id="pairingCode"
								type="text"
								value={state.pairingCode}
								onChange={(event) =>
									dispatch({
										type: "set_pairing_code",
										code: event.currentTarget.value.toUpperCase(),
									})
								}
								onKeyDown={(event) => {
									if (event.key === "Enter" && !state.isApprovingPairing) {
										void handleApprovePairing();
									}
								}}
								className={inputClassName}
								placeholder="RGTS8S2R"
								disabled={state.isApprovingPairing}
								maxLength={8}
							/>
							<Button
								type="button"
								onClick={() => void handleApprovePairing()}
								disabled={state.isApprovingPairing || !state.pairingCode.trim()}
							>
								{state.isApprovingPairing ? (
									<LoaderCircle className="h-4 w-4 animate-spin" />
								) : (
									<UserCheck className="h-4 w-4" />
								)}
								<span>
									{state.isApprovingPairing ? "Approving..." : "Approve"}
								</span>
							</Button>
						</div>
					</div>

					<div className="mt-4 flex flex-wrap gap-3">
						<Button
							type="button"
							variant="secondary"
							onClick={() => void loadPairings()}
							disabled={state.isLoadingPairings}
						>
							{state.isLoadingPairings ? (
								<LoaderCircle className="h-4 w-4 animate-spin" />
							) : (
								<RefreshCw className="h-4 w-4" />
							)}
							<span>
								{state.isLoadingPairings ? "Refreshing..." : "Refresh"}
							</span>
						</Button>
						{state.lastLoadedAt ? (
							<span className="self-center text-xs text-[var(--sea-ink-soft)]">
								Updated {state.lastLoadedAt.toLocaleTimeString()}
							</span>
						) : null}
					</div>

					{state.successMessage ? (
						<AlertPanel
							tone="success"
							className="mt-4"
							LeadingIcon={CheckCircle2}
					leadingIconClassName="h-5 w-5 text-[var(--alert-success-fg)]"
						>
							{state.successMessage}
						</AlertPanel>
					) : null}

					{state.error ? (
						<AlertPanel tone="error" className="mt-4">
							{state.error}
						</AlertPanel>
					) : null}

					{state.pairings ? (
						<div className="mt-5 grid gap-3 sm:grid-cols-2">
							<div className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--surface-weak)] px-4 py-3">
								<div className="text-xs font-semibold text-[var(--sea-ink-soft)]">
									Pending requests
								</div>
								{state.pairings.pending.length > 0 ? (
									<ul className="mt-3 m-0 space-y-2 p-0 text-sm text-[var(--sea-ink)]">
										{state.pairings.pending.map((request) => (
											<li
												key={`${request.userId}-${request.code}`}
												className="flex list-none flex-col gap-2 rounded-2xl border border-[var(--line)] bg-[var(--chip-bg)] p-3 sm:flex-row sm:items-center sm:justify-between"
											>
												<div className="min-w-0">
													<div className="font-semibold">
														{request.userName || request.userId}
													</div>
													<div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--sea-ink-soft)]">
														<code className="rounded-full border border-[var(--line)] bg-[var(--surface-strong)] px-2 py-1 font-mono text-[var(--sea-ink)]">
															{request.code}
														</code>
														<span>{request.ageMinutes}m ago</span>
													</div>
												</div>
												<Button
													type="button"
													size="sm"
													onClick={() =>
														void handleApprovePairing(request.code)
													}
													disabled={state.isApprovingPairing}
													aria-label={`Approve ${request.code}`}
												>
													<UserCheck className="h-4 w-4" />
													<span>Approve</span>
												</Button>
											</li>
										))}
									</ul>
								) : (
									<p className="mt-3 mb-0 text-sm text-[var(--sea-ink-soft)]">
										No pending requests.
									</p>
								)}
							</div>

							<div className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--surface-weak)] px-4 py-3">
								<div className="text-xs font-semibold text-[var(--sea-ink-soft)]">
									Approved users
								</div>
								{state.pairings.approved.length > 0 ? (
									<ul className="mt-3 m-0 space-y-2 p-0 text-sm text-[var(--sea-ink)]">
										{state.pairings.approved.map((user) => (
											<li key={user.userId} className="list-none">
												{user.userName || user.userId}
											</li>
										))}
									</ul>
								) : (
									<p className="mt-3 mb-0 text-sm text-[var(--sea-ink-soft)]">
										No approved users yet.
									</p>
								)}
							</div>
						</div>
					) : null}
				</>
			)}
		</section>
	);
}
