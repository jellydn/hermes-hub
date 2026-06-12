import type { ComponentType, ReactNode } from "react";

import { cn } from "#/lib/utils";

export type FormFeedbackTone = "success" | "error" | "warning";

const TONE_CLASS: Record<FormFeedbackTone, string> = {
	success: "text-[var(--alert-success-fg)]",
	error: "text-[var(--alert-error-fg)]",
	warning: "text-[var(--alert-warning-fg)]",
};

type FormFeedbackProps = {
	children: ReactNode;
	className?: string;
	id?: string;
	LeadingIcon?: ComponentType<{ className?: string }>;
	leadingIconClassName?: string;
	tone: FormFeedbackTone;
};

export function FormFeedback({
	children,
	className = "m-0 text-sm",
	id,
	LeadingIcon,
	leadingIconClassName,
	tone,
}: FormFeedbackProps) {
	if (LeadingIcon) {
		return (
			<div
				className={cn("flex items-start gap-1.5", className, TONE_CLASS[tone])}
				id={id}
			>
				<LeadingIcon className={leadingIconClassName} />
				<span>{children}</span>
			</div>
		);
	}

	return (
		<p className={cn(className, TONE_CLASS[tone])} id={id}>
			{children}
		</p>
	);
}