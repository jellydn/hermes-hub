export type ServerListSummary = {
	id: string;
	label: string;
	host: string;
	status: string;
	osName: string | null;
	osVersion: string | null;
	supportLevel: "supported" | "untested" | null;
	installStatus: string | null;
	installUpdatedAt: string | null;
	lastActionAt: string | null;
	lastActivityAt: string;
};
