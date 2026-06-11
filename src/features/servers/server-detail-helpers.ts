import {
	formatActionLabel,
	type ServerActionHistoryItem,
	type ServerActionResult,
	type ServerActionType,
	type ServerDetailSnapshot,
} from "#/lib/server-detail";

export type ServerBasicsDraft = {
	label: string;
	host: string;
	port: string;
	username: string;
};

export type ServerBasicsErrors = Partial<
	Record<keyof ServerBasicsDraft, string>
>;

export const serverBasicsFields = [
	{
		field: "label",
		label: "Server label",
		hint: "A friendly name like Production VPS or Paris Node.",
		type: "text",
		inputMode: undefined,
	},
	{
		field: "host",
		label: "Host",
		hint: "Hostname or IP address that HermesHub will reach over SSH.",
		type: "text",
		inputMode: undefined,
	},
	{
		field: "port",
		label: "Port",
		hint: "Default SSH port is 22.",
		type: "number",
		inputMode: "numeric",
	},
	{
		field: "username",
		label: "Username",
		hint: "The SSH user HermesHub should use during setup.",
		type: "text",
		inputMode: undefined,
	},
] as const satisfies ReadonlyArray<{
	field: keyof ServerBasicsDraft;
	label: string;
	hint: string;
	type: "number" | "text";
	inputMode?: "numeric";
}>;

export function createServerBasicsDraft(
	detail: ServerDetailSnapshot,
): ServerBasicsDraft {
	return {
		label: detail.server.label,
		host: detail.server.host,
		port: String(detail.server.port),
		username: detail.server.username,
	};
}

export function validateServerBasicsDraft(draft: ServerBasicsDraft) {
	const errors: ServerBasicsErrors = {};

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

export function formatOsSummary(detail: ServerDetailSnapshot) {
	const summary = [
		detail.server.osName,
		detail.server.osVersion,
		detail.server.architecture,
	]
		.filter(Boolean)
		.join(" • ");

	return summary || "Verified";
}

const formatActionTitle = formatActionLabel;

export { formatActionTitle };

/** Keep action history readable; full failure output lives in Logs. */
export function formatActionHistorySummary(item: ServerActionHistoryItem) {
	if (item.result === "failed") {
		return `${formatActionTitle(item.action)} failed.`;
	}

	return item.message;
}

export function formatTimestamp(timestamp: string) {
	const parsed = new Date(timestamp);
	if (Number.isNaN(parsed.getTime())) {
		return timestamp;
	}

	return parsed.toLocaleString();
}

export function formatInstallStatus(status: string) {
	return status
		.split(/[-_\s]+/)
		.filter(Boolean)
		.map((part) => part[0]?.toUpperCase() + part.slice(1))
		.join(" ");
}

export function badgeClassName(result: ServerActionHistoryItem["result"]) {
	return result === "succeeded"
		? "inline-flex shrink-0 rounded-full bg-emerald-500/10 p-1.5"
		: "inline-flex shrink-0 rounded-full bg-red-500/10 p-1.5";
}

export function badgeIconType(
	result: ServerActionHistoryItem["result"],
): "success" | "error" {
	return result === "succeeded" ? "success" : "error";
}

export function createHistoryEntry(input: {
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

export function confirmationMessage(
	action: ServerActionType,
	rollbackTarget: string | null,
) {
	if (action === "restart") {
		return "HermesHub will restart the Hermes gateway container on this VPS.";
	}

	if (action === "update") {
		return "HermesHub will pull the latest Hermes gateway image and restart it. The Telegram gateway will be briefly unavailable and active Telegram tasks may be interrupted.";
	}

	return rollbackTarget
		? `HermesHub will redeploy the remembered image tag ${rollbackTarget}.`
		: "HermesHub will attempt to redeploy the latest remembered Hermes image.";
}
