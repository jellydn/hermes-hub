import { CloudUpload, LoaderCircle, Server } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatAiProviderLabel, usesOAuthDeviceCode } from "@/lib/ai-providers";
import type { TelegramDeployInfo } from "@/lib/load-telegram-deploy";

import type { ProviderSettingsSummary } from "./provider-settings";

type ProviderSettingsAsideProps = {
	savedConfig: ProviderSettingsSummary | null;
	telegramDeploy?: TelegramDeployInfo | null;
	codexAuthenticated: boolean;
	isDeploying: boolean;
	deployError: string | null;
	deployResult: string | null;
	onDeploy: () => void;
};

export function ProviderSettingsAside({
	savedConfig,
	telegramDeploy,
	codexAuthenticated,
	isDeploying,
	deployError,
	deployResult,
	onDeploy,
}: ProviderSettingsAsideProps) {
	const requiresCodexAuth =
		savedConfig?.provider != null && usesOAuthDeviceCode(savedConfig.provider);
	const canDeploy =
		Boolean(savedConfig) &&
		Boolean(telegramDeploy) &&
		(!requiresCodexAuth || codexAuthenticated);

	return (
		<aside className="space-y-4">
			<section className="island-shell rounded-[2rem] p-6">
				<p className="island-kicker mb-2">Current config</p>
				<h3 className="m-0 text-xl font-semibold text-[var(--sea-ink)]">
					{savedConfig
						? formatAiProviderLabel(savedConfig.provider)
						: "No provider connected"}
				</h3>
				<p className="mt-3 mb-0 text-sm text-[var(--sea-ink-soft)]">
					{savedConfig
						? `Model: ${savedConfig.model}`
						: "Save a provider configuration to power Hermes responses."}
				</p>
				{savedConfig?.baseUrl ? (
					<p className="mt-3 mb-0 text-xs text-[var(--sea-ink-soft)] truncate">
						Base URL: {savedConfig.baseUrl}
					</p>
				) : null}
				{savedConfig?.keyLast4 ? (
					<p className="mt-3 mb-0 text-sm text-[var(--sea-ink)]">
						Stored key ending in {savedConfig.keyLast4}
					</p>
				) : null}
			</section>

			<section className="island-shell rounded-[2rem] p-6">
				<p className="island-kicker mb-2">Hermes deployment</p>
				{telegramDeploy ? (
					<>
						<p className="mt-3 mb-0 text-sm text-[var(--sea-ink)]">
							Push your current provider config to the Hermes server.
						</p>
						{savedConfig ? (
							<p className="mt-3 mb-0 text-sm text-[var(--sea-ink-soft)]">
								Model:{" "}
								<span className="font-semibold text-[var(--sea-ink)]">
									{savedConfig.model}
								</span>
							</p>
						) : null}
						{requiresCodexAuth && !codexAuthenticated ? (
							<p className="mt-3 mb-0 text-sm text-[var(--sea-ink-soft)]">
								Complete ChatGPT device-code login before deploying Codex to
								Hermes.
							</p>
						) : null}
						<div className="mt-4">
							<Button
								type="button"
								onClick={onDeploy}
								disabled={isDeploying || !canDeploy}
							>
								{isDeploying ? (
									<LoaderCircle className="h-4 w-4 animate-spin" />
								) : (
									<CloudUpload className="h-4 w-4" />
								)}
								<span>
									{isDeploying ? "Deploying..." : "Deploy to Hermes Server"}
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
					<>
						<p className="mt-3 mb-0 text-sm text-[var(--sea-ink-soft)]">
							Deploy a Telegram bot to a VPS first to enable Hermes deployment.
						</p>
						<div className="mt-4 flex items-center gap-2 text-sm text-[var(--sea-ink-soft)]">
							<Server className="h-4 w-4" />
							<span>Not deployed</span>
						</div>
					</>
				)}
			</section>

			<section className="island-shell rounded-[2rem] p-6">
				<p className="island-kicker mb-2">Model notes</p>
				<ul className="m-0 space-y-2 pl-5 text-sm text-[var(--sea-ink-soft)]">
					<li>OpenAI: gpt-4o, gpt-4o-mini, gpt-4-turbo.</li>
					<li>Anthropic: Sonnet and Haiku variants.</li>
					<li>OpenRouter accepts any model ID.</li>
					<li>Ollama: Run local open-weight models (e.g. llama3).</li>
					<li>Custom: Connect to custom OpenAI-compatible endpoints.</li>
					<li>
						OpenAI Codex: ChatGPT OAuth on the deployed Hermes server; no API
						key in HermesHub.
					</li>
				</ul>
			</section>
		</aside>
	);
}
