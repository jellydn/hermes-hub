import type { ComponentType, ReactNode } from "react";

import { cn } from "#/lib/utils";

import { type AlertTone, alertPanelClass } from "./alert-panel-class";
import { StatusIcon } from "./status-icon";

export type { AlertTone } from "./alert-panel-class";

type AlertPanelProps = {
	children: ReactNode;
	className?: string;
	LeadingIcon?: ComponentType<{ className?: string }>;
	leadingIconClassName?: string;
	tone: AlertTone;
	withStatusIcon?: boolean;
};

export function AlertPanel({
	children,
	className,
	LeadingIcon,
	leadingIconClassName,
	tone,
	withStatusIcon = false,
}: AlertPanelProps) {
	const hasLeading = withStatusIcon || LeadingIcon !== undefined;

	if (!hasLeading) {
		return <div className={alertPanelClass(tone, className)}>{children}</div>;
	}

	return (
		<div className={alertPanelClass(tone, className)}>
			<div className="flex items-center gap-3">
				{withStatusIcon ? <StatusIcon status={tone} size={5} /> : null}
				{LeadingIcon ? (
					<LeadingIcon
						className={cn("h-5 w-5 shrink-0", leadingIconClassName)}
					/>
				) : null}
				<div className="min-w-0 flex-1">{children}</div>
			</div>
		</div>
	);
}
