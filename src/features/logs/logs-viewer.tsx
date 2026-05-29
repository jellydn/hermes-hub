import { AlertCircle, CheckCircle2, LoaderCircle, Trash2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { ActionLogEntry, InstallLogEntry, LogsSnapshot } from "@/lib/logs";

type LogsViewerProps = {
	initialLogs: LogsSnapshot;
};

type ActionState = {
	isClearing: boolean;
	error: string | null;
	showConfirmation: boolean;
	logs: LogsSnapshot;
};

export function LogsViewer({ initialLogs }: LogsViewerProps) {
	const [state, setState] = useState<ActionState>({
		isClearing: false,
		error: null,
		showConfirmation: false,
		logs: initialLogs,
	});

	const hasLogs =
		state.logs.installLogs.length > 0 || state.logs.actionLogs.length > 0;

	async function handleClear() {
		setState((current) => ({
			...current,
			isClearing: true,
			error: null,
		}));

		try {
			const response = await fetch("/api/logs/clear", {
				method: "POST",
				headers: { accept: "application/json" },
			});
			const payload = (await response.json().catch(() => null)) as {
				error?: string;
			} | null;

			if (!response.ok) {
				throw new Error(payload?.error ?? "Unable to clear logs.");
			}

			setState({
				isClearing: false,
				error: null,
				showConfirmation: false,
				logs: { installLogs: [], actionLogs: [] },
			});
		} catch (error) {
			setState((current) => ({
				...current,
				isClearing: false,
				showConfirmation: false,
				error: error instanceof Error ? error.message : "Unable to clear logs.",
			}));
		}
	}

	return (
		<section className="space-y-6">
			<section className="island-shell rounded-[2rem] p-6 sm:p-8">
				<div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
					<div>
						<p className="island-kicker mb-2">History viewer</p>
						<h3 className="m-0 text-2xl font-semibold text-[var(--sea-ink)]">
							Install and action history
						</h3>
						<p className="mt-3 mb-0 max-w-2xl text-sm text-[var(--sea-ink-soft)] sm:text-base">
							Review install output, inspect restart/update/rollback results,
							and select text to copy when you need to share it.
						</p>
					</div>
					<div className="flex flex-wrap gap-3">
						<Button
							type="button"
							variant="secondary"
							onClick={() => {
								setState((current) => ({
									...current,
									showConfirmation: true,
									error: null,
								}));
							}}
							disabled={!hasLogs || state.isClearing}
						>
							{state.isClearing ? (
								<LoaderCircle className="h-4 w-4 animate-spin" />
							) : (
								<Trash2 className="h-4 w-4" />
							)}
							<span>Clear logs</span>
						</Button>
					</div>
				</div>

				{state.error ? <Banner kind="error" message={state.error} /> : null}

				{state.showConfirmation ? (
					<div className="mt-5 rounded-[1.5rem] border border-amber-500/30 bg-amber-500/10 px-4 py-4 text-sm text-[var(--sea-ink)]">
						<p className="m-0 font-semibold">Clear displayed logs?</p>
						<p className="mt-2 mb-0 text-[var(--sea-ink-soft)]">
							This removes the persisted install log text and action history
							shown on this page.
						</p>
						<div className="mt-4 flex flex-wrap gap-3">
							<Button
								type="button"
								size="sm"
								onClick={() => void handleClear()}
							>
								Confirm clear
							</Button>
							<Button
								type="button"
								size="sm"
								variant="secondary"
								onClick={() => {
									setState((current) => ({
										...current,
										showConfirmation: false,
									}));
								}}
							>
								Cancel
							</Button>
						</div>
					</div>
				) : null}
			</section>

			{hasLogs ? (
				<section className="grid gap-4 xl:grid-cols-2">
					<LogPanel
						title="Install log"
						lines={flattenInstallLogLines(state.logs.installLogs)}
						emptyMessage="No install logs yet."
					/>
					<LogPanel
						title="Action history"
						lines={flattenActionLogLines(state.logs.actionLogs)}
						emptyMessage="No actions yet."
					/>
				</section>
			) : (
				<section className="island-shell rounded-[2rem] p-6 sm:p-8">
					<p className="island-kicker mb-2">Empty state</p>
					<p className="m-0 text-sm text-[var(--sea-ink-soft)] sm:text-base">
						No logs yet.
					</p>
				</section>
			)}
		</section>
	);
}

function LogPanel({
	emptyMessage,
	lines,
	title,
}: {
	emptyMessage: string;
	lines: string[];
	title: string;
}) {
	return (
		<section className="island-shell rounded-[2rem] p-6">
			<p className="island-kicker mb-2">Read-only</p>
			<h3 className="m-0 text-xl font-semibold text-[var(--sea-ink)]">
				{title}
			</h3>
			<div className="mt-4 min-h-64 overflow-x-auto rounded-[1.5rem] border border-[var(--chip-line)] bg-[var(--chip-bg)] p-4 font-mono text-sm text-[var(--sea-ink)]">
				{lines.length > 0 ? (
					<pre className="m-0 whitespace-pre-wrap break-words">
						{lines.join("\n")}
					</pre>
				) : (
					<p className="m-0 font-sans text-sm text-[var(--sea-ink-soft)]">
						{emptyMessage}
					</p>
				)}
			</div>
		</section>
	);
}

function Banner({
	kind,
	message,
}: {
	kind: "success" | "error";
	message: string;
}) {
	const Icon = kind === "success" ? CheckCircle2 : AlertCircle;
	const className =
		kind === "success"
			? "mt-5 rounded-[1.5rem] border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-[var(--sea-ink)]"
			: "mt-5 rounded-[1.5rem] border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-[var(--sea-ink)]";
	const iconClassName =
		kind === "success" ? "text-emerald-600" : "text-red-600";

	return (
		<div className={className}>
			<div className="flex items-center gap-3">
				<Icon className={`h-5 w-5 ${iconClassName}`} />
				<span>{message}</span>
			</div>
		</div>
	);
}

function flattenInstallLogLines(installLogs: InstallLogEntry[]) {
	return installLogs.flatMap((entry) =>
		entry.lines.map((line) => `[${entry.serverLabel}] ${line}`),
	);
}

function flattenActionLogLines(actionLogs: ActionLogEntry[]) {
	return actionLogs.map(
		(entry) =>
			`${entry.createdAt} [${entry.serverLabel}] ${formatActionLabel(entry.action)} ${entry.result}: ${entry.message}`,
	);
}

function formatActionLabel(action: ActionLogEntry["action"]) {
	if (action === "update") {
		return "Update Hermes";
	}

	if (action === "rollback") {
		return "Rollback";
	}

	return "Restart Agent";
}
