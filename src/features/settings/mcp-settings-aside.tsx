import type { TelegramDeployInfo } from "@/lib/load-telegram-deploy";
import type { McpServerSummary } from "../../../server/settings/mcp/config";
import { HermesDeployPanel } from "./hermes-deploy-panel";

type McpSettingsAsideProps = {
	servers: McpServerSummary[];
	telegramDeploy?: TelegramDeployInfo | null;
};

export function McpSettingsAside({
	servers,
	telegramDeploy,
}: McpSettingsAsideProps) {
	const enabledCount = servers.filter((server) => server.enabled).length;

	return (
		<aside className="space-y-4">
			<section className="island-shell rounded-[2rem] p-6">
				<p className="island-kicker mb-2">Saved state</p>
				<h3 className="m-0 text-xl font-semibold text-[var(--sea-ink)]">
					{servers.length > 0
						? `${servers.length} MCP server${servers.length === 1 ? "" : "s"} saved`
						: "No MCP servers saved"}
				</h3>
				{servers.length > 0 ? (
					<p className="mt-3 mb-0 text-sm text-[var(--sea-ink-soft)]">
						{enabledCount} enabled, {servers.length - enabledCount} disabled.
						Changes apply on the VPS after deploy.
					</p>
				) : (
					<p className="mt-3 mb-0 text-sm text-[var(--sea-ink-soft)]">
						Add MCP servers here, then deploy to your Hermes VPS.
					</p>
				)}
			</section>

			<HermesDeployPanel
				telegramDeploy={telegramDeploy}
				description="Push saved MCP settings to the Telegram-deployed Hermes server."
				deployUrl="/api/settings/mcp-servers/deploy"
				buttonLabel="Deploy MCP settings"
				deployingLabel="Deploying..."
				noDeploymentMessage="Deploy a Telegram bot to a VPS first to enable MCP deployment."
				formatSuccess={(payload, serverHost) => {
					const deployedAt = payload.deployedAt
						? new Date(payload.deployedAt).toLocaleString()
						: null;
					const count = payload.serverCount ?? servers.length;

					return deployedAt
						? `Deployed ${count} MCP server${count === 1 ? "" : "s"} to ${serverHost} at ${deployedAt}. Hermes is restarting...`
						: `Deployed ${count} MCP server${count === 1 ? "" : "s"} to ${serverHost}. Hermes is restarting...`;
				}}
			/>
		</aside>
	);
}
