import { CheckCircle2, LoaderCircle, TriangleAlert } from "lucide-react";
import { Button } from "./button";

export type HostKeyError = {
	code: "host_key_missing" | "host_key_mismatch";
	serverId: string;
	serverHost: string;
	observedFingerprint: string;
	observedAlgorithm: string;
	expectedFingerprint?: string;
};

type HostKeyTrustPanelProps = {
	hostKeyError: HostKeyError;
	isAcceptingKey: boolean;
	onTrustAndRetry: () => void;
	onDismiss: () => void;
};

export function HostKeyTrustPanel({
	hostKeyError,
	isAcceptingKey,
	onTrustAndRetry,
	onDismiss,
}: HostKeyTrustPanelProps) {
	return (
		<div className="mt-3 rounded-2xl border border-[var(--alert-warning-line)] bg-[var(--alert-warning-bg)] p-4">
			<div className="flex items-start gap-3">
				<TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-[var(--alert-warning-fg)]" />
				<div className="min-w-0 flex-1">
					<p className="m-0 text-sm font-medium text-[var(--alert-warning-fg)]">
						{hostKeyError.code === "host_key_missing"
							? "Host key not yet trusted"
							: "Host key mismatch"}
					</p>
					<p className="mb-3 mt-1 text-sm text-[var(--sea-ink-soft)]">
						{hostKeyError.code === "host_key_missing" ? (
							<>
								The server{" "}
								<code className="rounded bg-[var(--bg-subtle)] px-1 py-0.5 text-xs">
									{hostKeyError.serverHost}
								</code>{" "}
								has no stored host key. Review the fingerprint below and trust
								it to continue.
							</>
						) : (
							<>
								The fingerprint for{" "}
								<code className="rounded bg-[var(--bg-subtle)] px-1 py-0.5 text-xs">
									{hostKeyError.serverHost}
								</code>{" "}
								does not match the stored key.
							</>
						)}
					</p>

					<div className="mb-4 space-y-1 rounded-xl bg-[var(--bg-subtle)] p-3 font-mono text-xs">
						<div className="flex gap-2">
							<span className="shrink-0 text-[var(--sea-ink-soft)]">
								Fingerprint:
							</span>
							<span className="break-all text-[var(--sea-ink)]">
								{hostKeyError.observedFingerprint}
							</span>
						</div>
						<div className="flex gap-2">
							<span className="shrink-0 text-[var(--sea-ink-soft)]">
								Algorithm:
							</span>
							<span className="text-[var(--sea-ink)]">
								{hostKeyError.observedAlgorithm}
							</span>
						</div>
						{hostKeyError.expectedFingerprint ? (
							<div className="flex gap-2">
								<span className="shrink-0 text-[var(--sea-ink-soft)]">
									Expected:
								</span>
								<span className="break-all text-[var(--sea-ink)]">
									{hostKeyError.expectedFingerprint}
								</span>
							</div>
						) : null}
					</div>

					<div className="flex flex-wrap gap-3">
						<Button
							type="button"
							disabled={isAcceptingKey}
							onClick={onTrustAndRetry}
						>
							{isAcceptingKey ? (
								<LoaderCircle className="h-4 w-4 animate-spin" />
							) : (
								<CheckCircle2 className="h-4 w-4" />
							)}
							<span>
								{isAcceptingKey ? "Trusting..." : "Trust host key and retry"}
							</span>
						</Button>
						<Button
							type="button"
							variant="secondary"
							disabled={isAcceptingKey}
							onClick={onDismiss}
						>
							Cancel
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
}
