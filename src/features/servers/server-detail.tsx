import {
	AlertCircle,
	CheckCircle2,
	LoaderCircle,
	Pencil,
	RefreshCw,
	Rocket,
	RotateCcw,
	ShieldAlert,
	TriangleAlert,
	Wrench,
} from "lucide-react";
import { type ReactNode, useState } from "react";

import { Button } from "@/components/ui/button";
import type {
	ServerActionHistoryItem,
	ServerActionResult,
	ServerActionType,
	ServerDetailSnapshot,
} from "@/lib/server-detail";
import { cn } from "@/lib/utils";

type ServerDetailProps = {
	initialDetail: ServerDetailSnapshot;
	onGoToInstall: (serverId: string) => void | Promise<void>;
	onDetailChange?: (detail: ServerDetailSnapshot) => void;
};

type ActionState = {
	pending: ServerActionType | null;
	error: string | null;
	success: string | null;
	history: ServerActionHistoryItem[];
	rollbackTarget: string | null;
	activeDialog: ServerActionType | null;
};

type BasicsDraft = {
	label: string;
	host: string;
	port: string;
	username: string;
};

type BasicsErrors = Partial<Record<keyof BasicsDraft, string>>;

export function ServerDetail({
	initialDetail,
	onGoToInstall,
	onDetailChange,
}: ServerDetailProps) {
	const [detail, setDetail] = useState(initialDetail);
	const [actionState, setActionState] = useState<ActionState>({
		pending: null,
		error: null,
		success: null,
		history: initialDetail.actionHistory,
		rollbackTarget: initialDetail.rollbackTarget,
		activeDialog: null,
	});
	const [basicsDraft, setBasicsDraft] = useState(() =>
		createBasicsDraft(initialDetail),
	);
	const [basicsErrors, setBasicsErrors] = useState<BasicsErrors>({});
	const [editingField, setEditingField] = useState<keyof BasicsDraft | null>(
		null,
	);
	const [basicsError, setBasicsError] = useState<string | null>(null);
	const [basicsSuccess, setBasicsSuccess] = useState<string | null>(null);
	const [isSavingBasics, setIsSavingBasics] = useState(false);
	const [installError, setInstallError] = useState<string | null>(null);
	const [isStartingInstall, setIsStartingInstall] = useState(false);

	const isEditingBasics = editingField !== null;
	const installButtonLabel = detail.install
		? detail.install.status === "failed"
			? "Retry install"
			: "Open install progress"
		: "Install Hermes";

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
			const response = await fetch(`/api/servers/${detail.server.id}/actions`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					action,
					targetVersion: rollbackTarget,
				}),
			});

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

	function handleBasicsChange(field: keyof BasicsDraft, value: string) {
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

	function startEditing(field: keyof BasicsDraft) {
		setEditingField(field);
		setBasicsError(null);
		setBasicsSuccess(null);
	}

	function cancelEditing() {
		setEditingField(null);
		setBasicsErrors({});
		setBasicsError(null);
		setBasicsDraft(createBasicsDraft(detail));
	}

	async function handleSaveBasics() {
		const nextErrors = validateBasicsDraft(basicsDraft);
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

			setDetail(payload.serverDetail);
			setBasicsDraft(createBasicsDraft(payload.serverDetail));
			setEditingField(null);
			setBasicsErrors({});
			setBasicsSuccess("Server basics updated.");
			onDetailChange?.(payload.serverDetail);
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

					<div className="mt-6 grid gap-5 md:grid-cols-2">
						<ServerBasicsField
							field="label"
							label="Server label"
							value={basicsDraft.label}
							hint="A friendly name like Production VPS or Paris Node."
							error={basicsErrors.label}
							isEditing={isEditingBasics}
							onChange={handleBasicsChange}
							onEdit={startEditing}
						/>
						<ServerBasicsField
							field="host"
							label="Host"
							value={basicsDraft.host}
							hint="Hostname or IP address that HermesHub will reach over SSH."
							error={basicsErrors.host}
							isEditing={isEditingBasics}
							onChange={handleBasicsChange}
							onEdit={startEditing}
						/>
						<ServerBasicsField
							field="port"
							label="Port"
							value={basicsDraft.port}
							hint="Default SSH port is 22."
							error={basicsErrors.port}
							isEditing={isEditingBasics}
							onChange={handleBasicsChange}
							onEdit={startEditing}
						/>
						<ServerBasicsField
							field="username"
							label="Username"
							value={basicsDraft.username}
							hint="The SSH user HermesHub should use during setup."
							error={basicsErrors.username}
							isEditing={isEditingBasics}
							onChange={handleBasicsChange}
							onEdit={startEditing}
						/>
					</div>

					{detail.server.supportLevel === "untested" ? (
						<div className="mt-4 flex items-center gap-2 rounded-[1.5rem] border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700">
							<TriangleAlert className="h-4 w-4 shrink-0" />
							<span>
								This OS is not officially supported. Hermes runs via Docker but
								some features may not work.
							</span>
						</div>
					) : null}

					{detail.install ? (
						<div className="mt-5 rounded-[1.5rem] border border-[var(--chip-line)] bg-[var(--chip-bg)] px-4 py-4 text-sm text-[var(--sea-ink)]">
							<p className="m-0 font-semibold">Latest install</p>
							<p className="mt-2 mb-0 text-[var(--sea-ink-soft)]">
								Status: {formatInstallStatus(detail.install.status)}
								{detail.install.version
									? ` • Version: ${detail.install.version}`
									: ""}
							</p>
						</div>
					) : (
						<div className="mt-5 rounded-[1.5rem] border border-[var(--chip-line)] bg-[var(--chip-bg)] px-4 py-4 text-sm text-[var(--sea-ink)]">
							<p className="m-0 font-semibold">Install step</p>
							<p className="mt-2 mb-0 text-[var(--sea-ink-soft)]">
								This server is ready for the Hermes install flow.
							</p>
						</div>
					)}

					{basicsSuccess ? (
						<Banner tone="success" className="mt-5">
							{basicsSuccess}
						</Banner>
					) : null}
					{basicsError ? (
						<Banner tone="error" className="mt-5">
							{basicsError}
						</Banner>
					) : null}
					{installError ? (
						<Banner tone="error" className="mt-5">
							{installError}
						</Banner>
					) : null}
					{actionState.success ? (
						<Banner tone="success" className="mt-5">
							{actionState.success}
						</Banner>
					) : null}
					{actionState.error ? (
						<Banner tone="error" className="mt-5">
							{actionState.error}
						</Banner>
					) : null}

					{isEditingBasics ? (
						<div className="mt-6 flex flex-wrap gap-3 border-t border-[var(--line)] pt-6">
							<Button
								type="button"
								onClick={() => {
									void handleSaveBasics();
								}}
								disabled={isSavingBasics}
							>
								{isSavingBasics ? (
									<LoaderCircle className="h-4 w-4 animate-spin" />
								) : (
									<CheckCircle2 className="h-4 w-4" />
								)}
								<span>{isSavingBasics ? "Saving..." : "Save changes"}</span>
							</Button>
							<Button
								type="button"
								variant="secondary"
								onClick={cancelEditing}
								disabled={isSavingBasics}
							>
								Cancel
							</Button>
						</div>
					) : null}

					<div className="mt-6 flex flex-wrap gap-3 border-t border-[var(--line)] pt-6">
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
						<p className="island-kicker mb-2">Connection summary</p>
						<dl className="space-y-4 text-sm text-[var(--sea-ink)]">
							<SummaryEntry label="Host" value={detail.server.host} />
							<SummaryEntry label="User" value={detail.server.username} />
							<SummaryEntry
								label="Status"
								value={formatInstallStatus(detail.server.status)}
							/>
							<SummaryEntry label="OS" value={formatOsSummary(detail)} />
						</dl>
					</section>

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

function ServerBasicsField({
	field,
	label,
	value,
	hint,
	error,
	isEditing,
	onChange,
	onEdit,
}: {
	field: keyof BasicsDraft;
	label: string;
	value: string;
	hint: string;
	error?: string;
	isEditing: boolean;
	onChange: (field: keyof BasicsDraft, value: string) => void;
	onEdit: (field: keyof BasicsDraft) => void;
}) {
	return (
		<div className="space-y-2">
			<label
				className="block text-sm font-semibold text-[var(--sea-ink)]"
				htmlFor={field}
			>
				{label}
			</label>
			<div
				className={cn(
					"flex items-center gap-2 rounded-full border bg-white/80 pr-1 pl-4",
					error ? "border-[#b42318]" : "border-[var(--chip-line)]",
				)}
			>
				<input
					id={field}
					name={field}
					type={field === "port" ? "number" : "text"}
					inputMode={field === "port" ? "numeric" : undefined}
					readOnly={!isEditing}
					value={value}
					onChange={(event) => onChange(field, event.currentTarget.value)}
					className="h-11 flex-1 bg-transparent text-sm text-[var(--sea-ink)] outline-none read-only:cursor-default"
				/>
				{isEditing ? null : (
					<button
						type="button"
						onClick={() => onEdit(field)}
						className="inline-flex size-9 items-center justify-center rounded-full border border-transparent text-[var(--sea-ink-soft)] transition hover:border-[var(--chip-line)] hover:bg-white hover:text-[var(--sea-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--lagoon)]"
						aria-label={`Edit ${label}`}
					>
						<Pencil className="h-4 w-4" />
					</button>
				)}
			</div>
			<p
				className={cn(
					"block min-h-5 text-xs",
					error ? "text-[#b42318]" : "text-[var(--sea-ink-soft)]",
				)}
			>
				{error ?? hint}
			</p>
		</div>
	);
}

function SummaryEntry({ label, value }: { label: string; value: string }) {
	return (
		<div>
			<dt className="text-[var(--sea-ink-soft)]">{label}</dt>
			<dd className="mt-1 font-medium">{value}</dd>
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
				"rounded-[1.5rem] border px-4 py-3 text-sm text-[var(--sea-ink)]",
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

function createBasicsDraft(detail: ServerDetailSnapshot): BasicsDraft {
	return {
		label: detail.server.label,
		host: detail.server.host,
		port: String(detail.server.port),
		username: detail.server.username,
	};
}

function validateBasicsDraft(draft: BasicsDraft): BasicsErrors {
	const errors: BasicsErrors = {};

	if (draft.label.trim().length === 0) {
		errors.label = "Enter a label.";
	}

	if (draft.host.trim().length === 0) {
		errors.host = "Enter a hostname or IP address.";
	}

	if (draft.username.trim().length === 0) {
		errors.username = "Enter a username.";
	}

	const port = Number(draft.port);
	if (!Number.isInteger(port) || port < 1 || port > 65535) {
		errors.port = "Port must be between 1 and 65535.";
	}

	return errors;
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

function formatInstallStatus(status: string) {
	return status
		.split(/[-_\s]+/)
		.filter(Boolean)
		.map((part) => part[0]?.toUpperCase() + part.slice(1))
		.join(" ");
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
