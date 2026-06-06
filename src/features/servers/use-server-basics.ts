import { useState } from "react";

import type { ServerDetailSnapshot } from "@/lib/server-detail";

import {
	createServerBasicsDraft,
	type ServerBasicsDraft,
	type ServerBasicsErrors,
	validateServerBasicsDraft,
} from "./server-detail-helpers";

export function useServerBasics(
	detail: ServerDetailSnapshot,
	onDetailChange: (detail: ServerDetailSnapshot) => void,
) {
	const [draft, setDraft] = useState<ServerBasicsDraft>(() =>
		createServerBasicsDraft(detail),
	);
	const [errors, setErrors] = useState<ServerBasicsErrors>({});
	const [isEditing, setIsEditing] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState<string | null>(null);
	const [isSaving, setIsSaving] = useState(false);

	function handleChange(field: keyof ServerBasicsDraft, value: string) {
		setDraft((current) => ({
			...current,
			[field]: value,
		}));
		setErrors((current) => {
			if (!current[field]) {
				return current;
			}

			const nextErrors = { ...current };
			delete nextErrors[field];
			return nextErrors;
		});
	}

	function startEditing() {
		setIsEditing(true);
		setError(null);
		setSuccess(null);
		setDraft(createServerBasicsDraft(detail));
	}

	function cancelEditing() {
		setIsEditing(false);
		setErrors({});
		setError(null);
		setSuccess(null);
		setDraft(createServerBasicsDraft(detail));
	}

	async function save() {
		const nextErrors = validateServerBasicsDraft(draft);
		if (Object.keys(nextErrors).length > 0) {
			setErrors(nextErrors);
			return;
		}

		setIsSaving(true);
		setError(null);
		setSuccess(null);

		try {
			const response = await fetch(`/api/servers/${detail.server.id}`, {
				method: "PATCH",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					label: draft.label.trim(),
					host: draft.host.trim(),
					port: Number(draft.port),
					username: draft.username.trim(),
				}),
			});
			const payload = (await response.json().catch(() => null)) as {
				error?: string;
				serverDetail?: ServerDetailSnapshot;
			} | null;

			if (!response.ok || !payload?.serverDetail) {
				setError(payload?.error ?? "Unable to update this server.");
				return;
			}

			onDetailChange(payload.serverDetail);
			setDraft(createServerBasicsDraft(payload.serverDetail));
			setErrors({});
			setSuccess("Server basics updated.");
			setIsEditing(false);
		} catch {
			setError("Unable to update this server.");
		} finally {
			setIsSaving(false);
		}
	}

	return {
		draft,
		errors,
		isEditing,
		error,
		success,
		isSaving,
		handleChange,
		startEditing,
		cancelEditing,
		save,
	};
}
