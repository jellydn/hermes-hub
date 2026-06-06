import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { StatusIcon } from "./status-icon";

type BannerProps = {
	children: ReactNode;
	className?: string;
	tone: "success" | "error";
};

export function Banner({ children, className, tone }: BannerProps) {
	return (
		<div
			className={cn(
				"mt-5 rounded-[1.5rem] border px-4 py-3 text-sm text-[var(--sea-ink)]",
				tone === "success"
					? "border-emerald-500/30 bg-emerald-500/10"
					: "border-red-500/30 bg-red-500/10",
				className,
			)}
		>
			<div className="flex items-center gap-3">
				<StatusIcon status={tone} size={5} />
				<span>{children}</span>
			</div>
		</div>
	);
}
