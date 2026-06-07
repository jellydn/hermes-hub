import type { ModelAccessSnapshot } from "#shared/contracts/model-access";

export type ProviderAccessTab = "subscription" | "api";

export function resolveInitialProviderAccessTab(
	activeBackend: ModelAccessSnapshot["activeBackend"],
): ProviderAccessTab {
	return activeBackend === "api-provider" ? "api" : "subscription";
}
