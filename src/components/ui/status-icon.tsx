import {
	AlertCircle,
	CheckCircle2,
	Circle,
	Info,
	TriangleAlert,
} from "lucide-react";
import type { ComponentType } from "react";

type StatusType = "success" | "error" | "warning" | "info" | "neutral";

const ICON_MAP: Record<StatusType, ComponentType<{ className?: string }>> = {
	success: CheckCircle2,
	error: AlertCircle,
	warning: TriangleAlert,
	info: Info,
	neutral: Circle,
};

const COLOR_MAP: Record<StatusType, string> = {
	success: "text-emerald-600",
	error: "text-red-600",
	warning: "text-amber-600",
	info: "text-blue-600",
	neutral: "text-[var(--sea-ink-soft)]",
};

const SIZE_CLASSES: Record<number, string> = {
	3: "h-3 w-3",
	3.5: "h-3.5 w-3.5",
	4: "h-4 w-4",
	5: "h-5 w-5",
	6: "h-6 w-6",
};

type StatusIconProps = {
	status: StatusType;
	className?: string;
	size?: number;
};

export function StatusIcon({ status, className, size = 4 }: StatusIconProps) {
	const Icon = ICON_MAP[status];
	const colorClass = COLOR_MAP[status];
	const sizeClass = SIZE_CLASSES[size] ?? `h-${size} w-${size}`;

	return (
		<Icon
			className={`${colorClass} ${sizeClass} ${className ?? ""}`}
			aria-hidden="true"
		/>
	);
}

export function getStatusTypeFromString(status: string): StatusType {
	const lower = status.toLowerCase();
	if (
		[
			"succeeded",
			"success",
			"online",
			"connected",
			"healthy",
			"ready",
		].includes(lower)
	) {
		return "success";
	}
	if (
		["failed", "error", "offline", "disconnected", "unhealthy"].includes(lower)
	) {
		return "error";
	}
	if (["warning", "watch closely"].includes(lower)) {
		return "warning";
	}
	if (["info", "loading", "pending", "running"].includes(lower)) {
		return "info";
	}
	return "neutral";
}
