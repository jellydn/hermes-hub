import {
	CheckCircle2,
	ChevronLeft,
	ChevronRight,
	KeyRound,
	LockKeyhole,
	Server,
	ShieldCheck,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type AuthMethod = "password" | "ssh-key";

type ConnectionDraft = {
	label: string;
	host: string;
	port: string;
	username: string;
	authMethod: AuthMethod;
	password: string;
	privateKey: string;
	storeCredential: boolean;
};

type ValidationErrors = Partial<Record<keyof ConnectionDraft, string>>;

type ConnectionWizardProps = {
	onSubmit: (draft: ConnectionDraft) => void | Promise<void>;
	isSubmitting?: boolean;
};

const wizardSteps = [
	{
		number: 1,
		title: "Server basics",
		description: "Name the machine and point HermesHub at the right host.",
		icon: Server,
	},
	{
		number: 2,
		title: "Authentication",
		description:
			"Choose how HermesHub should sign in and whether to retain the secret.",
		icon: ShieldCheck,
	},
	{
		number: 3,
		title: "Review and connect",
		description:
			"Double-check the details before the backend verifies SSH access.",
		icon: CheckCircle2,
	},
] as const;

const initialDraft: ConnectionDraft = {
	label: "",
	host: "",
	port: "22",
	username: "root",
	authMethod: "password",
	password: "",
	privateKey: "",
	storeCredential: true,
};

export function ConnectionWizard({
	onSubmit,
	isSubmitting = false,
}: ConnectionWizardProps) {
	const [currentStep, setCurrentStep] = useState(1);
	const [draft, setDraft] = useState<ConnectionDraft>(initialDraft);
	const [errors, setErrors] = useState<ValidationErrors>({});

	const currentStepConfig = wizardSteps[currentStep - 1];

	function updateDraft<Key extends keyof ConnectionDraft>(
		field: Key,
		value: ConnectionDraft[Key],
	) {
		setDraft((currentDraft) => ({
			...currentDraft,
			[field]: value,
		}));
		setErrors((currentErrors) => {
			if (!currentErrors[field]) {
				return currentErrors;
			}

			const nextErrors = { ...currentErrors };
			delete nextErrors[field];
			return nextErrors;
		});
	}

	function handleAuthMethodChange(authMethod: AuthMethod) {
		setDraft((currentDraft) => ({
			...currentDraft,
			authMethod,
			password: authMethod === "password" ? currentDraft.password : "",
			privateKey: authMethod === "ssh-key" ? currentDraft.privateKey : "",
		}));
		setErrors((currentErrors) => {
			const nextErrors = { ...currentErrors };
			delete nextErrors.password;
			delete nextErrors.privateKey;
			return nextErrors;
		});
	}

	function goToNextStep() {
		const nextErrors = validateStep(draft, currentStep);
		if (Object.keys(nextErrors).length > 0) {
			setErrors(nextErrors);
			return;
		}

		setErrors({});
		setCurrentStep((step) => Math.min(step + 1, wizardSteps.length));
	}

	function goToPreviousStep() {
		setErrors({});
		setCurrentStep((step) => Math.max(step - 1, 1));
	}

	async function handleSubmit() {
		const nextErrors = validateStep(draft, currentStep);
		if (Object.keys(nextErrors).length > 0) {
			setErrors(nextErrors);
			return;
		}

		setErrors({});
		await onSubmit(draft);
	}

	return (
		<section className="space-y-6">
			<div className="grid gap-3 lg:grid-cols-3">
				{wizardSteps.map(({ description, icon: Icon, number, title }) => {
					const isActive = number === currentStep;
					const isComplete = number < currentStep;

					return (
						<article
							key={number}
							className={cn(
								"island-shell rounded-[1.75rem] p-4",
								isActive && "border-[color:var(--lagoon)]",
							)}
						>
							<div className="flex items-start gap-4">
								<div
									className={cn(
										"mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border text-sm font-semibold",
										isComplete || isActive
											? "border-[color:var(--lagoon)] bg-[rgba(79,184,178,0.16)] text-[var(--lagoon-deep)]"
											: "border-[var(--chip-line)] bg-[var(--chip-bg)] text-[var(--sea-ink-soft)]",
									)}
								>
									{isComplete ? (
										<CheckCircle2 className="h-5 w-5" />
									) : (
										<Icon className="h-5 w-5" />
									)}
								</div>
								<div>
									<p className="island-kicker mb-2">Step {number}</p>
									<h3 className="m-0 text-base font-semibold text-[var(--sea-ink)]">
										{title}
									</h3>
									<p className="mt-2 mb-0 text-sm text-[var(--sea-ink-soft)]">
										{description}
									</p>
								</div>
							</div>
						</article>
					);
				})}
			</div>

			<section className="island-shell rounded-[2rem] p-6 sm:p-8">
				<div className="mb-8 flex flex-col gap-2">
					<p className="island-kicker m-0">Step {currentStep} of 3</p>
					<h3 className="m-0 text-2xl font-semibold text-[var(--sea-ink)]">
						{currentStepConfig.title}
					</h3>
					<p className="m-0 max-w-2xl text-sm text-[var(--sea-ink-soft)] sm:text-base">
						{currentStepConfig.description}
					</p>
				</div>

				{currentStep === 1 ? (
					<div className="grid gap-5 md:grid-cols-2">
						<Field
							label="Server label"
							name="label"
							error={errors.label}
							hint="A friendly name like Production VPS or Paris Node."
						>
							<input
								id="label"
								name="label"
								type="text"
								value={draft.label}
								onChange={(event) =>
									updateDraft("label", event.currentTarget.value)
								}
								className={inputClassName}
								placeholder="Production VPS"
							/>
						</Field>

						<Field
							label="Host"
							name="host"
							error={errors.host}
							hint="Hostname or IP address that HermesHub will reach over SSH."
						>
							<input
								id="host"
								name="host"
								type="text"
								value={draft.host}
								onChange={(event) =>
									updateDraft("host", event.currentTarget.value)
								}
								className={inputClassName}
								placeholder="203.0.113.42"
							/>
						</Field>

						<Field
							label="Port"
							name="port"
							error={errors.port}
							hint="Default SSH port is 22."
						>
							<input
								id="port"
								name="port"
								type="number"
								inputMode="numeric"
								min="1"
								max="65535"
								value={draft.port}
								onChange={(event) =>
									updateDraft("port", event.currentTarget.value)
								}
								className={inputClassName}
							/>
						</Field>

						<Field
							label="Username"
							name="username"
							error={errors.username}
							hint="The SSH user HermesHub should use during setup."
						>
							<input
								id="username"
								name="username"
								type="text"
								value={draft.username}
								onChange={(event) =>
									updateDraft("username", event.currentTarget.value)
								}
								className={inputClassName}
								placeholder="root"
							/>
						</Field>
					</div>
				) : null}

				{currentStep === 2 ? (
					<div className="space-y-6">
						<div className="grid gap-4 md:grid-cols-2">
							<AuthCard
								selected={draft.authMethod === "password"}
								icon={LockKeyhole}
								title="Password"
								description="Use a server password for the first connection."
								onSelect={() => handleAuthMethodChange("password")}
							/>
							<AuthCard
								selected={draft.authMethod === "ssh-key"}
								icon={KeyRound}
								title="SSH private key"
								description="Paste the PEM or OpenSSH private key used for this host."
								onSelect={() => handleAuthMethodChange("ssh-key")}
							/>
						</div>

						{draft.authMethod === "password" ? (
							<Field
								label="Server password"
								name="password"
								error={errors.password}
								hint="Used only for the secure SSH verification flow."
							>
								<input
									id="password"
									name="password"
									type="password"
									value={draft.password}
									onChange={(event) =>
										updateDraft("password", event.currentTarget.value)
									}
									className={inputClassName}
									placeholder="Enter the SSH password"
								/>
							</Field>
						) : (
							<Field
								label="Private key"
								name="privateKey"
								error={errors.privateKey}
								hint="Paste the complete private key. HermesHub will validate the connection before storing anything."
							>
								<textarea
									id="privateKey"
									name="privateKey"
									rows={8}
									value={draft.privateKey}
									onChange={(event) =>
										updateDraft("privateKey", event.currentTarget.value)
									}
									className={cn(
										inputClassName,
										"min-h-44 rounded-[1.5rem] py-4",
									)}
									placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
								/>
							</Field>
						)}

						<label className="flex items-start gap-4 rounded-[1.5rem] border border-[var(--chip-line)] bg-[var(--chip-bg)] px-4 py-4 text-sm text-[var(--sea-ink)]">
							<input
								type="checkbox"
								checked={draft.storeCredential}
								onChange={(event) =>
									updateDraft("storeCredential", event.currentTarget.checked)
								}
								className="mt-1 h-4 w-4 rounded border-[var(--chip-line)] text-[var(--lagoon-deep)]"
							/>
							<span className="space-y-1">
								<span className="block font-semibold text-[var(--sea-ink)]">
									Save credentials for future operations
								</span>
								<span className="block text-[var(--sea-ink-soft)]">
									Leave this on if HermesHub should reuse the credential for
									installs, restarts, and updates later.
								</span>
							</span>
						</label>
					</div>
				) : null}

				{currentStep === 3 ? (
					<div className="space-y-6">
						<div className="grid gap-4 md:grid-cols-2">
							<ReviewCard label="Server label" value={draft.label} />
							<ReviewCard label="Host" value={draft.host} />
							<ReviewCard label="Port" value={draft.port} />
							<ReviewCard label="Username" value={draft.username} />
							<ReviewCard
								label="Authentication"
								value={
									draft.authMethod === "password"
										? "Password"
										: "SSH private key"
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
								The credential itself stays local until you press Connect. The
								backend story will use this same payload to verify SSH access.
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
				) : null}

				<div className="mt-8 flex flex-col gap-3 border-t border-[var(--line)] pt-6 sm:flex-row sm:items-center sm:justify-between">
					<Button
						type="button"
						variant="secondary"
						onClick={goToPreviousStep}
						disabled={currentStep === 1 || isSubmitting}
					>
						<ChevronLeft className="h-4 w-4" />
						<span>Back</span>
					</Button>

					{currentStep < wizardSteps.length ? (
						<Button
							type="button"
							onClick={goToNextStep}
							disabled={isSubmitting}
						>
							<span>Next</span>
							<ChevronRight className="h-4 w-4" />
						</Button>
					) : (
						<Button
							type="button"
							onClick={() => {
								void handleSubmit();
							}}
							disabled={isSubmitting}
						>
							<span>{isSubmitting ? "Connecting..." : "Connect"}</span>
							<CheckCircle2 className="h-4 w-4" />
						</Button>
					)}
				</div>
			</section>
		</section>
	);
}

function Field({
	children,
	error,
	hint,
	label,
	name,
}: {
	children: React.ReactNode;
	error?: string;
	hint: string;
	label: string;
	name: string;
}) {
	const messageId = `${name}-${error ? "error" : "hint"}`;

	return (
		<div className="space-y-2">
			<label
				className="block text-sm font-semibold text-[var(--sea-ink)]"
				htmlFor={name}
			>
				{label}
			</label>
			{children}
			<p
				id={messageId}
				className={cn(
					"block min-h-5 text-xs",
					error ? "text-[#b42318]" : "text-[var(--sea-ink-soft)]",
				)}
			>
				{error ?? hint}
			</p>
		</div>
	);
}

function AuthCard({
	description,
	icon: Icon,
	onSelect,
	selected,
	title,
}: {
	description: string;
	icon: typeof LockKeyhole;
	onSelect: () => void;
	selected: boolean;
	title: string;
}) {
	return (
		<button
			type="button"
			onClick={onSelect}
			className={cn(
				"rounded-[1.75rem] border p-5 text-left",
				selected
					? "border-[color:var(--lagoon)] bg-[rgba(79,184,178,0.14)]"
					: "border-[var(--chip-line)] bg-[var(--chip-bg)]",
			)}
		>
			<div className="mb-4 inline-flex rounded-2xl border border-[var(--chip-line)] bg-white/70 p-3 text-[var(--lagoon-deep)]">
				<Icon className="h-5 w-5" />
			</div>
			<div className="space-y-2">
				<div className="flex items-center justify-between gap-3">
					<h4 className="m-0 text-base font-semibold text-[var(--sea-ink)]">
						{title}
					</h4>
					<span
						className={cn(
							"rounded-full px-3 py-1 text-xs font-semibold",
							selected
								? "bg-[rgba(79,184,178,0.2)] text-[var(--lagoon-deep)]"
								: "bg-white/70 text-[var(--sea-ink-soft)]",
						)}
					>
						{selected ? "Selected" : "Choose"}
					</span>
				</div>
				<p className="m-0 text-sm text-[var(--sea-ink-soft)]">{description}</p>
			</div>
		</button>
	);
}

function ReviewCard({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded-[1.5rem] border border-[var(--chip-line)] bg-[var(--chip-bg)] px-4 py-4">
			<p className="island-kicker mb-2">{label}</p>
			<p className="m-0 text-sm font-semibold text-[var(--sea-ink)]">{value}</p>
		</div>
	);
}

const inputClassName =
	"w-full rounded-full border border-[var(--chip-line)] bg-white/80 px-4 py-3 text-sm text-[var(--sea-ink)] outline-none focus:border-[color:var(--lagoon)] focus:ring-2 focus:ring-[rgba(79,184,178,0.18)]";

function validateStep(draft: ConnectionDraft, step: number): ValidationErrors {
	const errors: ValidationErrors = {};

	if (step === 1 || step === 3) {
		if (!draft.label.trim()) {
			errors.label = "Enter a label so you can recognize this VPS later.";
		}

		if (!draft.host.trim()) {
			errors.host = "Enter a hostname or IP address.";
		} else if (!isValidHost(draft.host)) {
			errors.host = "Use a valid hostname or IP address.";
		}

		if (!draft.port.trim()) {
			errors.port = "Enter the SSH port.";
		} else {
			const numericPort = Number(draft.port);
			if (
				!Number.isInteger(numericPort) ||
				numericPort < 1 ||
				numericPort > 65535
			) {
				errors.port = "Port must be between 1 and 65535.";
			}
		}

		if (!draft.username.trim()) {
			errors.username = "Enter the SSH username.";
		}
	}

	if (step === 2 || step === 3) {
		if (draft.authMethod === "password" && !draft.password.trim()) {
			errors.password = "Enter the SSH password.";
		}

		if (draft.authMethod === "ssh-key" && !draft.privateKey.trim()) {
			errors.privateKey = "Paste the private key for this server.";
		}
	}

	return errors;
}

function isValidHost(host: string) {
	const trimmedHost = host.trim();
	if (!trimmedHost || /\s/.test(trimmedHost)) {
		return false;
	}

	const ipv4Pattern =
		/^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
	const hostnamePattern =
		/^(?=.{1,253}$)(?!-)([a-zA-Z0-9-]{1,63}\.)*[a-zA-Z0-9-]{1,63}$/;
	const ipv6Pattern = /^[0-9a-fA-F:]+$/;

	return (
		ipv4Pattern.test(trimmedHost) ||
		hostnamePattern.test(trimmedHost) ||
		(trimmedHost.includes(":") && ipv6Pattern.test(trimmedHost))
	);
}

function maskSecret(value: string) {
	if (!value) {
		return "Not provided";
	}

	return "*".repeat(Math.min(Math.max(value.length, 8), 14));
}

function summarizePrivateKey(value: string) {
	if (!value.trim()) {
		return "No private key provided";
	}

	const firstLine = value.trim().split("\n")[0] ?? "Private key pasted";
	return firstLine.length > 48 ? `${firstLine.slice(0, 45)}...` : firstLine;
}
