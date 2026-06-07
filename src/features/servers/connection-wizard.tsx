import { CheckCircle2, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { type Path, useForm } from "react-hook-form";

import { Button } from "#/components/ui/button";
import { ConnectionWizardAuthStep } from "./connection-wizard-auth-step";
import { ConnectionWizardBasicsStep } from "./connection-wizard-basics-step";
import { ConnectionWizardReviewStep } from "./connection-wizard-review-step";
import { ConnectionWizardStepIndicator } from "./connection-wizard-step-indicator";
import {
	type ConnectionDraft,
	initialDraft,
	isValidHost,
	wizardSteps,
} from "./connection-wizard-types";

type ConnectionWizardProps = {
	onSubmit: (draft: ConnectionDraft) => void | Promise<void>;
	isSubmitting?: boolean;
};

export function ConnectionWizard({
	onSubmit,
	isSubmitting = false,
}: ConnectionWizardProps) {
	const [currentStep, setCurrentStep] = useState(1);

	const {
		register,
		watch,
		setValue,
		setError,
		clearErrors,
		formState: { errors },
	} = useForm<ConnectionDraft>({
		defaultValues: initialDraft,
	});

	const draft = watch();
	const currentStepConfig = wizardSteps[currentStep - 1];

	function handleAuthMethodChange(authMethod: ConnectionDraft["authMethod"]) {
		setValue("authMethod", authMethod);
		setValue("password", authMethod === "password" ? draft.password : "");
		setValue("privateKey", authMethod === "ssh-key" ? draft.privateKey : "");
		clearErrors(["password", "privateKey"]);
	}

	function collectStepErrors(step: number) {
		const stepErrors: Record<string, string> = {};

		if (step === 1) {
			if (!draft.label.trim()) {
				stepErrors.label = "Enter a label so you can recognize this VPS later.";
			}
			if (!draft.host.trim()) {
				stepErrors.host = "Enter a hostname or IP address.";
			} else if (!isValidHost(draft.host)) {
				stepErrors.host = "Use a valid hostname or IP address.";
			}
			if (!draft.port.trim()) {
				stepErrors.port = "Enter the SSH port.";
			} else {
				const numericPort = Number(draft.port);
				if (
					!Number.isInteger(numericPort) ||
					numericPort < 1 ||
					numericPort > 65535
				) {
					stepErrors.port = "Port must be between 1 and 65535.";
				}
			}
			if (!draft.username.trim()) {
				stepErrors.username = "Enter the SSH username.";
			}
		} else if (step === 2) {
			if (draft.authMethod === "password" && !draft.password.trim()) {
				stepErrors.password = "Enter the SSH password.";
			}
			if (draft.authMethod === "ssh-key" && !draft.privateKey.trim()) {
				stepErrors.privateKey = "Paste the private key for this server.";
			}
		}

		return stepErrors;
	}

	function applyStepErrors(stepErrors: Record<string, string>) {
		if (Object.keys(stepErrors).length === 0) {
			return false;
		}

		for (const [key, msg] of Object.entries(stepErrors)) {
			setError(key as Path<ConnectionDraft>, {
				type: "manual",
				message: msg,
			});
		}

		return true;
	}

	function goToNextStep() {
		if (applyStepErrors(collectStepErrors(currentStep))) {
			return;
		}

		clearErrors();
		setCurrentStep((step) => Math.min(step + 1, wizardSteps.length));
	}

	function goToPreviousStep() {
		clearErrors();
		setCurrentStep((step) => Math.max(step - 1, 1));
	}

	async function handleSubmit() {
		const stepErrors = {
			...collectStepErrors(1),
			...collectStepErrors(2),
		};

		if (applyStepErrors(stepErrors)) {
			return;
		}

		clearErrors();
		await onSubmit(draft);
	}

	return (
		<section className="space-y-6">
			<ConnectionWizardStepIndicator currentStep={currentStep} />

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
					<ConnectionWizardBasicsStep errors={errors} register={register} />
				) : null}

				{currentStep === 2 ? (
					<ConnectionWizardAuthStep
						draft={draft}
						errors={errors}
						register={register}
						onAuthMethodChange={handleAuthMethodChange}
					/>
				) : null}

				{currentStep === 3 ? (
					<ConnectionWizardReviewStep draft={draft} />
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
