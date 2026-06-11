import {
	brandMarkAgentDot,
	brandMarkLetterPath,
	brandMarkShell,
	brandMarkViewBox,
} from "#/lib/brand-mark-graphic";
import { cn } from "#/lib/utils";

const sizeMap = {
	sm: 20,
	lg: 40,
} as const;

type BrandMarkProps = {
	className?: string;
	size?: keyof typeof sizeMap;
};

export function BrandMark({ className, size = "sm" }: BrandMarkProps) {
	const dimension = sizeMap[size];

	return (
		<svg
			className={cn("shrink-0", className)}
			width={dimension}
			height={dimension}
			viewBox={brandMarkViewBox}
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			aria-hidden="true"
		>
			<rect
				x={brandMarkShell.x}
				y={brandMarkShell.y}
				width={brandMarkShell.width}
				height={brandMarkShell.height}
				rx={brandMarkShell.rx}
				fill="var(--lagoon)"
			/>
			<path
				d={brandMarkLetterPath}
				stroke="var(--sea-ink)"
				strokeWidth="3"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<circle
				cx={brandMarkAgentDot.cx}
				cy={brandMarkAgentDot.cy}
				r={brandMarkAgentDot.r}
				fill="var(--sea-ink)"
			/>
		</svg>
	);
}
