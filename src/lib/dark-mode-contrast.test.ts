import { describe, expect, it } from "vitest";

import {
	loadThemeTokens,
	resolveThemeTokens,
	resolveTokenValue,
} from "./parse-theme-css";
import {
	contrastRatio,
	meetsAaaLarge,
	meetsAaaNormal,
	meetsUiComponentContrast,
	parseHexColor,
	resolveBackgroundColor,
} from "./wcag-contrast";

const darkTokens = resolveThemeTokens(
	loadThemeTokens(':root[data-theme="dark"]'),
);

type ContrastPair = {
	label: string;
	foreground: string;
	background: string;
};

function token(name: string): string {
	const value = darkTokens[name];
	if (!value) {
		throw new Error(`Missing dark theme token: ${name}`);
	}
	return value;
}

function bg(name: string) {
	return resolveBackgroundColor(token(name), parseHexColor(token("--bg-base")));
}

function ratio(foregroundToken: string, backgroundToken: string): number {
	return contrastRatio(
		parseHexColor(token(foregroundToken)),
		bg(backgroundToken),
	);
}

const normalTextPairs: ContrastPair[] = [
	{
		label: "body on surface-strong",
		foreground: "--sea-ink",
		background: "--surface-strong",
	},
	{
		label: "body on chip-bg",
		foreground: "--sea-ink",
		background: "--chip-bg",
	},
	{ label: "body on foam", foreground: "--sea-ink", background: "--foam" },
	{
		label: "body on bg-base",
		foreground: "--sea-ink",
		background: "--bg-base",
	},
	{
		label: "body on input-bg",
		foreground: "--sea-ink",
		background: "--input-bg",
	},
	{
		label: "body on surface-weak",
		foreground: "--sea-ink",
		background: "--surface-weak",
	},
	{
		label: "secondary on surface-strong",
		foreground: "--sea-ink-soft",
		background: "--surface-strong",
	},
	{
		label: "secondary on chip-bg",
		foreground: "--sea-ink-soft",
		background: "--chip-bg",
	},
	{
		label: "secondary on foam",
		foreground: "--sea-ink-soft",
		background: "--foam",
	},
	{
		label: "secondary on bg-base",
		foreground: "--sea-ink-soft",
		background: "--bg-base",
	},
	{
		label: "kicker on surface-strong",
		foreground: "--kicker",
		background: "--surface-strong",
	},
	{
		label: "link on surface-strong",
		foreground: "--lagoon-deep",
		background: "--surface-strong",
	},
	{
		label: "link on chip-bg",
		foreground: "--lagoon-deep",
		background: "--chip-bg",
	},
	{
		label: "nav hover on link-bg-hover",
		foreground: "--sea-ink",
		background: "--link-bg-hover",
	},
	{
		label: "ghost label on link-bg-hover",
		foreground: "--sea-ink-soft",
		background: "--link-bg-hover",
	},
	{
		label: "default button label on default button bg",
		foreground: "--button-default-fg",
		background: "--button-default-bg",
	},
	{
		label: "destructive button label on destructive button bg",
		foreground: "--button-destructive-fg",
		background: "--button-destructive-bg",
	},
	{
		label: "error alert text on error alert bg",
		foreground: "--alert-error-fg",
		background: "--alert-error-bg",
	},
	{
		label: "warning alert text on warning alert bg",
		foreground: "--alert-warning-fg",
		background: "--alert-warning-bg",
	},
	{
		label: "success alert text on success alert bg",
		foreground: "--alert-success-fg",
		background: "--alert-success-bg",
	},
	{
		label: "info alert text on info alert bg",
		foreground: "--alert-info-fg",
		background: "--alert-info-bg",
	},
	{
		label: "success pill text on success pill bg",
		foreground: "--alert-success-fg",
		background: "--alert-success-bg",
	},
	{
		label: "warning pill text on warning pill bg",
		foreground: "--alert-warning-fg",
		background: "--alert-warning-bg",
	},
	{
		label: "error pill text on error pill bg",
		foreground: "--alert-error-fg",
		background: "--alert-error-bg",
	},
	{
		label: "selected tab text on selected tab bg",
		foreground: "--selected-fg",
		background: "--selected-bg",
	},
];

const largeTextPairs: ContrastPair[] = [
	{
		label: "kicker large text on surface-strong",
		foreground: "--kicker",
		background: "--surface-strong",
	},
];

const uiPairs: ContrastPair[] = [
	{
		label: "focus ring on focus ring offset",
		foreground: "--focus-ring",
		background: "--focus-ring-offset",
	},
];

describe("dark mode contrast", () => {
	it("resolves var() token references from styles.css", () => {
		expect(resolveTokenValue(darkTokens, "var(--focus-ring)")).toMatch(
			/^#[0-9a-f]{6}$/i,
		);
	});

	for (const pair of normalTextPairs) {
		it(`meets AAA normal text for ${pair.label}`, () => {
			const result = ratio(pair.foreground, pair.background);
			expect(
				meetsAaaNormal(result),
				`${pair.label}: ${result.toFixed(2)}:1`,
			).toBe(true);
		});
	}

	for (const pair of largeTextPairs) {
		it(`meets AAA large text for ${pair.label}`, () => {
			const result = ratio(pair.foreground, pair.background);
			expect(
				meetsAaaLarge(result),
				`${pair.label}: ${result.toFixed(2)}:1`,
			).toBe(true);
		});
	}

	for (const pair of uiPairs) {
		it(`meets UI component contrast for ${pair.label}`, () => {
			const result = ratio(pair.foreground, pair.background);
			expect(
				meetsUiComponentContrast(result),
				`${pair.label}: ${result.toFixed(2)}:1`,
			).toBe(true);
		});
	}
});
