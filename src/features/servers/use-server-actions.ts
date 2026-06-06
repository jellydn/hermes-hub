import { useState } from "react";

import type {
	ServerActionType,
	ServerDetailChangeHandler,
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
	onDetailChange: ServerDetailChangeHandler,
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

			const successMessage = payload?.message;
			if (!response.ok || !successMessage) {
				setActionState({
					activeDialog: null,
					error: payload?.error ?? "Action failed.",
					pending: null,
					success: null,
				});
				return;
			}

			onDetailChange((current) => ({
				...current,
				actionHistory: [
					createHistoryEntry({
						action,
						result: "succeeded",
						message: successMessage,
						imageRef: payload.imageRef ?? null,
					}),
					...current.actionHistory,
				].slice(0, 5),
				rollbackTarget: payload.imageRef ?? current.rollbackTarget,
			}));
			setActionState({
				activeDialog: null,
				error: null,
				pending: null,
				success: successMessage,
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
