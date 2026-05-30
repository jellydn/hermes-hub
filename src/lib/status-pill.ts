import { cn } from "./utils";

export const STATUS_TYPE_MAP: Record<string, "success" | "warning" | "error"> =
	{
		online: "success",
		connected: "success",
		healthy: "success",
		warning: "warning",
		offline: "error",
		disconnected: "error",
		unhealthy: "error",
	};

export function getStatusPillClassName(status: string) {
	const type = STATUS_TYPE_MAP[status] ?? "error";
	return cn("status-pill", `status-pill--${type}`);
}
