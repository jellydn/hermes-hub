import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";

import { ProviderSettings } from "@/features/providers/provider-settings";
import { requireSession } from "@/lib/session";
import { getAuthSession } from "../../server/auth";
import { getCurrentProviderConfig } from "../../server/providers";
import { AppShell } from "./dashboard";

const loadCurrentProviderConfig = createServerFn({ method: "GET" }).handler(
	async () => {
		const session = await getAuthSession(getRequestHeaders());
		if (!session) {
			return null;
		}

		return getCurrentProviderConfig(session.user.id);
	},
);

export const Route = createFileRoute("/ai-provider")({
	beforeLoad: async ({ location }) => {
		const session = await requireSession(location.href);
		const providerConfig = await loadCurrentProviderConfig();

		return { session, providerConfig };
	},
	component: AiProviderPage,
});

function AiProviderPage() {
	const { providerConfig, session } = Route.useRouteContext();

	return (
		<AppShell
			userEmail={session.user.email}
			title="AI Provider"
			description="Choose where Hermes should run, encrypt the API key, and verify the provider before you connect downstream channels."
			kicker="Model Access"
		>
			<ProviderSettings initialConfig={providerConfig ?? null} />
		</AppShell>
	);
}
