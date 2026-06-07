import type { ApiProviderId } from "@/lib/ai-providers";
import type { UserSubscriptionId } from "@/lib/user-subscriptions";

export type DashboardServerSummary = {
	id: string;
	label: string;
	host: string;
	status: string;
	osName: string | null;
	osVersion: string | null;
	supportLevel: "supported" | "untested" | null;
};

export type DashboardAgentSummary = {
	status: "online" | "offline";
	updatedAt: string | null;
	detail: string;
};

export type DashboardVpsSummary = {
	status: "healthy" | "warning" | "disconnected" | "error";
	updatedAt: string | null;
	cpu: number | null;
	memory: number | null;
	disk: number | null;
	uptime: string | null;
	detail: string;
	error: string | null;
};

export type DashboardProviderSummary = {
	status: "connected" | "disconnected";
	provider: ApiProviderId | UserSubscriptionId | null;
	model: string | null;
	detail: string;
};

export type DashboardTelegramSummary = {
	status: "connected" | "disconnected";
	botUsername: string | null;
	detail: string;
};

export type DashboardStatusSnapshot = {
	generatedAt: string;
	server: DashboardServerSummary | null;
	serverCount: number;
	agent: DashboardAgentSummary;
	vps: DashboardVpsSummary;
	provider: DashboardProviderSummary;
	telegram: DashboardTelegramSummary;
};
