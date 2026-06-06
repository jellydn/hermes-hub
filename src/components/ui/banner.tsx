import { AlertCircle, CheckCircle2 } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

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
				{tone === "success" ? (
					<CheckCircle2 className="h-5 w-5 text-emerald-600" />
				) : (
					<AlertCircle className="h-5 w-5 text-red-600" />
				)}
				<span>{children}</span>
			</div>
		</div>
	);
}
