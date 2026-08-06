import {
	LoaderCircle,
	RefreshCw,
	RotateCcw,
	ShieldAlert,
	Wrench,
} from "lucide-react";
import { useEffect, useState } from "react";

import { alertPanelClass } from "#/components/ui/alert-panel-class";
import { Button } from "#/components/ui/button";
import type { ServerActionType } from "#/lib/server-detail";

import { confirmationMessage } from "./server-detail-helpers";

type ServerActionControlsProps = {
	activeAction: ServerActionType | null;
	pendingAction: ServerActionType | null;
	rollbackTarget: string | null;
	serverId: string;
	onCancelDialog: () => void;
	onConfirmAction: (action: ServerActionType, versionTarget?: string) => void;
	onOpenDialog: (action: ServerActionType) => void;
};

const actionButtons = [
	{
		action: "restart",
		label: "Restart Hermes",
		icon: RefreshCw,
		variant: "secondary",
	},
	{
		action: "update",
		label: "Update Hermes",
		icon: Wrench,
		variant: "default",
	},
	{
		action: "rollback",
		label: "Rollback",
		icon: RotateCcw,
		variant: "default",
	},
] as const satisfies ReadonlyArray<{
	action: ServerActionType;
	label: string;
	icon: typeof RefreshCw;
	variant: "default" | "secondary";
}>;

export function ServerActionControls({
	activeAction,
	pendingAction,
	rollbackTarget,
	serverId,
	onCancelDialog,
	onConfirmAction,
	onOpenDialog,
}: ServerActionControlsProps) {
	return (
		<>
			<div className="mt-6 flex flex-wrap gap-3 border-t border-[var(--line)] pt-6">
				{actionButtons.map(({ action, icon: Icon, label, variant }) => {
					const isPending = pendingAction === action;

					return (
						<Button
							key={action}
							type="button"
							variant={variant}
							onClick={() => onOpenDialog(action)}
							disabled={pendingAction !== null}
						>
							{isPending ? (
								<LoaderCircle className="h-4 w-4 animate-spin" />
							) : (
								<Icon className="h-4 w-4" />
							)}
							<span>{isPending ? `${label}...` : label}</span>
						</Button>
					);
				})}
			</div>

			{activeAction === "update" ? (
				<UpdateConfirmationCard
					serverId={serverId}
					pending={pendingAction === "update"}
					onCancel={onCancelDialog}
					onConfirm={(versionTarget) =>
						onConfirmAction("update", versionTarget)
					}
				/>
			) : activeAction ? (
				<GenericConfirmationCard
					action={activeAction}
					rollbackTarget={rollbackTarget}
					onCancel={onCancelDialog}
					onConfirm={() => onConfirmAction(activeAction)}
				/>
			) : null}
		</>
	);
}

// ── Generic confirmation card (restart / rollback) ─────────────────

function GenericConfirmationCard({
	action,
	rollbackTarget,
	onCancel,
	onConfirm,
}: {
	action: ServerActionType;
	rollbackTarget: string | null;
	onCancel: () => void;
	onConfirm: () => void;
}) {
	return (
		<div className={alertPanelClass("warning", "mt-5 px-4 py-4")}>
			<div className="flex items-start gap-3">
				<ShieldAlert className="mt-0.5 h-5 w-5 text-[var(--alert-warning-fg)]" />
				<div className="flex-1">
					<p className="m-0 font-semibold">Are you sure?</p>
					<p className="mt-2 mb-0 text-[var(--sea-ink-soft)]">
						{confirmationMessage(action, rollbackTarget)}
					</p>
					<div className="mt-4 flex flex-wrap gap-3">
						<Button type="button" size="sm" onClick={onConfirm}>
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

// ── Update confirmation card with version + changelog ──────────────

type UpdateInfo = {
	current: {
		image: string;
		imageId: string;
		repoDigests: string[];
	} | null;
	latest: {
		tag: string;
		digest: string;
		pushedAt: string;
	} | null;
	release: {
		tagName: string;
		name: string;
		publishedAt: string;
		body: string;
		htmlUrl: string;
	} | null;
	updateAvailable: boolean;
};

type UpdateInfoState = {
	loading: boolean;
	data: UpdateInfo | null;
	error: string | null;
};

function UpdateConfirmationCard({
	serverId,
	pending,
	onCancel,
	onConfirm,
}: {
	serverId: string;
	pending: boolean;
	onCancel: () => void;
	onConfirm: (versionTarget?: string) => void;
}) {
	const [state, setState] = useState<UpdateInfoState>({
		loading: true,
		data: null,
		error: null,
	});

	useEffect(() => {
		let cancelled = false;

		setState({ loading: true, data: null, error: null });

		fetch(`/api/servers/${serverId}/hermes-update-info`)
			.then(async (response) => {
				if (cancelled) {
					return;
				}

				const payload = (await response.json().catch(() => null)) as {
					error?: string;
				} & Partial<UpdateInfo>;

				if (!response.ok) {
					setState({
						loading: false,
						data: null,
						error: payload?.error ?? "Failed to load update information.",
					});
					return;
				}

				setState({
					loading: false,
					data: payload as UpdateInfo,
					error: null,
				});
			})
			.catch(() => {
				if (cancelled) {
					return;
				}
				setState({
					loading: false,
					data: null,
					error: "Failed to load update information.",
				});
			});

		return () => {
			cancelled = true;
		};
	}, [serverId]);

	if (state.loading) {
		return (
			<div className={alertPanelClass("info", "mt-5 px-4 py-4")}>
				<div className="flex items-center gap-3">
					<LoaderCircle className="h-5 w-5 animate-spin" />
					<span className="text-[var(--sea-ink-soft)]">
						Checking for Hermes updates…
					</span>
				</div>
			</div>
		);
	}

	if (state.error || !state.data) {
		return (
			<div className={alertPanelClass("warning", "mt-5 px-4 py-4")}>
				<div className="flex items-start gap-3">
					<ShieldAlert className="mt-0.5 h-5 w-5 text-[var(--alert-warning-fg)]" />
					<div className="flex-1">
						<p className="m-0 font-semibold">
							{state.error ?? "Unable to check for updates."}
						</p>
						<p className="mt-2 mb-0 text-[var(--sea-ink-soft)]">
							{confirmationMessage("update", null)}
						</p>
						<div className="mt-4 flex flex-wrap gap-3">
							<Button
								type="button"
								size="sm"
								onClick={() => onConfirm()}
								disabled={pending}
							>
								Update anyway
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

	const { current, latest, release, updateAvailable } = state.data;
	const currentDigest = extractDigest(current?.image);
	const latestDigest = latest?.digest;

	return (
		<div className={alertPanelClass("warning", "mt-5 px-4 py-4")}>
			<div className="flex items-start gap-3">
				<ShieldAlert className="mt-0.5 h-5 w-5 text-[var(--alert-warning-fg)]" />
				<div className="flex-1 space-y-3">
					<p className="m-0 font-semibold">Update Hermes</p>
					<p className="mb-0 text-[var(--sea-ink-soft)]">
						{confirmationMessage("update", null)}
					</p>

					<div
						className={
							updateAvailable
								? alertPanelClass("warning", "px-3 py-2")
								: alertPanelClass("success", "px-3 py-2")
						}
					>
						{updateAvailable
							? "An update is available."
							: "Hermes is up to date."}
					</div>

					<div className="grid gap-2 text-sm sm:grid-cols-2">
						<div>
							<p className="m-0 font-semibold">Current</p>
							<p
								className="m-0 text-[var(--sea-ink-soft)]"
								title={currentDigest ?? current?.image ?? "Unknown"}
							>
								{currentDigest
									? truncateDigest(currentDigest)
									: (current?.image ?? "Unknown")}
							</p>
						</div>
						<div>
							<p className="m-0 font-semibold">Latest</p>
							<p
								className="m-0 text-[var(--sea-ink-soft)]"
								title={latestDigest ?? "Unknown"}
							>
								{latestDigest ? truncateDigest(latestDigest) : "Unknown"}
							</p>
							{latest?.pushedAt ? (
								<p className="m-0 text-xs text-[var(--sea-ink-soft)]">
									Pushed {formatDate(latest.pushedAt)}
								</p>
							) : null}
						</div>
					</div>

					{release ? (
						<div>
							<p className="m-0 font-semibold">
								{release.name}
								<span className="ml-2 text-xs font-normal text-[var(--sea-ink-soft)]">
									{release.tagName}
								</span>
							</p>
							{release.publishedAt ? (
								<p className="m-0 text-xs text-[var(--sea-ink-soft)]">
									Released {formatDate(release.publishedAt)}
								</p>
							) : null}
							{release.body ? (
								<pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap rounded bg-[var(--sea-foam)] p-3 text-xs">
									{release.body}
								</pre>
							) : null}
							<a
								href={release.htmlUrl}
								target="_blank"
								rel="noopener noreferrer"
								className="mt-1 inline-block text-xs text-[var(--lagoon-deep)] hover:underline"
							>
								View full release notes →
							</a>
						</div>
					) : null}

					<div className="flex flex-wrap gap-3 pt-1">
						<Button
							type="button"
							size="sm"
							onClick={() => onConfirm(latestDigest)}
							disabled={pending || !updateAvailable}
						>
							{updateAvailable ? "Confirm update" : "Up to date"}
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

function truncateDigest(digest: string): string {
	// Show sha256: + first 12 hex chars, full digest on hover via title.
	return `${digest.slice(0, 19)}…`;
}

function formatDate(iso: string): string {
	const parsed = new Date(iso);
	if (Number.isNaN(parsed.getTime())) {
		return iso;
	}
	return parsed.toLocaleDateString();
}

function extractDigest(value: string | undefined): string | undefined {
	if (!value) {
		return undefined;
	}
	const match = value.match(/sha256:[a-f0-9]{64}/i);
	return match?.[0];
}
