import { Link } from "@tanstack/react-router";
import {
	ArrowLeft,
	LoaderCircle,
	Rocket,
	Trash2,
	TriangleAlert,
} from "lucide-react";
import { useState } from "react";

import { AlertPanel } from "#/components/ui/alert-panel";
import { Banner } from "#/components/ui/banner";
import { Button } from "#/components/ui/button";
import type {
	ServerDetailChangeHandler,
	ServerDetailSnapshot,
} from "#/lib/server-detail";

import { DeleteServerDialog } from "./delete-server-dialog";
import { InstallLogCard } from "./install-log-card";
import { ServerActionControls } from "./server-action-controls";
import { ServerBasicsForm } from "./server-basics-form";
import { ServerDetailAside } from "./server-detail-aside";
import { ServerHealthCheckPanel } from "./server-health-check-results";
import { useServerActions } from "./use-server-actions";
import { useServerBasics } from "./use-server-basics";
import { useServerHealthCheck } from "./use-server-health-check";

type ServerDetailProps = {
	detail: ServerDetailSnapshot;
	onDetailChange: ServerDetailChangeHandler;
	onGoToInstall: (serverId: string) => void | Promise<void>;
	onDeleted: () => void;
};

export function ServerDetail({
	detail,
	onDetailChange,
	onGoToInstall,
	onDeleted,
}: ServerDetailProps) {
	const basics = useServerBasics(detail, onDetailChange);
	const actions = useServerActions(detail, onDetailChange);
	const healthCheck = useServerHealthCheck(detail.server.id);
	const [installError, setInstallError] = useState<string | null>(null);
	const [isStartingInstall, setIsStartingInstall] = useState(false);
	const [showDeleteDialog, setShowDeleteDialog] = useState(false);

	const installButtonLabel = detail.install
		? detail.install.status === "failed"
			? "Retry install"
			: "Open install progress"
		: "Install Hermes";

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
						draft={basics.draft}
						errors={basics.errors}
						isEditing={basics.isEditing}
						isSaving={basics.isSaving}
						onCancel={basics.cancelEditing}
						onChange={basics.handleChange}
						onSave={() => {
							void basics.save();
						}}
						onStartEditing={basics.startEditing}
					/>

					{detail.server.supportLevel === "untested" ? (
						<AlertPanel
							tone="warning"
							className="mt-4"
							LeadingIcon={TriangleAlert}
							leadingIconClassName="h-4 w-4 shrink-0"
						>
							This OS is not officially supported. Hermes runs via Docker but
							some features may not work.
						</AlertPanel>
					) : null}

					<InstallLogCard
						serverId={detail.server.id}
						install={detail.install}
					/>
					{basics.success ? (
						<Banner tone="success">{basics.success}</Banner>
					) : null}
					{basics.error ? <Banner tone="error">{basics.error}</Banner> : null}
					{installError ? <Banner tone="error">{installError}</Banner> : null}
					{actions.actionState.success ? (
						<Banner tone="success">{actions.actionState.success}</Banner>
					) : null}
					{actions.actionState.error ? (
						<Banner tone="error">{actions.actionState.error}</Banner>
					) : null}

					<ServerActionControls
						activeAction={actions.actionState.activeDialog}
						pendingAction={actions.actionState.pending}
						rollbackTarget={detail.rollbackTarget}
						onCancelDialog={actions.cancelDialog}
						onConfirmAction={actions.confirmAction}
						onOpenDialog={actions.openDialog}
					/>

					<ServerHealthCheckPanel
						error={healthCheck.healthCheckState.error}
						pending={healthCheck.healthCheckState.pending}
						result={healthCheck.healthCheckState.result}
						onRunHealthCheck={healthCheck.runHealthCheck}
					/>

					<div className="mt-6 border-t border-[var(--line)] pt-6">
						<p className="m-0 text-xs font-semibold uppercase tracking-wider text-[var(--alert-error-fg)]">
							Danger zone
						</p>
						<p className="mt-2 mb-0 text-sm text-[var(--sea-ink-soft)]">
							Permanently delete this server and all related data. This action
							cannot be undone.
						</p>
						<Button
							type="button"
							variant="destructive"
							className="mt-4"
							onClick={() => setShowDeleteDialog(true)}
						>
							<Trash2 className="h-4 w-4" />
							<span>Delete server</span>
						</Button>
					</div>

					{showDeleteDialog ? (
						<DeleteServerDialog
							serverId={detail.server.id}
							serverLabel={detail.server.label}
							onCancel={() => setShowDeleteDialog(false)}
							onDeleted={onDeleted}
						/>
					) : null}
				</section>

				<ServerDetailAside detail={detail} onDetailChange={onDetailChange} />
			</div>
		</section>
	);
}
