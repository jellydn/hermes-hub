import { LoaderCircle, ShieldAlert, Trash2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

type DeleteServerDialogProps = {
	serverId: string;
	serverLabel: string;
	onCancel: () => void;
	onDeleted: () => void;
};

export function DeleteServerDialog({
	serverId,
	serverLabel,
	onCancel,
	onDeleted,
}: DeleteServerDialogProps) {
	const [confirmLabel, setConfirmLabel] = useState("");
	const [isDeleting, setIsDeleting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function handleDelete() {
		if (confirmLabel !== serverLabel) {
			return;
		}

		setIsDeleting(true);
		setError(null);

		try {
			const response = await fetch(`/api/servers/${serverId}`, {
				method: "DELETE",
			});
			const payload = (await response.json().catch(() => null)) as {
				error?: string;
			} | null;

			if (!response.ok) {
				setError(payload?.error ?? "Failed to delete server.");
				setIsDeleting(false);
				return;
			}

			onDeleted();
		} catch {
			setError("Failed to delete server.");
			setIsDeleting(false);
		}
	}

	return (
		<div className="mt-5 rounded-[1.5rem] border border-red-500/30 bg-red-500/10 px-4 py-4 text-sm text-[var(--sea-ink)]">
			<div className="flex items-start gap-3">
				<ShieldAlert className="mt-0.5 h-5 w-5 text-red-600" />
				<div className="flex-1">
					<p className="m-0 font-semibold">
						Are you sure you want to delete this server?
					</p>
					<p className="mt-2 mb-0 text-[var(--sea-ink-soft)]">
						This will permanently delete "{serverLabel}" and all related
						installs, logs, and audit records. Type the server label to confirm.
					</p>
					<label
						htmlFor={`delete-confirm-${serverId}`}
						className="mt-3 block text-sm font-medium text-[var(--sea-ink)]"
					>
						Confirm server label
					</label>
					<input
						id={`delete-confirm-${serverId}`}
						type="text"
						value={confirmLabel}
						onChange={(e) => setConfirmLabel(e.target.value)}
						placeholder={serverLabel}
						aria-label="Confirm server label"
						className="mt-1 w-full rounded-[1rem] border border-[var(--chip-line)] bg-[var(--chip-bg)] px-3 py-2 text-sm text-[var(--sea-ink)] placeholder:text-[var(--sea-ink-soft)]"
					/>
					{error ? (
						<p className="mt-2 mb-0 text-xs text-red-600">{error}</p>
					) : null}
					<div className="mt-4 flex flex-wrap gap-3">
						<Button
							type="button"
							size="sm"
							variant="destructive"
							disabled={confirmLabel !== serverLabel || isDeleting}
							onClick={() => {
								void handleDelete();
							}}
						>
							{isDeleting ? (
								<LoaderCircle className="h-4 w-4 animate-spin" />
							) : (
								<Trash2 className="h-4 w-4" />
							)}
							<span>{isDeleting ? "Deleting..." : "Confirm delete"}</span>
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
