export function getLast4(value: string): string | null {
	const trimmed = value.trim();
	if (!trimmed) {
		return null;
	}

	return trimmed.slice(-4);
}
