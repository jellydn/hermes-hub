import {
	AlertCircle,
	CheckCircle2,
	LoaderCircle,
	RefreshCw,
	RotateCcw,
	ShieldAlert,
	TriangleAlert,
	Wrench,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import type {
	ServerActionHistoryItem,
	ServerActionResult,
	ServerActionType,
	ServerDetailSnapshot,
} from "@/lib/server-detail";

type ServerDetailProps = {
	initialDetail: ServerDetailSnapshot;
};

type ActionState = {
	pending: ServerActionType | null;
	error: string | null;
	success: string | null;
	history: ServerActionHistoryItem[];
	rollbackTarget: string | null;
	activeDialog: ServerActionType | null;
};

export function ServerDetail({ initialDetail }: ServerDetailProps) {
	const [actionState, setActionState] = useState<ActionState>({
		pending: null,
		error: null,
		success: null,
		history: initialDetail.actionHistory,
		rollbackTarget: initialDetail.rollbackTarget,
		activeDialog: null,
	});

	async function handleAction(action: ServerActionType) {
		const rollbackTarget = actionState.rollbackTarget;

		setActionState((current) => ({
			...current,
			pending: action,
			error: null,
			success: null,
			activeDialog: null,
		}));

		try {
			const response = await fetch(
				`/api/servers/${initialDetail.server.id}/actions`,
				{
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						action,
						targetVersion: rollbackTarget,
					}),
				},
			);

			const payload = (await response.json().catch(() => null)) as {
				error?: string;
				message?: string;
				imageRef?: string;
			} | null;

			if (!response.ok || !payload?.message) {
				setActionState((current) => ({
					...current,
					pending: null,
					error: payload?.error ?? "Action failed.",
				}));
				return;
			}

			setActionState((current) => ({
				...current,
				pending: null,
				success: payload.message ?? null,
				rollbackTarget: payload.imageRef ?? current.rollbackTarget,
				history: [
					createHistoryEntry({
						action,
						result: "succeeded",
						message: payload.message ?? "Action completed.",
						imageRef: payload.imageRef ?? null,
					}),
					...current.history,
				].slice(0, 5),
			}));
		} catch {
			setActionState((current) => ({
				...current,
				pending: null,
				error: "Action failed: Connection failed.",
			}));
		}
	}

	return (
		<section className="space-y-6">
			<div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
				<section className="island-shell rounded-[2rem] p-6 sm:p-8">
					<p className="island-kicker mb-2">Server details</p>
					<h3 className="m-0 text-2xl font-semibold text-[var(--sea-ink)]">
						{initialDetail.server.label}
					</h3>
					<p className="mt-3 mb-6 max-w-2xl text-sm text-[var(--sea-ink-soft)] sm:text-base">
						Run operational actions over SSH and keep the most recent results
						close to the VPS summary.
					</p>

					<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
						<SummaryCard label="Host" value={initialDetail.server.host} />
						<SummaryCard label="User" value={initialDetail.server.username} />
						<SummaryCard label="Status" value={initialDetail.server.status} />
						<SummaryCard label="OS" value={formatOsSummary(initialDetail)} />
					</div>

					{initialDetail.server.supportLevel === "untested" ? (
						<div className="mt-4 flex items-center gap-2 rounded-[1.5rem] border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700">
							<TriangleAlert className="h-4 w-4 shrink-0" />
							<span>
								This OS is not officially supported. Hermes runs via Docker but
								some features may not work.
							</span>
						</div>
					) : null}

					{initialDetail.install ? (
						<div className="mt-5 rounded-[1.5rem] border border-[var(--chip-line)] bg-[var(--chip-bg)] px-4 py-4 text-sm text-[var(--sea-ink)]">
							<p className="m-0 font-semibold">Latest install</p>
							<p className="mt-2 mb-0 text-[var(--sea-ink-soft)]">
								Status: {initialDetail.install.status}
								{initialDetail.install.version
									? ` • Version: ${initialDetail.install.version}`
									: ""}
							</p>
						</div>
					) : null}

					{actionState.success ? (
						<div className="mt-5 rounded-[1.5rem] border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-[var(--sea-ink)]">
							<div className="flex items-center gap-3">
								<CheckCircle2 className="h-5 w-5 text-emerald-600" />
								<span>{actionState.success}</span>
							</div>
						</div>
					) : null}

					{actionState.error ? (
						<div className="mt-5 rounded-[1.5rem] border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-[var(--sea-ink)]">
							<div className="flex items-center gap-3">
								<AlertCircle className="h-5 w-5 text-red-600" />
								<span>{actionState.error}</span>
							</div>
						</div>
					) : null}

					<div className="mt-6 flex flex-wrap gap-3">
						<ActionButton
							action="restart"
							label="Restart Agent"
							icon={RefreshCw}
							pending={actionState.pending}
							onOpenDialog={(action) => {
								setActionState((current) => ({
									...current,
									activeDialog: action,
								}));
							}}
						/>
						<ActionButton
							action="update"
							label="Update Hermes"
							icon={Wrench}
							pending={actionState.pending}
							onOpenDialog={(action) => {
								setActionState((current) => ({
									...current,
									activeDialog: action,
								}));
							}}
						/>
						<ActionButton
							action="rollback"
							label="Rollback"
							icon={RotateCcw}
							pending={actionState.pending}
							onOpenDialog={(action) => {
								setActionState((current) => ({
									...current,
									activeDialog: action,
								}));
							}}
						/>
					</div>

					{actionState.activeDialog ? (
						<ConfirmationCard
							action={actionState.activeDialog}
							rollbackTarget={actionState.rollbackTarget}
							onCancel={() => {
								setActionState((current) => ({
									...current,
									activeDialog: null,
								}));
							}}
							onConfirm={(action) => {
								void handleAction(action);
							}}
						/>
					) : null}
				</section>

				<aside className="space-y-4">
					<section className="island-shell rounded-[2rem] p-6">
						<p className="island-kicker mb-2">Action history</p>
						{actionState.history.length === 0 ? (
							<p className="m-0 text-sm text-[var(--sea-ink-soft)]">
								No actions yet.
							</p>
						) : (
							<ul className="m-0 space-y-3 p-0">
								{actionState.history.map((item) => (
									<li
										key={item.id}
										className="list-none rounded-[1.25rem] border border-[var(--chip-line)] bg-[var(--chip-bg)] px-4 py-4"
									>
										<div className="flex items-center justify-between gap-3">
											<p className="m-0 text-sm font-semibold text-[var(--sea-ink)]">
												{formatActionTitle(item.action)}
											</p>
											<span className={badgeClassName(item.result)}>
												{item.result}
											</span>
										</div>
										<p className="mt-2 mb-0 text-sm text-[var(--sea-ink-soft)]">
											{item.message}
										</p>
										<p className="mt-2 mb-0 text-xs text-[var(--sea-ink-soft)]">
											{formatTimestamp(item.createdAt)}
										</p>
									</li>
								))}
							</ul>
						)}
					</section>

					<section className="island-shell rounded-[2rem] p-6">
						<p className="island-kicker mb-2">Safety checks</p>
						<ul className="m-0 space-y-3 pl-5 text-sm text-[var(--sea-ink-soft)]">
							<li>Every destructive action requires confirmation first.</li>
							<li>
								HermesHub reuses the same SSH credential rules as install and
								health.
							</li>
							<li>
								Rollback targets the latest remembered image tag when available.
							</li>
						</ul>
					</section>
				</aside>
			</div>
		</section>
	);
}

function ActionButton({
	action,
	label,
	icon: Icon,
	pending,
	onOpenDialog,
}: {
	action: ServerActionType;
	label: string;
	icon: typeof RefreshCw;
	pending: ServerActionType | null;
	onOpenDialog: (action: ServerActionType) => void;
}) {
	const isPending = pending === action;

	return (
		<Button
			type="button"
			variant={action === "restart" ? "secondary" : "default"}
			onClick={() => onOpenDialog(action)}
			disabled={pending !== null}
		>
			{isPending ? (
				<LoaderCircle className="h-4 w-4 animate-spin" />
			) : (
				<Icon className="h-4 w-4" />
			)}
			<span>{isPending ? `${label}...` : label}</span>
		</Button>
	);
}

function ConfirmationCard({
	action,
	rollbackTarget,
	onCancel,
	onConfirm,
}: {
	action: ServerActionType;
	rollbackTarget: string | null;
	onCancel: () => void;
	onConfirm: (action: ServerActionType) => void;
}) {
	return (
		<div className="mt-5 rounded-[1.5rem] border border-amber-500/30 bg-amber-500/10 px-4 py-4 text-sm text-[var(--sea-ink)]">
			<div className="flex items-start gap-3">
				<ShieldAlert className="mt-0.5 h-5 w-5 text-amber-600" />
				<div className="flex-1">
					<p className="m-0 font-semibold">Are you sure?</p>
					<p className="mt-2 mb-0 text-[var(--sea-ink-soft)]">
						{confirmationMessage(action, rollbackTarget)}
					</p>
					<div className="mt-4 flex flex-wrap gap-3">
						<Button type="button" size="sm" onClick={() => onConfirm(action)}>
							Confirm
						</Button>
						<Button
							type="button"
							size="sm"
							variant="secondary"
							onClick={onCancel}
						>
							Cancel
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
}

function SummaryCard({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded-[1.5rem] border border-[var(--chip-line)] bg-[var(--chip-bg)] px-4 py-4">
			<p className="island-kicker mb-2">{label}</p>
			<p className="m-0 text-sm font-semibold text-[var(--sea-ink)]">{value}</p>
		</div>
	);
}

function formatOsSummary(detail: ServerDetailSnapshot) {
	const summary = [
		detail.server.osName,
		detail.server.osVersion,
		detail.server.architecture,
	]
		.filter(Boolean)
		.join(" • ");

	return summary || "Verified";
}

function formatActionTitle(action: ServerActionType) {
	if (action === "restart") {
		return "Restart Agent";
	}

	if (action === "update") {
		return "Update Hermes";
	}

	return "Rollback";
}

function formatTimestamp(timestamp: string) {
	const parsed = new Date(timestamp);
	if (Number.isNaN(parsed.getTime())) {
		return timestamp;
	}

	return parsed.toLocaleString();
}

function badgeClassName(result: ServerActionHistoryItem["result"]) {
	return result === "succeeded"
		? "rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-700"
		: "rounded-full bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-700";
}

function createHistoryEntry(input: {
	action: ServerActionType;
	result: ServerActionResult;
	message: string;
	imageRef: string | null;
}): ServerActionHistoryItem {
	return {
		id: `${input.action}-${Date.now()}`,
		action: input.action,
		result: input.result,
		createdAt: new Date().toISOString(),
		message: input.message,
		imageRef: input.imageRef,
	};
}

function confirmationMessage(
	action: ServerActionType,
	rollbackTarget: string | null,
) {
	if (action === "restart") {
		return "HermesHub will restart the running containers on this VPS.";
	}

	if (action === "update") {
		return "HermesHub will pull the latest image and recreate the containers.";
	}

	return rollbackTarget
		? `HermesHub will redeploy the remembered image tag ${rollbackTarget}.`
		: "HermesHub will attempt to redeploy the latest remembered Hermes image.";
}
