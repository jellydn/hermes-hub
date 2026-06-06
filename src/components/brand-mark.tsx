import { cn } from "@/lib/utils";

const sizeMap = {
	sm: 20,
	md: 28,
	lg: 40,
} as const;

type BrandMarkProps = {
	className?: string;
	size?: keyof typeof sizeMap;
};

export function BrandMark({ className, size = "md" }: BrandMarkProps) {
	const dimension = sizeMap[size];

	return (
		<svg
			className={cn("shrink-0", className)}
			width={dimension}
			height={dimension}
			viewBox="0 0 40 40"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			aria-hidden="true"
		>
			<rect x="6" y="14" width="28" height="22" rx="9" fill="var(--lagoon)" />
			<path
				d="M14 20V30M26 20V30M14 20H26M14 25H26"
				stroke="var(--sea-ink)"
				strokeWidth="3"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<circle cx="30" cy="10" r="4" fill="var(--sea-ink)" />
		</svg>
	);
}
