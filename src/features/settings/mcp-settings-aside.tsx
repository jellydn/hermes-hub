import { CloudUpload, LoaderCircle } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { TelegramDeployInfo } from "@/lib/load-telegram-deploy";
import type { McpServerSummary } from "../../../server/settings/mcp/config";

type McpSettingsAsideProps = {
	servers: McpServerSummary[];
	telegramDeploy?: TelegramDeployInfo | null;
};

export function McpSettingsAside({
	servers,
	telegramDeploy,
}: McpSettingsAsideProps) {
	const [isDeploying, setIsDeploying] = useState(false);
	const [deployError, setDeployError] = useState<string | null>(null);
	const [deployResult, setDeployResult] = useState<string | null>(null);

	const enabledCount = servers.filter((server) => server.enabled).length;

	async function handleDeploy() {
		setIsDeploying(true);
		setDeployError(null);
		setDeployResult(null);

		try {
			const response = await fetch("/api/settings/mcp-servers/deploy", {
				method: "POST",
			});

			const payload = (await response.json().catch(() => null)) as {
				error?: string;
				serverHost?: string;
				serverCount?: number;
				deployedAt?: string;
			} | null;

			if (!response.ok) {
				setDeployError(payload?.error ?? "Deploy failed.");
				return;
			}

			const serverHost =
				payload?.serverHost ?? telegramDeploy?.deployedServerHost ?? "server";
			const deployedAt = payload?.deployedAt
				? new Date(payload.deployedAt).toLocaleString()
				: null;
			const count = payload?.serverCount ?? servers.length;
			setDeployResult(
				deployedAt
					? `Deployed ${count} MCP server${count === 1 ? "" : "s"} to ${serverHost} at ${deployedAt}. Hermes is restarting...`
					: `Deployed ${count} MCP server${count === 1 ? "" : "s"} to ${serverHost}. Hermes is restarting...`,
			);
		} catch {
			setDeployError(
				"Network error. Please check your connection and try again.",
			);
		} finally {
			setIsDeploying(false);
		}
	}

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

			<section className="island-shell rounded-[2rem] p-6">
				<p className="island-kicker mb-2">Hermes deployment</p>
				{telegramDeploy ? (
					<>
						<p className="mt-3 mb-0 text-sm text-[var(--sea-ink)]">
							Push saved MCP settings to the Telegram-deployed Hermes server.
						</p>
						<p className="mt-3 mb-0 text-sm text-[var(--sea-ink-soft)]">
							Target:{" "}
							<span className="font-semibold text-[var(--sea-ink)]">
								{telegramDeploy.deployedServerHost}
							</span>
						</p>
						<div className="mt-4">
							<Button
								type="button"
								onClick={() => void handleDeploy()}
								disabled={isDeploying}
							>
								{isDeploying ? (
									<LoaderCircle className="h-4 w-4 animate-spin" />
								) : (
									<CloudUpload className="h-4 w-4" />
								)}
								<span>
									{isDeploying ? "Deploying..." : "Deploy MCP settings"}
								</span>
							</Button>
						</div>
						{deployError ? (
							<p className="mt-3 mb-0 text-sm text-red-600">{deployError}</p>
						) : null}
						{deployResult ? (
							<p className="mt-3 mb-0 text-sm text-emerald-600">
								{deployResult}
							</p>
						) : null}
					</>
				) : (
					<p className="mt-3 mb-0 text-sm text-[var(--sea-ink-soft)]">
						Deploy a Telegram bot to a VPS first to enable MCP deployment.
					</p>
				)}
			</section>
		</aside>
	);
}
