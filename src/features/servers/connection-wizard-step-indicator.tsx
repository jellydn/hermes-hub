import { CheckCircle2 } from "lucide-react";

import { cn } from "@/lib/utils";

import { wizardSteps } from "./connection-wizard-types";

export function ConnectionWizardStepIndicator({
	currentStep,
}: {
	currentStep: number;
}) {
	return (
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
	);
}
