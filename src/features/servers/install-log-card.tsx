import { Link } from "@tanstack/react-router";
import {
	AlertCircle,
	ChevronDown,
	ChevronRight,
	ExternalLink,
	LoaderCircle,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { alertPanelClass } from "#/components/ui/alert-panel-class";
import { StatusIcon } from "#/components/ui/status-icon";
import { formatInstallStatus } from "./server-detail-helpers";

type InstallLogCardProps = {
	serverId: string;
	install: { status: string; version?: string | null } | null;
};

type InstallLogData = {
	installId: string | null;
	status: string | null;
	step: string | null;
	log: string | null;
	updatedAt: string | null;
};

const POLL_INTERVAL_MS = 3000;

export function InstallLogCard({ serverId, install }: InstallLogCardProps) {
	const [isExpanded, setIsExpanded] = useState(false);
	const [logData, setLogData] = useState<InstallLogData | null>(null);
	const [error, setError] = useState<string | null>(null);
	const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const previousServerIdRef = useRef(serverId);

	if (serverId !== previousServerIdRef.current) {
		previousServerIdRef.current = serverId;
		setLogData(null);
		setError(null);
	}

	const shouldFetchLog = Boolean(
		install && (isExpanded || install.status === "failed"),
	);

	const fetchLog = useCallback(async () => {
		try {
			const response = await fetch(`/api/servers/${serverId}/install/log`);
			if (!response.ok) {
				setError("Failed to load install log.");
				return;
			}
			const data = (await response.json()) as InstallLogData;
			setLogData(data);
			setError(null);
		} catch {
			setError("Failed to load install log.");
		}
	}, [serverId]);

	const fetchLogRef = useRef(fetchLog);
	fetchLogRef.current = fetchLog;

	useEffect(() => {
		if (!shouldFetchLog) {
			return;
		}

		void fetchLogRef.current();
	}, [shouldFetchLog]);

	useEffect(() => {
		if (install?.status !== "running") {
			if (pollTimerRef.current) {
				clearInterval(pollTimerRef.current);
				pollTimerRef.current = null;
			}
			return;
		}

		pollTimerRef.current = setInterval(() => {
			void fetchLogRef.current();
		}, POLL_INTERVAL_MS);

		return () => {
			if (pollTimerRef.current) {
				clearInterval(pollTimerRef.current);
				pollTimerRef.current = null;
			}
		};
	}, [install?.status]);

	if (!install) {
		return (
			<div className="mt-5 rounded-[1.5rem] border border-[var(--chip-line)] bg-[var(--chip-bg)] px-4 py-4 text-sm text-[var(--sea-ink)]">
				<p className="m-0 font-semibold">Install step</p>
				<p className="mt-2 mb-0 text-[var(--sea-ink-soft)]">
					This server is ready for the Hermes install flow.
				</p>
			</div>
		);
	}

	const isFailed = install.status === "failed";
	const isRunning = install.status === "running";
	const isSucceeded = install.status === "succeeded";
	const showLogLoading =
		shouldFetchLog && isExpanded && logData === null && error === null;
	const lastErrorLine = logData?.log
		?.split("\n")
		.filter(Boolean)
		.reverse()
		.find((line) => line.toLowerCase().includes("error"));

	return (
		<div className="mt-5 rounded-[1.5rem] border border-[var(--chip-line)] bg-[var(--chip-bg)] px-4 py-4 text-sm text-[var(--sea-ink)]">
			<p className="m-0 font-semibold">Latest install</p>
			<p className="mt-2 mb-0 text-[var(--sea-ink-soft)] flex items-center gap-2">
				{isSucceeded && <StatusIcon status="success" size={3.5} />}
				{isFailed && <StatusIcon status="error" size={3.5} />}
				{isRunning && <StatusIcon status="info" size={3.5} />}
				<span>Status: {formatInstallStatus(install.status)}</span>
				{install.version ? <span>• Version: {install.version}</span> : null}
			</p>

			{isFailed ? (
				<div
					className={alertPanelClass(
						"error",
						"mt-3 flex items-center gap-3 rounded-[1rem] px-3 py-2 text-xs",
					)}
				>
					<AlertCircle className="h-4 w-4 shrink-0" />
					<span className="truncate">
						{lastErrorLine ?? "Install failed. Expand the log to see details."}
					</span>
				</div>
			) : null}

			<div className="mt-3 flex flex-wrap items-center gap-3">
				<button
					type="button"
					className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--lagoon-deep)] transition hover:text-[var(--sea-ink)]"
					onClick={() => setIsExpanded((prev) => !prev)}
				>
					{isExpanded ? (
						<ChevronDown className="h-3.5 w-3.5" />
					) : (
						<ChevronRight className="h-3.5 w-3.5" />
					)}
					<span>{isExpanded ? "Hide log" : "View log"}</span>
				</button>

				<Link
					to="/servers/$id/install"
					params={{ id: serverId }}
					className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--lagoon-deep)] transition hover:text-[var(--sea-ink)]"
				>
					<ExternalLink className="h-3.5 w-3.5" />
					<span>Open install progress</span>
				</Link>

				{isRunning ? (
					<span className="inline-flex items-center gap-1.5 text-xs text-[var(--sea-ink-soft)]">
						<LoaderCircle className="h-3.5 w-3.5 animate-spin" />
						<span>Updating...</span>
					</span>
				) : null}
			</div>

			{isExpanded ? (
				<div className="mt-3 min-h-32 max-h-64 overflow-auto rounded-[1rem] border border-[var(--chip-line)] bg-[var(--chip-bg)] p-4 font-mono text-xs text-[var(--sea-ink)]">
					{showLogLoading ? (
						<div className="flex items-center gap-2 text-[var(--sea-ink-soft)]">
							<LoaderCircle className="h-4 w-4 animate-spin" />
							<span>Loading log...</span>
						</div>
					) : error ? (
						<div className="flex items-center gap-2 text-[var(--alert-error-fg)]">
							<AlertCircle className="h-4 w-4" />
							<span>{error}</span>
						</div>
					) : logData?.log ? (
						<pre className="m-0 whitespace-pre-wrap break-words">
							{logData.log}
						</pre>
					) : (
						<p className="m-0 font-sans text-xs text-[var(--sea-ink-soft)]">
							No log output yet.
						</p>
					)}
				</div>
			) : null}
		</div>
	);
}
