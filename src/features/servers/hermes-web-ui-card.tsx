import {
	ExternalLink,
	Eye,
	EyeOff,
	LoaderCircle,
	Monitor,
	RefreshCw,
	Rocket,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { StatusIcon } from "@/components/ui/status-icon";
import { hermesCommunitySiteUrl } from "@/lib/hermes-community";
import type { ServerDetailSnapshot } from "@/lib/server-detail";

type HermesWebUiCardProps = {
	detail: ServerDetailSnapshot;
	onDetailChange?: (detail: ServerDetailSnapshot) => void;
};

export function HermesWebUiCard({
	detail,
	onDetailChange,
}: HermesWebUiCardProps) {
	const [localWebUi, setLocalWebUi] = useState(detail.webUi);
	const [isDeploying, setIsDeploying] = useState(false);
	const [isRevealingPassword, setIsRevealingPassword] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [successMessage, setSuccessMessage] = useState<string | null>(null);
	const [revealedPassword, setRevealedPassword] = useState<string | null>(null);
	const [showPassword, setShowPassword] = useState(false);

	if (detail.install?.status !== "succeeded") {
		return null;
	}

	const webUi = localWebUi ?? detail.webUi;
	const isEnabled = webUi?.enabled === true;

	async function handleDeploy() {
		setIsDeploying(true);
		setError(null);
		setSuccessMessage(null);

		try {
			const response = await fetch(
				`/api/servers/${detail.server.id}/web-ui/deploy`,
				{ method: "POST" },
			);
			const payload = (await response.json().catch(() => null)) as {
				error?: string;
				webUi?: ServerDetailSnapshot["webUi"];
			} | null;

			if (!response.ok) {
				setError(payload?.error ?? "Web UI setup failed");
				return;
			}

			if (payload?.webUi) {
				setLocalWebUi(payload.webUi);
				onDetailChange?.({
					...detail,
					webUi: payload.webUi,
				});
			}

			setRevealedPassword(null);
			setShowPassword(false);
			setSuccessMessage(
				isEnabled
					? "Hermes Web UI redeployed. Try opening it again."
					: "Hermes Web UI is ready. Open it from HermesHub.",
			);
		} catch {
			setError("Web UI setup failed: Connection failed.");
		} finally {
			setIsDeploying(false);
		}
	}

	async function handleRevealPassword() {
		if (revealedPassword) {
			setShowPassword((current) => !current);
			return;
		}

		setIsRevealingPassword(true);
		setError(null);

		try {
			const response = await fetch(
				`/api/servers/${detail.server.id}/web-ui/password`,
			);
			const payload = (await response.json().catch(() => null)) as {
				error?: string;
				password?: string;
			} | null;

			if (!response.ok) {
				setError(payload?.error ?? "Unable to reveal Web UI password");
				return;
			}

			setRevealedPassword(payload?.password ?? null);
			setShowPassword(true);
		} finally {
			setIsRevealingPassword(false);
		}
	}

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

					{successMessage ? (
						<div className="mt-4 rounded-[1.25rem] border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-[var(--sea-ink)] flex items-center gap-3">
							<StatusIcon status="success" size={4} />
							<span>{successMessage}</span>
						</div>
					) : null}

					{error ? (
						<div className="mt-4 rounded-[1.25rem] border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-[var(--sea-ink)] flex items-center gap-3">
							<StatusIcon status="error" size={4} />
							<span>{error}</span>
						</div>
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
						) : (
							<Button
								type="button"
								onClick={() => void handleDeploy()}
								disabled={isDeploying}
								data-testid="hermes-web-ui-setup"
							>
								{isDeploying ? (
									<LoaderCircle className="h-4 w-4 animate-spin" />
								) : (
									<Rocket className="h-4 w-4" />
								)}
								<span>{isDeploying ? "Setting up..." : "Set up Web UI"}</span>
							</Button>
						)}

						{isEnabled ? (
							<Button
								type="button"
								variant="secondary"
								onClick={() => void handleDeploy()}
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
								onClick={() => void handleRevealPassword()}
								disabled={isRevealingPassword}
								data-testid="hermes-web-ui-password"
							>
								{isRevealingPassword ? (
									<LoaderCircle className="h-4 w-4 animate-spin" />
								) : showPassword ? (
									<EyeOff className="h-4 w-4" />
								) : (
									<Eye className="h-4 w-4" />
								)}
								<span>
									{isRevealingPassword
										? "Loading..."
										: showPassword
											? "Hide password"
											: "Show password"}
								</span>
							</Button>
						) : null}
					</div>

					{isEnabled && showPassword && revealedPassword ? (
						<div className="mt-4 rounded-[1.25rem] border border-[var(--chip-line)] bg-[var(--chip-bg)] px-4 py-3">
							<p className="m-0 text-xs font-semibold uppercase tracking-wider text-[var(--sea-ink-soft)]">
								Web UI password
							</p>
							<p
								className="mt-2 mb-0 font-mono text-sm text-[var(--sea-ink)]"
								data-testid="hermes-web-ui-password-value"
							>
								{revealedPassword}
							</p>
						</div>
					) : null}
				</div>
			</div>
		</section>
	);
}
