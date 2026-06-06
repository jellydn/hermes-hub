export type ServerWebUiDeployStatus =
	| "idle"
	| "deploying"
	| "succeeded"
	| "failed";

export type ServerWebUiSnapshot = {
	enabled: boolean;
	port: number;
	proxyPath: string;
	landingPath: string;
	deployStatus: ServerWebUiDeployStatus;
	deployError: string | null;
	deployStartedAt: string | null;
	updatedAt: string;
};
