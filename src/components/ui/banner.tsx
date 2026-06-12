import type { ReactNode } from "react";

import { cn } from "#/lib/utils";

import { alertPanelClass, type AlertTone } from "./alert-panel-class";
import { StatusIcon } from "./status-icon";

type BannerProps = {
	children: ReactNode;
	className?: string;
	tone: AlertTone;
};

export function Banner({ children, className, tone }: BannerProps) {
	return (
		<div className={alertPanelClass(tone, cn("mt-5", className))}>
			<div className="flex items-center gap-3">
				<StatusIcon status={tone} size={5} />
				<span>{children}</span>
			</div>
		</div>
	);
}