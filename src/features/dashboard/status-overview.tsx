import {
	Activity,
	Bot,
	Cpu,
	LoaderCircle,
	RefreshCcw,
	Sparkles,
	TriangleAlert,
} from "lucide-react";
import { type ComponentType, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { formatAiProviderLabel } from "@/lib/ai-providers";
import type {
	DashboardProviderSummary,
	DashboardStatusSnapshot,
	DashboardTelegramSummary,
	DashboardVpsSummary,
} from "@/lib/dashboard-status";
import { useMountEffect } from "@/lib/use-mount-effect";
import { cn } from "@/lib/utils";

type DashboardStatusOverviewProps = {
	initialStatus: DashboardStatusSnapshot | null;
};

type FetchState = "idle" | "loading" | "refreshing" | "error";

export function DashboardStatusOverview({
	initialStatus,
}: DashboardStatusOverviewProps) {
	const [snapshot, setSnapshot] = useState(initialStatus);
	const [fetchState, setFetchState] = useState<FetchState>(
		initialStatus ? "idle" : "loading",
	);
	const [fetchError, setFetchError] = useState<string | null>(null);
	const requestCounterRef = useRef(0);

	async function refreshStatus(options?: { background?: boolean }) {
		const requestId = requestCounterRef.current + 1;
		requestCounterRef.current = requestId;
		setFetchError(null);
		setFetchState(options?.background && snapshot ? "refreshing" : "loading");

		try {
			const response = await fetch("/api/dashboard/status", {
				method: "GET",
				headers: { accept: "application/json" },
			});
			const payload = (await response.json().catch(() => null)) as {
				error?: string;
				dashboard?: DashboardStatusSnapshot;
			} | null;

			if (!response.ok || !payload?.dashboard) {
				throw new Error(
					payload?.error ?? "Unable to refresh dashboard status.",
				);
			}

			if (requestCounterRef.current !== requestId) {
				return;
			}

			setSnapshot(payload.dashboard);
			setFetchState("idle");
		} catch (error) {
			if (requestCounterRef.current !== requestId) {
				return;
			}

			setFetchError(
				error instanceof Error
					? error.message
					: "Unable to refresh dashboard status.",
			);
			setFetchState("error");
		}
	}

	useMountEffect(() => {
		if (!initialStatus) {
			void refreshStatus();
		}

		const pollId = window.setInterval(() => {
			void refreshStatus({ background: true });
		}, 30_000);

		return () => {
			window.clearInterval(pollId);
		};
	});

	const showLoadingSkeleton = !snapshot && fetchState === "loading";
	const showCardErrors = !snapshot && fetchState === "error";

	return (
		<section className="space-y-6">
			<section className="island-shell relative overflow-hidden rounded-[2rem] px-6 py-8 sm:px-8">
				<div className="pointer-events-none absolute -left-16 top-0 h-48 w-48 rounded-full bg-[radial-gradient(circle,rgba(79,184,178,0.24),transparent_70%)]" />
				<div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
					<div>
						<p className="island-kicker mb-3">Status snapshot</p>
						<h3 className="display-title mb-3 text-3xl font-bold tracking-tight text-[var(--sea-ink)] sm:text-4xl">
							{snapshot?.server?.label ?? "Connect your first VPS"}
						</h3>
						<p className="m-0 max-w-2xl text-sm text-[var(--sea-ink-soft)] sm:text-base">
							{snapshot?.server
								? `${snapshot.server.host}${snapshot.server.osName ? ` · ${snapshot.server.osName}${snapshot.server.osVersion ? ` ${snapshot.server.osVersion}` : ""}` : ""}`
								: "Connect your first VPS to get started."}
						</p>
					</div>
					<div className="flex flex-wrap items-center gap-3">
						<Button asChild>
							<a href="/servers">
								{snapshot?.server ? "Manage servers" : "Connect your first VPS"}
							</a>
						</Button>
						<Button
							type="button"
							variant="secondary"
							onClick={() => {
								void refreshStatus();
							}}
							disabled={fetchState === "loading" || fetchState === "refreshing"}
						>
							{fetchState === "loading" || fetchState === "refreshing" ? (
								<LoaderCircle className="h-4 w-4 animate-spin" />
							) : (
								<RefreshCcw className="h-4 w-4" />
							)}
							<span>Refresh now</span>
						</Button>
					</div>
				</div>
			</section>

			{snapshot?.server ? null : (
				<section className="island-shell rounded-[2rem] p-6">
					<p className="island-kicker mb-2">Empty state</p>
					<p className="m-0 text-base text-[var(--sea-ink-soft)]">
						Connect your first VPS to get started.
					</p>
				</section>
			)}

			{showLoadingSkeleton ? <DashboardSkeletonGrid /> : null}

			{showCardErrors ? (
				<DashboardErrorGrid
					message={fetchError ?? "Unable to load dashboard cards."}
					onRetry={() => {
						void refreshStatus();
					}}
				/>
			) : null}

			{snapshot ? (
				<>
					{fetchError ? (
						<div className="rounded-[1.5rem] border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-[var(--sea-ink)]">
							The latest refresh failed, so these cards may be stale.{" "}
							{fetchError}
						</div>
					) : null}

					<section className="grid gap-4 xl:grid-cols-2">
						<StatusCard
							icon={Activity}
							label="Agent status"
							title={snapshot.agent.status === "online" ? "Online" : "Offline"}
							status={snapshot.agent.status}
							detail={snapshot.agent.detail}
							meta={
								snapshot.agent.updatedAt
									? `Updated ${formatRelativeTimestamp(snapshot.agent.updatedAt)}`
									: "Waiting for first install"
							}
						/>
						<VpsHealthCard
							vps={snapshot.vps}
							onRetry={() => void refreshStatus()}
						/>
						<ProviderCard provider={snapshot.provider} />
						<TelegramCard telegram={snapshot.telegram} />
					</section>

					<section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
						<section className="island-shell rounded-[2rem] p-6">
							<p className="island-kicker mb-2">Snapshot notes</p>
							<h3 className="m-0 text-xl font-semibold text-[var(--sea-ink)]">
								Latest dashboard refresh
							</h3>
							<p className="mt-3 mb-0 text-sm text-[var(--sea-ink-soft)]">
								The dashboard refreshes every 30 seconds while this page stays
								open so the cards keep up with VPS health and integration state.
							</p>
						</section>
						<section className="island-shell rounded-[2rem] p-6">
							<p className="island-kicker mb-2">Last refresh</p>
							<p className="m-0 text-xl font-semibold text-[var(--sea-ink)]">
								{formatRelativeTimestamp(snapshot.generatedAt)}
							</p>
						</section>
					</section>
				</>
			) : null}
		</section>
	);
}

function ProviderCard({ provider }: { provider: DashboardProviderSummary }) {
	return (
		<StatusCard
			icon={Sparkles}
			label="AI provider"
			title={
				provider.provider
					? formatAiProviderLabel(provider.provider)
					: "Disconnected"
			}
			status={provider.status}
			detail={provider.detail}
			meta={provider.model ? `Model: ${provider.model}` : "No active provider"}
		/>
	);
}

function TelegramCard({ telegram }: { telegram: DashboardTelegramSummary }) {
	return (
		<StatusCard
			icon={Bot}
			label="Telegram"
			title={telegram.botUsername ? `@${telegram.botUsername}` : "Disconnected"}
			status={telegram.status}
			detail={telegram.detail}
			meta={telegram.botUsername ? "Connected" : "No Telegram bot connected"}
		/>
	);
}

function VpsHealthCard({
	onRetry,
	vps,
}: {
	onRetry: () => void;
	vps: DashboardVpsSummary;
}) {
	if (vps.status === "error") {
		return (
			<article className="island-shell rounded-[2rem] p-5">
				<div className="mb-4 inline-flex rounded-2xl border border-red-500/20 bg-red-500/10 p-3 text-red-600">
					<TriangleAlert className="h-5 w-5" />
				</div>
				<p className="island-kicker mb-2">VPS health</p>
				<h3 className="m-0 text-lg font-semibold text-[var(--sea-ink)]">
					Metrics unavailable
				</h3>
				<p className="mt-3 text-sm text-[var(--sea-ink-soft)]">
					{vps.error ?? vps.detail}
				</p>
				<Button
					type="button"
					variant="secondary"
					className="mt-4"
					onClick={onRetry}
				>
					<RefreshCcw className="h-4 w-4" />
					<span>Retry</span>
				</Button>
			</article>
		);
	}

	return (
		<article className="island-shell rounded-[2rem] p-5">
			<div className="mb-4 inline-flex rounded-2xl border border-[var(--chip-line)] bg-[var(--chip-bg)] p-3 text-[var(--sea-ink)]">
				<Cpu className="h-5 w-5" />
			</div>
			<div className="flex items-start justify-between gap-4">
				<div>
					<p className="island-kicker mb-2">VPS health</p>
					<h3 className="m-0 text-lg font-semibold text-[var(--sea-ink)]">
						{vps.status === "warning" ? "Watch closely" : "Healthy"}
					</h3>
				</div>
				<span className={statusPillClassName(vps.status)}>{vps.status}</span>
			</div>
			<p className="mt-3 text-sm text-[var(--sea-ink-soft)]">{vps.detail}</p>
			<div className="mt-5 grid grid-cols-3 gap-3">
				<MetricStat label="CPU" value={formatPercent(vps.cpu)} />
				<MetricStat label="Memory" value={formatPercent(vps.memory)} />
				<MetricStat label="Disk" value={formatPercent(vps.disk)} />
			</div>
			<p className="mt-4 mb-0 text-sm text-[var(--sea-ink-soft)]">
				{vps.uptime ? `${vps.uptime} · ` : ""}
				{vps.updatedAt
					? `Updated ${formatRelativeTimestamp(vps.updatedAt)}`
					: "Waiting for live check"}
			</p>
		</article>
	);
}

function StatusCard({
	detail,
	icon: Icon,
	label,
	meta,
	status,
	title,
}: {
	detail: string;
	icon: ComponentType<{ className?: string }>;
	label: string;
	meta: string;
	status: "online" | "offline" | "connected" | "disconnected";
	title: string;
}) {
	return (
		<article className="island-shell rounded-[2rem] p-5">
			<div className="mb-4 inline-flex rounded-2xl border border-[var(--chip-line)] bg-[var(--chip-bg)] p-3 text-[var(--sea-ink)]">
				<Icon className="h-5 w-5" />
			</div>
			<div className="flex items-start justify-between gap-4">
				<div>
					<p className="island-kicker mb-2">{label}</p>
					<h3 className="m-0 text-lg font-semibold text-[var(--sea-ink)]">
						{title}
					</h3>
				</div>
				<span className={statusPillClassName(status)}>{status}</span>
			</div>
			<p className="mt-3 text-sm text-[var(--sea-ink-soft)]">{detail}</p>
			<p className="mt-4 mb-0 text-sm text-[var(--sea-ink)]">{meta}</p>
		</article>
	);
}

function DashboardSkeletonGrid() {
	const skeletonCards = ["agent", "vps", "provider", "telegram"] as const;

	return (
		<section
			className="grid gap-4 xl:grid-cols-2"
			aria-label="Loading dashboard status"
		>
			{skeletonCards.map((card) => (
				<article key={card} className="island-shell rounded-[2rem] p-5">
					<div className="animate-pulse space-y-4">
						<div className="h-12 w-12 rounded-2xl bg-[var(--chip-bg)]" />
						<div className="h-4 w-24 rounded-full bg-[var(--chip-bg)]" />
						<div className="h-6 w-36 rounded-full bg-[var(--chip-bg)]" />
						<div className="h-4 w-full rounded-full bg-[var(--chip-bg)]" />
						<div className="h-4 w-2/3 rounded-full bg-[var(--chip-bg)]" />
					</div>
				</article>
			))}
		</section>
	);
}

function DashboardErrorGrid({
	message,
	onRetry,
}: {
	message: string;
	onRetry: () => void;
}) {
	return (
		<section className="grid gap-4 xl:grid-cols-2">
			{["Agent status", "VPS health", "AI provider", "Telegram"].map(
				(label) => (
					<article key={label} className="island-shell rounded-[2rem] p-5">
						<div className="mb-4 inline-flex rounded-2xl border border-red-500/20 bg-red-500/10 p-3 text-red-600">
							<TriangleAlert className="h-5 w-5" />
						</div>
						<p className="island-kicker mb-2">{label}</p>
						<h3 className="m-0 text-lg font-semibold text-[var(--sea-ink)]">
							Unable to load
						</h3>
						<p className="mt-3 text-sm text-[var(--sea-ink-soft)]">{message}</p>
						<Button
							type="button"
							variant="secondary"
							className="mt-4"
							onClick={onRetry}
						>
							<RefreshCcw className="h-4 w-4" />
							<span>Retry</span>
						</Button>
					</article>
				),
			)}
		</section>
	);
}

function MetricStat({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded-[1.5rem] border border-[var(--chip-line)] bg-[var(--chip-bg)] px-4 py-4">
			<p className="m-0 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--sea-ink-soft)]">
				{label}
			</p>
			<p className="mt-2 mb-0 text-2xl font-semibold text-[var(--sea-ink)]">
				{value}
			</p>
		</div>
	);
}

function formatPercent(value: number | null) {
	return value === null ? "--" : `${value}%`;
}

function formatRelativeTimestamp(timestamp: string) {
	const parsed = new Date(timestamp);
	if (Number.isNaN(parsed.getTime())) {
		return timestamp;
	}

	return parsed.toLocaleTimeString([], {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});
}

function statusPillClassName(
	status:
		| "online"
		| "offline"
		| "connected"
		| "disconnected"
		| "healthy"
		| "warning",
) {
	return cn(
		"rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]",
		status === "online" || status === "connected" || status === "healthy"
			? "bg-emerald-500/15 text-emerald-700"
			: status === "warning"
				? "bg-amber-500/15 text-amber-700"
				: "bg-red-500/15 text-red-700",
	);
}
