import {
	LoaderCircle,
	RefreshCw,
	RotateCcw,
	ShieldAlert,
	Wrench,
} from "lucide-react";

import { alertPanelClass } from "#/components/ui/alert-panel-class";
import { Button } from "#/components/ui/button";
import type { ServerActionType } from "#/lib/server-detail";

import { confirmationMessage } from "./server-detail-helpers";

type ServerActionControlsProps = {
	activeAction: ServerActionType | null;
	pendingAction: ServerActionType | null;
	rollbackTarget: string | null;
	onCancelDialog: () => void;
	onConfirmAction: (action: ServerActionType) => void;
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

			{activeAction ? (
				<div className={alertPanelClass("warning", "mt-5 px-4 py-4")}>
					<div className="flex items-start gap-3">
						<ShieldAlert className="mt-0.5 h-5 w-5 text-[var(--alert-warning-fg)]" />
						<div className="flex-1">
							<p className="m-0 font-semibold">Are you sure?</p>
							<p className="mt-2 mb-0 text-[var(--sea-ink-soft)]">
								{confirmationMessage(activeAction, rollbackTarget)}
							</p>
							<div className="mt-4 flex flex-wrap gap-3">
								<Button
									type="button"
									size="sm"
									onClick={() => onConfirmAction(activeAction)}
								>
									Confirm
								</Button>
								<Button
									type="button"
									size="sm"
									variant="secondary"
									onClick={onCancelDialog}
								>
									Cancel
								</Button>
							</div>
						</div>
					</div>
				</div>
			) : null}
		</>
	);
}
