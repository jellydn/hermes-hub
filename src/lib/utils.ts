import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

/** Mask a hostname or IP address, showing only the last segment. */
export function maskHost(host: string): string {
	const lastDot = host.lastIndexOf(".");
	if (lastDot === -1) {
		return `···${host}`;
	}
	return `···${host.slice(lastDot)}`;
}
