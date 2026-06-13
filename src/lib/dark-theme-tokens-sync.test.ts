import { describe, expect, it } from "vitest";

import {
	extractCssBlock,
	extractCustomProperties,
	loadStylesheet,
} from "./parse-theme-css";

describe("dark theme token blocks stay in sync", () => {
	it("matches data-theme dark tokens with prefers-color-scheme dark tokens", () => {
		const css = loadStylesheet();
		const explicitDark = extractCustomProperties(
			extractCssBlock(css, ':root[data-theme="dark"]'),
		);
		const mediaBlock = extractCssBlock(
			css,
			"@media (prefers-color-scheme: dark)",
		);
		const autoDark = extractCustomProperties(
			extractCssBlock(mediaBlock, ':root:not([data-theme="light"])'),
		);

		expect(autoDark).toEqual(explicitDark);
	});
});
