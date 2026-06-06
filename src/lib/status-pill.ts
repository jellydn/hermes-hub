import { cn } from "./utils";

export type StatusPillType = "success" | "warning" | "error";

const STATUS_TYPE_MAP: Record<string, StatusPillType> = {
	online: "success",
	connected: "success",
	healthy: "success",
	warning: "warning",
	offline: "error",
	disconnected: "error",
	unhealthy: "error",
};

export function getStatusPillType(status: string): StatusPillType {
	return STATUS_TYPE_MAP[status] ?? "error";
}

export function getStatusPillClassName(status: string) {
	const type = getStatusPillType(status);
	return cn("status-pill", `status-pill--${type}`);
}
