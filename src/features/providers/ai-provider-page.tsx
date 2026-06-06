import { getRouteApi } from "@tanstack/react-router";

import { AppShell } from "@/features/dashboard/app-shell";
import { ProviderSettings } from "@/features/providers/provider-settings";

const aiProviderRouteApi = getRouteApi("/ai-provider");

export function AiProviderPage() {
	const { providerConfig, session, telegramDeploy } =
		aiProviderRouteApi.useRouteContext();

	return (
		<AppShell
			userEmail={session.user.email}
			title="AI Provider"
			description="Choose where Hermes should run, encrypt the API key, and verify the provider before you connect downstream channels."
			kicker="Model Access"
		>
			<ProviderSettings
				initialConfig={providerConfig ?? null}
				telegramDeploy={telegramDeploy}
			/>
		</AppShell>
	);
}
