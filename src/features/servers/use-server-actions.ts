import { useState } from "react";

import type {
	ServerActionType,
	ServerDetailSnapshot,
} from "@/lib/server-detail";

import { createHistoryEntry } from "./server-detail-helpers";

type ActionState = {
	activeDialog: ServerActionType | null;
	error: string | null;
	pending: ServerActionType | null;
	success: string | null;
};

export function useServerActions(
	detail: ServerDetailSnapshot,
	onDetailChange: (detail: ServerDetailSnapshot) => void,
) {
	const [actionState, setActionState] = useState<ActionState>({
		activeDialog: null,
		error: null,
		pending: null,
		success: null,
	});

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

	return {
		actionState,
		cancelDialog: () => {
			setActionState((current) => ({
				...current,
				activeDialog: null,
			}));
		},
		confirmAction: (action: ServerActionType) => {
			void handleAction(action);
		},
		openDialog: (action: ServerActionType) => {
			setActionState((current) => ({
				...current,
				activeDialog: action,
			}));
		},
	};
}
