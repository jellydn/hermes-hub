import { ExternalLink, KeyRound, LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { CodexAuthStatus } from "../../../shared/contracts/codex-auth";

import type { CodexAuthPanelState } from "./codex-auth-panel-state";

type CodexAuthStatusSectionProps = {
	status: CodexAuthStatus | null;
	isLoadingStatus: boolean;
	statusError: string | null;
	isStarting: boolean;
	isCompleting: boolean;
	onStartAuth: () => void;
	onRefreshStatus: () => void;
};

export function CodexAuthStatusSection({
	status,
	isLoadingStatus,
	statusError,
	isStarting,
	isCompleting,
	onStartAuth,
	onRefreshStatus,
}: CodexAuthStatusSectionProps) {
	return (
		<>
			{status?.authenticated ? (
				<p className="mt-3 mb-0 text-sm text-emerald-600">
					Codex is authenticated on{" "}
					{status.serverHost ?? "your deployed server"}.
				</p>
			) : (
				<p className="mt-3 mb-0 text-sm text-[var(--sea-ink-soft)]">
					{isLoadingStatus
						? "Checking remote Codex auth status..."
						: "Codex is not authenticated on the deployed Hermes server yet."}
				</p>
			)}

			{statusError ? (
				<p className="mt-3 mb-0 text-sm text-red-600">{statusError}</p>
			) : null}

			<div className="mt-4 flex flex-wrap gap-3">
				<Button
					type="button"
					onClick={onStartAuth}
					disabled={isStarting || isCompleting}
				>
					{isStarting ? (
						<LoaderCircle className="h-4 w-4 animate-spin" />
					) : (
						<KeyRound className="h-4 w-4" />
					)}
					<span>{isStarting ? "Starting..." : "Start ChatGPT Login"}</span>
				</Button>
				<Button
					type="button"
					variant="secondary"
					onClick={onRefreshStatus}
					disabled={isLoadingStatus}
				>
					{isLoadingStatus ? (
						<LoaderCircle className="h-4 w-4 animate-spin" />
					) : null}
					<span>Refresh Status</span>
				</Button>
			</div>
		</>
	);
}

type CodexAuthDeviceCodeSectionProps = {
	state: CodexAuthPanelState;
	onPollUntilAuthenticated: () => void;
};

export function CodexAuthDeviceCodeSection({
	state,
	onPollUntilAuthenticated,
}: CodexAuthDeviceCodeSectionProps) {
	if (!state.userCode || !state.verificationUrl) {
		return null;
	}

	return (
		<div className="mt-4 space-y-3 rounded-[1.25rem] border border-[var(--chip-line)] bg-white/70 px-4 py-4 text-sm text-[var(--sea-ink)]">
			<p className="m-0">
				1. Open{" "}
				<a
					href={state.verificationUrl}
					target="_blank"
					rel="noreferrer"
					className="inline-flex items-center gap-1 font-medium text-[var(--lagoon-deep)]"
				>
					{state.verificationUrl}
					<ExternalLink className="h-4 w-4" />
				</a>
			</p>
			<p className="m-0">
				2. Enter this one-time code:{" "}
				<span className="font-semibold tracking-[0.2em]">{state.userCode}</span>
			</p>
			<Button
				type="button"
				onClick={onPollUntilAuthenticated}
				disabled={state.isCompleting}
			>
				{state.isCompleting ? (
					<LoaderCircle className="h-4 w-4 animate-spin" />
				) : null}
				<span>
					{state.isCompleting
						? "Waiting for approval..."
						: "I entered the code"}
				</span>
			</Button>
		</div>
	);
}
