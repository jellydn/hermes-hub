export const brandMarkViewBox = "0 0 40 40";

export const brandMarkRasterColors = {
	lagoon: "#4fb8b2",
	seaInk: "#173a40",
} as const;

export const brandMarkShell = {
	x: 6,
	y: 14,
	width: 28,
	height: 22,
	rx: 9,
} as const;

export const brandMarkLetterPath = "M14 20V30M26 20V30M14 20H26M14 25H26";

export const brandMarkAgentDot = {
	cx: 30,
	cy: 10,
	r: 4,
} as const;

type BrandMarkColors = {
	lagoon: string;
	seaInk: string;
};

export function renderBrandMarkSvg(colors: BrandMarkColors) {
	return `<svg viewBox="${brandMarkViewBox}" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="${brandMarkShell.x}" y="${brandMarkShell.y}" width="${brandMarkShell.width}" height="${brandMarkShell.height}" rx="${brandMarkShell.rx}" fill="${colors.lagoon}"/>
  <path d="${brandMarkLetterPath}" stroke="${colors.seaInk}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="${brandMarkAgentDot.cx}" cy="${brandMarkAgentDot.cy}" r="${brandMarkAgentDot.r}" fill="${colors.seaInk}"/>
</svg>
`;
}
