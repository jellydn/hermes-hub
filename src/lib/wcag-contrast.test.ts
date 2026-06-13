import { describe, expect, it } from "vitest";

import {
	contrastRatio,
	meetsAaaNormal,
	parseHexColor,
	relativeLuminance,
} from "./wcag-contrast";

describe("wcag-contrast", () => {
	it("computes relative luminance for black and white", () => {
		expect(relativeLuminance(parseHexColor("#000000"))).toBeCloseTo(0, 5);
		expect(relativeLuminance(parseHexColor("#ffffff"))).toBeCloseTo(1, 5);
	});

	it("computes 21:1 contrast for black on white", () => {
		expect(
			contrastRatio(parseHexColor("#000000"), parseHexColor("#ffffff")),
		).toBeCloseTo(21, 0);
	});

	it("flags low-contrast pairs", () => {
		const ratio = contrastRatio(
			parseHexColor("#777777"),
			parseHexColor("#888888"),
		);
		expect(meetsAaaNormal(ratio)).toBe(false);
	});
});
