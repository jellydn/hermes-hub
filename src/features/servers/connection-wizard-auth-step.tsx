import { KeyRound, LockKeyhole } from "lucide-react";
import type { FieldErrors, UseFormRegister } from "react-hook-form";

import { cn } from "@/lib/utils";

import { AuthCard } from "./connection-wizard-auth-card";
import { WizardField } from "./connection-wizard-field";
import {
	type ConnectionDraft,
	inputClassName,
} from "./connection-wizard-types";

type AuthStepProps = {
	draft: ConnectionDraft;
	errors: FieldErrors<ConnectionDraft>;
	register: UseFormRegister<ConnectionDraft>;
	onAuthMethodChange: (authMethod: ConnectionDraft["authMethod"]) => void;
};

export function ConnectionWizardAuthStep({
	draft,
	errors,
	register,
	onAuthMethodChange,
}: AuthStepProps) {
	return (
		<div className="space-y-6">
			<div className="grid gap-4 md:grid-cols-2">
				<AuthCard
					selected={draft.authMethod === "password"}
					icon={LockKeyhole}
					title="Password"
					description="Use a server password for the first connection."
					onSelect={() => onAuthMethodChange("password")}
				/>
				<AuthCard
					selected={draft.authMethod === "ssh-key"}
					icon={KeyRound}
					title="SSH private key"
					description="Paste the PEM or OpenSSH private key used for this host."
					onSelect={() => onAuthMethodChange("ssh-key")}
				/>
			</div>

			{draft.authMethod === "password" ? (
				<WizardField
					label="Server password"
					name="password"
					error={errors.password?.message}
					hint="Used only for the secure SSH verification flow."
				>
					<input
						id="password"
						type="password"
						{...register("password")}
						className={inputClassName}
						placeholder="Enter the SSH password"
					/>
				</WizardField>
			) : (
				<WizardField
					label="Private key"
					name="privateKey"
					error={errors.privateKey?.message}
					hint="Paste the complete private key. HermesHub will validate the connection before storing anything."
				>
					<textarea
						id="privateKey"
						rows={8}
						{...register("privateKey")}
						className={cn(inputClassName, "min-h-44 rounded-[1.5rem] py-4")}
						placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
					/>
				</WizardField>
			)}

			<label className="flex items-start gap-4 rounded-[1.5rem] border border-[var(--chip-line)] bg-[var(--chip-bg)] px-4 py-4 text-sm text-[var(--sea-ink)]">
				<input
					type="checkbox"
					{...register("storeCredential")}
					className="mt-1 h-4 w-4 rounded border-[var(--chip-line)] text-[var(--lagoon-deep)]"
				/>
				<span className="space-y-1">
					<span className="block font-semibold text-[var(--sea-ink)]">
						Save credentials for future operations
					</span>
					<span className="block text-[var(--sea-ink-soft)]">
						Leave this on if HermesHub should reuse the credential for installs,
						restarts, and updates later.
					</span>
				</span>
			</label>
		</div>
	);
}
