import { describe, expect, it } from "vitest";

import {
	extractCssBlock,
	extractCustomProperties,
	loadThemeTokens,
	resolveThemeTokens,
} from "./parse-theme-css";

describe("parse-theme-css", () => {
	it("loads dark theme tokens from styles.css", () => {
		const tokens = loadThemeTokens(':root[data-theme="dark"]');
		expect(tokens["--sea-ink"]).toBe("#e8f6f3");
		expect(tokens["--alert-error-fg"]).toBe("#ffb4b4");
	});

	it("resolves var() chains for contrast pairs", () => {
		const tokens = resolveThemeTokens(
			loadThemeTokens(':root[data-theme="dark"]'),
		);
		expect(tokens["--focus-ring"]).toMatch(/^#[0-9a-f]{6}$/i);
	});

	it("extracts custom properties from a block", () => {
		const properties = extractCustomProperties(`
			--sea-ink: #e8f6f3;
			--focus-ring: var(--lagoon);
		`);
		expect(properties).toEqual({
			"--sea-ink": "#e8f6f3",
			"--focus-ring": "var(--lagoon)",
		});
	});

	it("extracts nested selector blocks", () => {
		const css = `
@media (prefers-color-scheme: dark) {
	:root:not([data-theme="light"]) {
		--sea-ink: #e8f6f3;
	}
}
`;
		const mediaBlock = extractCssBlock(
			css,
			"@media (prefers-color-scheme: dark)",
		);
		const rootBlock = extractCssBlock(
			mediaBlock,
			':root:not([data-theme="light"])',
		);
		expect(extractCustomProperties(rootBlock)["--sea-ink"]).toBe("#e8f6f3");
	});
});
