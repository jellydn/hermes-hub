import { describe, expect, it } from "vitest";

import {
	brandMarkLetterPath,
	brandMarkRasterColors,
	renderBrandMarkSvg,
} from "./brand-mark-graphic";

describe("renderBrandMarkSvg", () => {
	it("renders the shared lagoon shell and sea-ink letter path", () => {
		const svg = renderBrandMarkSvg(brandMarkRasterColors);

		expect(svg).toContain(`fill="${brandMarkRasterColors.lagoon}"`);
		expect(svg).toContain(`d="${brandMarkLetterPath}"`);
		expect(svg).toContain(`fill="${brandMarkRasterColors.seaInk}"`);
	});
});
