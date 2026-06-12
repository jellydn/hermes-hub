export type Rgb = { r: number; g: number; b: number };

const AAA_NORMAL = 7;
const AAA_LARGE = 4.5;
const UI_COMPONENT = 3;

function channelToLinear(channel: number): number {
	const normalized = channel / 255;
	return normalized <= 0.03928
		? normalized / 12.92
		: ((normalized + 0.055) / 1.055) ** 2.4;
}

export function parseHexColor(hex: string): Rgb {
	const normalized = hex.replace("#", "");
	const value = Number.parseInt(normalized, 16);
	return {
		r: (value >> 16) & 255,
		g: (value >> 8) & 255,
		b: value & 255,
	};
}

export function parseRgbaColor(color: string): { rgb: Rgb; alpha: number } {
	const match =
		/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)$/i.exec(
			color,
		);
	if (!match) {
		throw new Error(`Unsupported color format: ${color}`);
	}

	return {
		rgb: {
			r: Number(match[1]),
			g: Number(match[2]),
			b: Number(match[3]),
		},
		alpha: match[4] === undefined ? 1 : Number(match[4]),
	};
}

export function compositeRgb(
	foreground: Rgb,
	background: Rgb,
	alpha: number,
): Rgb {
	return {
		r: Math.round(foreground.r * alpha + background.r * (1 - alpha)),
		g: Math.round(foreground.g * alpha + background.g * (1 - alpha)),
		b: Math.round(foreground.b * alpha + background.b * (1 - alpha)),
	};
}

export function resolveBackgroundColor(color: string, base: Rgb): Rgb {
	if (color.startsWith("#")) {
		return parseHexColor(color);
	}

	const { alpha, rgb } = parseRgbaColor(color);
	return compositeRgb(rgb, base, alpha);
}

export function relativeLuminance(rgb: Rgb): number {
	const r = channelToLinear(rgb.r);
	const g = channelToLinear(rgb.g);
	const b = channelToLinear(rgb.b);
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(foreground: Rgb, background: Rgb): number {
	const fg = relativeLuminance(foreground);
	const bg = relativeLuminance(background);
	const lighter = Math.max(fg, bg);
	const darker = Math.min(fg, bg);
	return (lighter + 0.05) / (darker + 0.05);
}

export function meetsAaaNormal(ratio: number): boolean {
	return ratio >= AAA_NORMAL;
}

export function meetsAaaLarge(ratio: number): boolean {
	return ratio >= AAA_LARGE;
}

export function meetsUiComponentContrast(ratio: number): boolean {
	return ratio >= UI_COMPONENT;
}
