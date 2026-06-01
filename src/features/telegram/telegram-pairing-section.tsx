import {
	CheckCircle2,
	LoaderCircle,
	RefreshCw,
	UserCheck,
	XCircle,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useMountEffect } from "@/lib/use-mount-effect";

import { inputClassName } from "./telegram-input-class";

type TelegramPairingSummary = {
	pending: Array<{
		code: string;
		userId: string;
		userName: string;
		ageMinutes: number;
	}>;
	approved: Array<{
		userId: string;
		userName: string;
		approvedAt: number | null;
	}>;
};

type TelegramPairingSectionProps = {
	isDeployed: boolean;
};

const PAIRING_REFRESH_INTERVAL_MS = 10_000;

export function TelegramPairingSection({
	isDeployed,
}: TelegramPairingSectionProps) {
	const [pairingCode, setPairingCode] = useState("");
	const [pairings, setPairings] = useState<TelegramPairingSummary | null>(null);
	const [isLoadingPairings, setIsLoadingPairings] = useState(false);
	const [isApprovingPairing, setIsApprovingPairing] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [successMessage, setSuccessMessage] = useState<string | null>(null);
	const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);

	async function loadPairings({ quiet = false }: { quiet?: boolean } = {}) {
		if (!isDeployed) {
			return;
		}

		if (!quiet) {
			setIsLoadingPairings(true);
			setError(null);
		}

		try {
			const response = await fetch("/api/telegram/pairings");
			const payload = (await response.json().catch(() => null)) as {
				error?: string;
				pairings?: TelegramPairingSummary;
			} | null;

			if (!response.ok || !payload?.pairings) {
				if (!quiet) {
					setError(payload?.error ?? "Unable to load pairings");
				}
				return;
			}

			setPairings(payload.pairings);
			setLastLoadedAt(new Date());
		} finally {
			if (!quiet) {
				setIsLoadingPairings(false);
			}
		}
	}

	async function handleApprovePairing(selectedCode?: string) {
		const code = (selectedCode ?? pairingCode).trim().toUpperCase();
		if (!code) {
			setError("Pairing code is required.");
			return;
		}

		setIsApprovingPairing(true);
		setError(null);
		setSuccessMessage(null);

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
				setError(payload?.error ?? "Unable to approve pairing");
				return;
			}

			const displayName = payload.approved.userName || payload.approved.userId;
			setPairingCode("");
			setSuccessMessage(`Approved ${displayName || "Telegram user"}.`);
			void loadPairings({ quiet: true });
		} finally {
			setIsApprovingPairing(false);
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
				<div className="rounded-[1.5rem] border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-[var(--sea-ink)]">
					<div className="flex items-center gap-3">
						<XCircle className="h-5 w-5 text-amber-600" />
						<span>Deploy Hermes before managing pairings.</span>
					</div>
				</div>
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
								value={pairingCode}
								onChange={(event) =>
									setPairingCode(event.currentTarget.value.toUpperCase())
								}
								onKeyDown={(event) => {
									if (event.key === "Enter" && !isApprovingPairing) {
										void handleApprovePairing();
									}
								}}
								className={inputClassName}
								placeholder="RGTS8S2R"
								disabled={isApprovingPairing}
								maxLength={8}
							/>
							<Button
								type="button"
								onClick={() => void handleApprovePairing()}
								disabled={isApprovingPairing || !pairingCode.trim()}
							>
								{isApprovingPairing ? (
									<LoaderCircle className="h-4 w-4 animate-spin" />
								) : (
									<UserCheck className="h-4 w-4" />
								)}
								<span>{isApprovingPairing ? "Approving..." : "Approve"}</span>
							</Button>
						</div>
					</div>

					<div className="mt-4 flex flex-wrap gap-3">
						<Button
							type="button"
							variant="secondary"
							onClick={() => void loadPairings()}
							disabled={isLoadingPairings}
						>
							{isLoadingPairings ? (
								<LoaderCircle className="h-4 w-4 animate-spin" />
							) : (
								<RefreshCw className="h-4 w-4" />
							)}
							<span>{isLoadingPairings ? "Refreshing..." : "Refresh"}</span>
						</Button>
						{lastLoadedAt ? (
							<span className="self-center text-xs text-[var(--sea-ink-soft)]">
								Updated {lastLoadedAt.toLocaleTimeString()}
							</span>
						) : null}
					</div>

					{successMessage ? (
						<div className="mt-4 rounded-[1.5rem] border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-[var(--sea-ink)]">
							<div className="flex items-center gap-3">
								<CheckCircle2 className="h-5 w-5 text-emerald-600" />
								<span>{successMessage}</span>
							</div>
						</div>
					) : null}

					{error ? (
						<div className="mt-4 rounded-[1.5rem] border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-[var(--sea-ink)]">
							{error}
						</div>
					) : null}

					{pairings ? (
						<div className="mt-5 grid gap-3 sm:grid-cols-2">
							<div className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--surface-weak)] px-4 py-3">
								<div className="text-xs font-semibold text-[var(--sea-ink-soft)]">
									Pending requests
								</div>
								{pairings.pending.length > 0 ? (
									<ul className="mt-3 m-0 space-y-2 p-0 text-sm text-[var(--sea-ink)]">
										{pairings.pending.map((request) => (
											<li
												key={`${request.userId}-${request.code}`}
												className="flex list-none flex-col gap-2 rounded-2xl border border-[var(--line)] bg-white/60 p-3 sm:flex-row sm:items-center sm:justify-between"
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
													disabled={isApprovingPairing}
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
								{pairings.approved.length > 0 ? (
									<ul className="mt-3 m-0 space-y-2 p-0 text-sm text-[var(--sea-ink)]">
										{pairings.approved.map((user) => (
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
