import { cn } from "#/lib/utils";

export type AlertTone = "success" | "error" | "warning" | "info";

export function alertPanelClass(tone: AlertTone, className?: string) {
	return cn(
		"alert-panel",
		`alert-panel--${tone}`,
		"px-4 py-3 text-sm",
		className,
	);
}