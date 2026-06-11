import {
	ExternalLink,
	Eye,
	EyeOff,
	LoaderCircle,
	Monitor,
	RefreshCw,
	Rocket,
} from "lucide-react";

import { Banner } from "#/components/ui/banner";
import { Button } from "#/components/ui/button";
import { hermesCommunitySiteUrl } from "#/lib/hermes-community";
import type {
	ServerDetailChangeHandler,
	ServerDetailSnapshot,
} from "#/lib/server-detail";

import { useHermesWebUi } from "./use-hermes-web-ui";

type HermesWebUiCardProps = {
	detail: ServerDetailSnapshot;
	onDetailChange?: ServerDetailChangeHandler;
};

export function HermesWebUiCard({
	detail,
	onDetailChange,
}: HermesWebUiCardProps) {
	const webUiState = useHermesWebUi(detail, onDetailChange);

	if (detail.install?.status !== "succeeded") {
		return null;
	}

	const { webUi, isEnabled } = webUiState;
	const isDeploying = webUiState.isDeploying || webUiState.isSubmitting;
	const isFailed =
		webUi?.deployStatus === "failed" && !isEnabled && !isDeploying;
	const deployError = webUi?.deployError;

	return (
		<section
			className="island-shell rounded-[2rem] p-6"
			data-testid="hermes-web-ui-card"
		>
			<div className="flex items-start gap-3">
				<div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] text-[var(--lagoon-deep)]">
					<Monitor className="h-5 w-5" />
				</div>
				<div className="min-w-0 flex-1">
					<p className="island-kicker mb-2">Hermes Web UI</p>
					<p className="m-0 text-sm leading-6 text-[var(--sea-ink-soft)]">
						Use the Hermes Web UI for sessions, chat, workspace files, and tool
						calls. HermesHub deploys it on your VPS and opens it through a
						secure proxy so you never need SSH tunnels. Learn more at{" "}
						<a
							href={hermesCommunitySiteUrl}
							target="_blank"
							rel="noopener noreferrer"
							className="font-semibold text-[var(--sea-ink)] underline decoration-[var(--chip-line)] underline-offset-4"
						>
							get-hermes.ai
						</a>
						.
					</p>

					{isDeploying ? (
						<Banner tone="info" className="mt-4">
							<span className="inline-flex items-center gap-2">
								<LoaderCircle className="h-4 w-4 animate-spin" />
								Setting up Web UI...
							</span>
						</Banner>
					) : null}

					{webUiState.successMessage ? (
						<Banner tone="success" className="mt-4">
							{webUiState.successMessage}
						</Banner>
					) : null}

					{webUiState.error || (isFailed && deployError) ? (
						<Banner tone="error" className="mt-4">
							{webUiState.error ?? deployError}
						</Banner>
					) : null}

					<div className="mt-4 flex flex-wrap gap-3">
						{isEnabled && webUi ? (
							<Button asChild>
								<a
									href={webUi.proxyPath}
									target="_blank"
									rel="noopener noreferrer"
									data-testid="hermes-web-ui-open"
								>
									Open Web UI
									<ExternalLink className="h-4 w-4" />
								</a>
							</Button>
						) : !isDeploying ? (
							<Button
								type="button"
								onClick={() => void webUiState.deploy()}
								disabled={webUiState.isSubmitting}
								data-testid="hermes-web-ui-setup"
							>
								{webUiState.isSubmitting ? (
									<LoaderCircle className="h-4 w-4 animate-spin" />
								) : (
									<Rocket className="h-4 w-4" />
								)}
								<span>{isFailed ? "Retry setup" : "Set up Web UI"}</span>
							</Button>
						) : null}

						{isEnabled ? (
							<Button
								type="button"
								variant="secondary"
								onClick={() => void webUiState.deploy()}
								disabled={isDeploying}
								data-testid="hermes-web-ui-redeploy"
							>
								{isDeploying ? (
									<LoaderCircle className="h-4 w-4 animate-spin" />
								) : (
									<RefreshCw className="h-4 w-4" />
								)}
								<span>
									{isDeploying ? "Redeploying..." : "Redeploy Web UI"}
								</span>
							</Button>
						) : null}

						{isEnabled ? (
							<Button
								type="button"
								variant="secondary"
								onClick={() => void webUiState.revealPassword()}
								disabled={webUiState.isRevealingPassword}
								data-testid="hermes-web-ui-password"
							>
								{webUiState.isRevealingPassword ? (
									<LoaderCircle className="h-4 w-4 animate-spin" />
								) : webUiState.showPassword ? (
									<EyeOff className="h-4 w-4" />
								) : (
									<Eye className="h-4 w-4" />
								)}
								<span>
									{webUiState.isRevealingPassword
										? "Loading..."
										: webUiState.showPassword
											? "Hide password"
											: "Show password"}
								</span>
							</Button>
						) : null}
					</div>

					{isEnabled &&
					webUiState.showPassword &&
					webUiState.revealedPassword ? (
						<div className="mt-4 rounded-[1.25rem] border border-[var(--chip-line)] bg-[var(--chip-bg)] px-4 py-3">
							<p className="m-0 text-xs font-semibold uppercase tracking-wider text-[var(--sea-ink-soft)]">
								Web UI password
							</p>
							<p
								className="mt-2 mb-0 font-mono text-sm text-[var(--sea-ink)]"
								data-testid="hermes-web-ui-password-value"
							>
								{webUiState.revealedPassword}
							</p>
						</div>
					) : null}
				</div>
			</div>
		</section>
	);
}
