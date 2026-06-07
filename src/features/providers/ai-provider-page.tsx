import { getRouteApi } from "@tanstack/react-router";

import { AppShell } from "#/features/dashboard/app-shell";
import { ProviderSettings } from "#/features/providers/provider-settings";

const aiProviderRouteApi = getRouteApi("/ai-provider");

export function AiProviderPage() {
	const { modelAccess, session, telegramDeploy } =
		aiProviderRouteApi.useRouteContext();

	return (
		<AppShell
			userEmail={session.user.email}
			title="AI Provider"
			description="Connect an API provider or use your ChatGPT subscription, then deploy the active model access to Hermes."
			kicker="Model Access"
		>
			<ProviderSettings
				initialAccess={modelAccess ?? null}
				telegramDeploy={telegramDeploy}
			/>
		</AppShell>
	);
}
