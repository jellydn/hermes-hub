import { Link } from "@tanstack/react-router";
import {
	AlertCircle,
	ArrowLeft,
	CheckCircle2,
	LoaderCircle,
	Rocket,
	TriangleAlert,
} from "lucide-react";
import { type ReactNode, useState } from "react";

import { Button } from "@/components/ui/button";
import type {
	ServerActionType,
	ServerDetailSnapshot,
} from "@/lib/server-detail";
import { cn } from "@/lib/utils";

import { ServerActionControls } from "./server-action-controls";
import { ServerBasicsForm } from "./server-basics-form";
import { ServerDetailAside } from "./server-detail-aside";
import {
	createHistoryEntry,
	createServerBasicsDraft,
	formatInstallStatus,
	type ServerBasicsDraft,
	type ServerBasicsErrors,
	validateServerBasicsDraft,
} from "./server-detail-helpers";

type ServerDetailProps = {
	detail: ServerDetailSnapshot;
	onDetailChange: (detail: ServerDetailSnapshot) => void;
	onGoToInstall: (serverId: string) => void | Promise<void>;
};

type ActionState = {
	activeDialog: ServerActionType | null;
	error: string | null;
	pending: ServerActionType | null;
	success: string | null;
};

export function ServerDetail({
	detail,
	onDetailChange,
	onGoToInstall,
}: ServerDetailProps) {
	const [actionState, setActionState] = useState<ActionState>({
		activeDialog: null,
		error: null,
		pending: null,
		success: null,
	});
	const [basicsDraft, setBasicsDraft] = useState<ServerBasicsDraft>(() =>
		createServerBasicsDraft(detail),
	);
	const [basicsErrors, setBasicsErrors] = useState<ServerBasicsErrors>({});
	const [isEditingBasics, setIsEditingBasics] = useState(false);
	const [basicsError, setBasicsError] = useState<string | null>(null);
	const [basicsSuccess, setBasicsSuccess] = useState<string | null>(null);
	const [isSavingBasics, setIsSavingBasics] = useState(false);
	const [installError, setInstallError] = useState<string | null>(null);
	const [isStartingInstall, setIsStartingInstall] = useState(false);

	const installButtonLabel = detail.install
		? detail.install.status === "failed"
			? "Retry install"
			: "Open install progress"
		: "Install Hermes";

	async function handleAction(action: ServerActionType) {
		setActionState({
			activeDialog: null,
			error: null,
			pending: action,
			success: null,
		});

		try {
			const response = await fetch(`/api/servers/${detail.server.id}/actions`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					action,
					targetVersion: detail.rollbackTarget,
				}),
			});
			const payload = (await response.json().catch(() => null)) as {
				error?: string;
				imageRef?: string;
				message?: string;
			} | null;

			if (!response.ok || !payload?.message) {
				setActionState({
					activeDialog: null,
					error: payload?.error ?? "Action failed.",
					pending: null,
					success: null,
				});
				return;
			}

			onDetailChange({
				...detail,
				actionHistory: [
					createHistoryEntry({
						action,
						result: "succeeded",
						message: payload.message,
						imageRef: payload.imageRef ?? null,
					}),
					...detail.actionHistory,
				].slice(0, 5),
				rollbackTarget: payload.imageRef ?? detail.rollbackTarget,
			});
			setActionState({
				activeDialog: null,
				error: null,
				pending: null,
				success: payload.message,
			});
		} catch {
			setActionState({
				activeDialog: null,
				error: "Action failed: Connection failed.",
				pending: null,
				success: null,
			});
		}
	}

	function handleBasicsChange(field: keyof ServerBasicsDraft, value: string) {
		setBasicsDraft((current) => ({
			...current,
			[field]: value,
		}));
		setBasicsErrors((current) => {
			if (!current[field]) {
				return current;
			}

			const nextErrors = { ...current };
			delete nextErrors[field];
			return nextErrors;
		});
	}

	function startEditingBasics() {
		setIsEditingBasics(true);
		setBasicsError(null);
		setBasicsSuccess(null);
		setBasicsDraft(createServerBasicsDraft(detail));
	}

	function cancelEditingBasics() {
		setIsEditingBasics(false);
		setBasicsErrors({});
		setBasicsError(null);
		setBasicsSuccess(null);
		setBasicsDraft(createServerBasicsDraft(detail));
	}

	async function handleSaveBasics() {
		const nextErrors = validateServerBasicsDraft(basicsDraft);
		if (Object.keys(nextErrors).length > 0) {
			setBasicsErrors(nextErrors);
			return;
		}

		setIsSavingBasics(true);
		setBasicsError(null);
		setBasicsSuccess(null);

		try {
			const response = await fetch(`/api/servers/${detail.server.id}`, {
				method: "PATCH",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					label: basicsDraft.label.trim(),
					host: basicsDraft.host.trim(),
					port: Number(basicsDraft.port),
					username: basicsDraft.username.trim(),
				}),
			});
			const payload = (await response.json().catch(() => null)) as {
				error?: string;
				serverDetail?: ServerDetailSnapshot;
			} | null;

			if (!response.ok || !payload?.serverDetail) {
				setBasicsError(payload?.error ?? "Unable to update this server.");
				return;
			}

			onDetailChange(payload.serverDetail);
			setBasicsDraft(createServerBasicsDraft(payload.serverDetail));
			setBasicsErrors({});
			setBasicsSuccess("Server basics updated.");
			setIsEditingBasics(false);
		} catch {
			setBasicsError("Unable to update this server.");
		} finally {
			setIsSavingBasics(false);
		}
	}

	async function handleInstall() {
		setInstallError(null);

		if (detail.install && detail.install.status !== "failed") {
			await onGoToInstall(detail.server.id);
			return;
		}

		setIsStartingInstall(true);

		try {
			const response = await fetch(`/api/servers/${detail.server.id}/install`, {
				method: "POST",
			});
			const payload = (await response.json().catch(() => null)) as {
				error?: string;
			} | null;

			if (!response.ok && response.status !== 409) {
				setInstallError(payload?.error ?? "Unable to start the install.");
				return;
			}

			await onGoToInstall(detail.server.id);
		} catch {
			setInstallError("Unable to start the install.");
		} finally {
			setIsStartingInstall(false);
		}
	}

	return (
		<section className="space-y-6">
			<div>
				<Link
					to="/servers"
					className="inline-flex items-center gap-2 text-sm font-medium text-[var(--lagoon-deep)] transition hover:text-[var(--sea-ink)]"
				>
					<ArrowLeft className="h-4 w-4" />
					<span>All servers</span>
				</Link>
			</div>
			<div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
				<section className="island-shell rounded-[2rem] p-6 sm:p-8">
					<div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
						<div>
							<p className="island-kicker mb-2">Manage server</p>
							<h3 className="m-0 text-2xl font-semibold text-[var(--sea-ink)]">
								{detail.server.label}
							</h3>
							<p className="mt-3 mb-0 max-w-2xl text-sm text-[var(--sea-ink-soft)] sm:text-base">
								Review the saved SSH basics, make small edits in place, and jump
								straight into the Hermes install flow when you are ready.
							</p>
						</div>
						<Button
							type="button"
							onClick={() => {
								void handleInstall();
							}}
							disabled={isStartingInstall}
						>
							{isStartingInstall ? (
								<LoaderCircle className="h-4 w-4 animate-spin" />
							) : (
								<Rocket className="h-4 w-4" />
							)}
							<span>
								{isStartingInstall ? "Starting install..." : installButtonLabel}
							</span>
						</Button>
					</div>

					<ServerBasicsForm
						draft={basicsDraft}
						errors={basicsErrors}
						isEditing={isEditingBasics}
						isSaving={isSavingBasics}
						onCancel={cancelEditingBasics}
						onChange={handleBasicsChange}
						onSave={() => {
							void handleSaveBasics();
						}}
						onStartEditing={startEditingBasics}
					/>

					{detail.server.supportLevel === "untested" ? (
						<div className="mt-4 flex items-center gap-2 rounded-[1.5rem] border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700">
							<TriangleAlert className="h-4 w-4 shrink-0" />
							<span>
								This OS is not officially supported. Hermes runs via Docker but
								some features may not work.
							</span>
						</div>
					) : null}

					<InstallSummary detail={detail} />
					{basicsSuccess ? (
						<Banner tone="success">{basicsSuccess}</Banner>
					) : null}
					{basicsError ? <Banner tone="error">{basicsError}</Banner> : null}
					{installError ? <Banner tone="error">{installError}</Banner> : null}
					{actionState.success ? (
						<Banner tone="success">{actionState.success}</Banner>
					) : null}
					{actionState.error ? (
						<Banner tone="error">{actionState.error}</Banner>
					) : null}

					<ServerActionControls
						activeAction={actionState.activeDialog}
						pendingAction={actionState.pending}
						rollbackTarget={detail.rollbackTarget}
						onCancelDialog={() => {
							setActionState((current) => ({
								...current,
								activeDialog: null,
							}));
						}}
						onConfirmAction={(action) => {
							void handleAction(action);
						}}
						onOpenDialog={(action) => {
							setActionState((current) => ({
								...current,
								activeDialog: action,
							}));
						}}
					/>
				</section>

				<ServerDetailAside detail={detail} />
			</div>
		</section>
	);
}

function InstallSummary({ detail }: { detail: ServerDetailSnapshot }) {
	if (detail.install) {
		return (
			<div className="mt-5 rounded-[1.5rem] border border-[var(--chip-line)] bg-[var(--chip-bg)] px-4 py-4 text-sm text-[var(--sea-ink)]">
				<p className="m-0 font-semibold">Latest install</p>
				<p className="mt-2 mb-0 text-[var(--sea-ink-soft)]">
					Status: {formatInstallStatus(detail.install.status)}
					{detail.install.version
						? ` • Version: ${detail.install.version}`
						: ""}
				</p>
			</div>
		);
	}

	return (
		<div className="mt-5 rounded-[1.5rem] border border-[var(--chip-line)] bg-[var(--chip-bg)] px-4 py-4 text-sm text-[var(--sea-ink)]">
			<p className="m-0 font-semibold">Install step</p>
			<p className="mt-2 mb-0 text-[var(--sea-ink-soft)]">
				This server is ready for the Hermes install flow.
			</p>
		</div>
	);
}

function Banner({
	children,
	className,
	tone,
}: {
	children: ReactNode;
	className?: string;
	tone: "success" | "error";
}) {
	return (
		<div
			className={cn(
				"mt-5 rounded-[1.5rem] border px-4 py-3 text-sm text-[var(--sea-ink)]",
				tone === "success"
					? "border-emerald-500/30 bg-emerald-500/10"
					: "border-red-500/30 bg-red-500/10",
				className,
			)}
		>
			<div className="flex items-center gap-3">
				{tone === "success" ? (
					<CheckCircle2 className="h-5 w-5 text-emerald-600" />
				) : (
					<AlertCircle className="h-5 w-5 text-red-600" />
				)}
				<span>{children}</span>
			</div>
		</div>
	);
}
