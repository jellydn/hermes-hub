import {
	AlertCircle,
	CheckCircle2,
	LoaderCircle,
	RotateCcw,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { StatusIcon } from "@/components/ui/status-icon";
import {
	formatInstallTimestamp,
	type InstallEvent,
	type InstallStatus,
	quantizeInstallProgress,
} from "@/features/servers/install-snapshot";
import { useInstallEventStream } from "@/features/servers/use-install-event-stream";
import { cn } from "@/lib/utils";

type ServerInstallProgressProps = {
	serverId: string;
	onGoToDashboard: () => void;
};

function getStatusIconType(
	status: InstallStatus,
): "success" | "error" | "info" | "neutral" {
	if (status === "succeeded") return "success";
	if (status === "failed") return "error";
	if (status === "running") return "info";
	return "neutral";
}

export function ServerInstallProgress({
	serverId,
	onGoToDashboard,
}: ServerInstallProgressProps) {
	const { connectionState, isRetrying, retryError, retryInstall, snapshot } =
		useInstallEventStream(serverId);

	const latestEvent = snapshot.events.at(-1) ?? null;
	const progressValue = quantizeInstallProgress(latestEvent?.progress ?? 0);
	const isFinished = isTerminalStatus(snapshot.status);
	const isRunning = !isFinished;
	const bannerTone = snapshot.status === "succeeded" ? "success" : "error";

	return (
		<section className="space-y-6">
			<div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
				<div className="island-shell rounded-[2rem] p-6 sm:p-8">
					<div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
						<div>
							<p className="island-kicker mb-2">Live install</p>
							<h3 className="m-0 text-2xl font-semibold text-[var(--sea-ink)]">
								{getInstallHeadline(snapshot.status)}
							</h3>
							<p className="mt-3 mb-0 max-w-2xl text-sm text-[var(--sea-ink-soft)] sm:text-base">
								Stay on this page for live updates, or leave and come back
								later. The latest install log is replayed when the stream
								reconnects.
							</p>
						</div>
						{isRunning ? (
							<div className="inline-flex items-center gap-2 rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] px-4 py-2 text-sm font-medium text-[var(--sea-ink)]">
								<LoaderCircle className="h-4 w-4 animate-spin" />
								<span>
									{latestEvent?.message ?? "Waiting for first install step..."}
								</span>
							</div>
						) : null}
					</div>

					{isFinished ? (
						<div
							className={cn(
								"mb-6 rounded-[1.5rem] border px-5 py-4 text-sm",
								bannerTone === "success"
									? "border-emerald-500/30 bg-emerald-500/10 text-[var(--sea-ink)]"
									: "border-red-500/30 bg-red-500/10 text-[var(--sea-ink)]",
							)}
						>
							<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
								<div className="flex items-start gap-3">
									{snapshot.status === "succeeded" ? (
										<CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" />
									) : (
										<AlertCircle className="mt-0.5 h-5 w-5 text-red-600" />
									)}
									<div>
										<p className="m-0 font-semibold">
											{snapshot.status === "succeeded"
												? "Hermes is ready on this VPS."
												: (snapshot.error ?? "Install failed.")}
										</p>
										<p className="mt-1 mb-0 text-[var(--sea-ink-soft)]">
											{snapshot.status === "succeeded"
												? "You can head back to the dashboard while future stories fill in agent health and controls."
												: "Review the last log entries, then retry the install when the server issue is fixed."}
										</p>
									</div>
								</div>

								<div className="flex flex-wrap gap-3">
									{snapshot.status === "succeeded" ? (
										<Button type="button" onClick={onGoToDashboard}>
											Go to Dashboard
										</Button>
									) : (
										<Button
											type="button"
											onClick={() => {
												void retryInstall();
											}}
											disabled={isRetrying}
										>
											<RotateCcw className="h-4 w-4" />
											<span>
												{isRetrying ? "Retrying..." : "Retry Install"}
											</span>
										</Button>
									)}
								</div>
							</div>
						</div>
					) : null}

					<div className="space-y-3">
						<div className="flex items-center justify-between text-sm text-[var(--sea-ink-soft)]">
							<span>{formatStepLabel(latestEvent?.step)}</span>
							<span>{progressValue}%</span>
						</div>
						<div className="h-3 overflow-hidden rounded-full bg-[var(--chip-bg)]">
							<div
								className="h-full rounded-full bg-[linear-gradient(90deg,var(--lagoon),var(--lagoon-deep))] transition-all duration-300"
								style={{ width: `${progressValue}%` }}
							/>
						</div>
					</div>

					{connectionState === "reconnecting" && isRunning ? (
						<div className="mt-4 rounded-[1.5rem] border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-[var(--sea-ink)]">
							The live stream dropped. HermesHub is reconnecting and will replay
							persisted install events when the connection returns.
						</div>
					) : null}

					{retryError ? (
						<div className="mt-4 rounded-[1.5rem] border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-[var(--sea-ink)]">
							{retryError}
						</div>
					) : null}
				</div>

				<aside className="island-shell rounded-[2rem] p-6">
					<p className="island-kicker mb-2">Install state</p>
					<dl className="space-y-4 text-sm text-[var(--sea-ink)]">
						<div>
							<dt className="text-[var(--sea-ink-soft)]">Server ID</dt>
							<dd className="mt-1 font-medium">{serverId}</dd>
						</div>
						<div>
							<dt className="text-[var(--sea-ink-soft)]">Current status</dt>
							<dd className="mt-1 font-medium capitalize flex items-center gap-2">
								<StatusIcon
									status={getStatusIconType(snapshot.status)}
									size={3.5}
								/>
								{snapshot.status}
							</dd>
						</div>
						<div>
							<dt className="text-[var(--sea-ink-soft)]">Last update</dt>
							<dd className="mt-1 font-medium">
								{latestEvent
									? formatInstallTimestamp(latestEvent.timestamp)
									: "Waiting"}
							</dd>
						</div>
					</dl>
				</aside>
			</div>

			<section className="island-shell rounded-[2rem] p-6 sm:p-8">
				<div className="mb-5 flex items-center justify-between gap-4">
					<div>
						<p className="island-kicker mb-2">Live logs</p>
						<h3 className="m-0 text-xl font-semibold text-[var(--sea-ink)]">
							Install output
						</h3>
					</div>
					{isRunning ? (
						<div className="inline-flex items-center gap-2 text-sm text-[var(--sea-ink-soft)]">
							<LoaderCircle className="h-4 w-4 animate-spin" />
							<span>Streaming</span>
						</div>
					) : null}
				</div>

				<div className="max-h-[28rem] overflow-auto rounded-[1.5rem] border border-[var(--chip-line)] bg-[rgba(7,18,17,0.94)] p-4 font-mono text-sm text-[rgba(235,255,252,0.9)]">
					{snapshot.events.length === 0 ? (
						<p className="m-0 text-[rgba(235,255,252,0.72)]">
							No logs yet. HermesHub will start streaming as soon as the install
							worker emits its first update.
						</p>
					) : (
						<ul className="m-0 space-y-3 p-0">
							{snapshot.events.map((event) => (
								<li key={getInstallEventKey(event)} className="list-none">
									<div className="flex flex-wrap items-center gap-2 text-[rgba(235,255,252,0.72)]">
										<span>{formatInstallTimestamp(event.timestamp)}</span>
										<span className="rounded-full bg-white/10 px-2 py-0.5 text-xs uppercase tracking-[0.2em]">
											{formatStepLabel(event.step)}
										</span>
									</div>
									<p className="mt-2 mb-0 leading-6">
										{formatLogMessage(event)}
									</p>
								</li>
							))}
						</ul>
					)}
				</div>
			</section>
		</section>
	);
}

function getInstallEventKey(event: InstallEvent) {
	return [event.installId, event.timestamp, event.step, event.message].join(
		":",
	);
}

function getInstallHeadline(status: InstallStatus) {
	if (status === "succeeded") {
		return "Install complete";
	}

	if (status === "failed") {
		return "Install interrupted";
	}

	return "Installing Hermes on your VPS";
}

function formatStepLabel(step?: string) {
	if (!step) {
		return "Preparing install";
	}

	return step
		.replace(/-/g, " ")
		.replace(/\b\w/g, (match) => match.toUpperCase());
}

function formatLogMessage(event: InstallEvent) {
	return event.error ? `${event.message}: ${event.error}` : event.message;
}

function isTerminalStatus(status: InstallStatus) {
	return status === "succeeded" || status === "failed";
}
