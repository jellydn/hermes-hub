import { maskHost } from "#/lib/utils";
import { ReviewCard } from "./connection-wizard-review-card";
import {
	type ConnectionDraft,
	maskSecret,
	summarizePrivateKey,
} from "./connection-wizard-types";

export function ConnectionWizardReviewStep({
	draft,
}: {
	draft: ConnectionDraft;
}) {
	return (
		<div className="space-y-6">
			<div className="grid gap-4 md:grid-cols-2">
				<ReviewCard label="Server label" value={draft.label} />
				<ReviewCard label="Host" value={maskHost(draft.host)} />
				<ReviewCard label="Port" value={draft.port} />
				<ReviewCard label="Username" value={draft.username} />
				<ReviewCard
					label="Authentication"
					value={
						draft.authMethod === "password" ? "Password" : "SSH private key"
					}
				/>
				<ReviewCard
					label="Credential retention"
					value={
						draft.storeCredential
							? "Save for future operations"
							: "Use only for this connection"
					}
				/>
			</div>

			<div className="rounded-[1.75rem] border border-[var(--chip-line)] bg-[var(--chip-bg)] px-5 py-5">
				<p className="island-kicker mb-2">Connection payload</p>
				<p className="mt-0 mb-3 text-sm text-[var(--sea-ink-soft)]">
					The credential itself stays local until you press Connect. The backend
					story will use this same payload to verify SSH access.
				</p>
				<div className="grid gap-3 text-sm text-[var(--sea-ink)] sm:grid-cols-2">
					<div>
						<span className="font-semibold">Credential preview:</span>{" "}
						{draft.authMethod === "password"
							? maskSecret(draft.password)
							: summarizePrivateKey(draft.privateKey)}
					</div>
					<div>
						<span className="font-semibold">Ready action:</span> Connect
					</div>
				</div>
			</div>
		</div>
	);
}
