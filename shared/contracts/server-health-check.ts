export type HealthCheckItemStatus = "healthy" | "warning" | "critical";

export type HealthCheckStatus = "healthy" | "warning" | "critical";

export type HealthCheckItem = {
	label: string;
	status: HealthCheckItemStatus;
	detail: string;
};

export type HealthCheckGroup = {
	label: string;
	items: HealthCheckItem[];
};

export type ServerHealthCheckResult = {
	status: HealthCheckStatus;
	checkedAt: string;
	groups: HealthCheckGroup[];
};
