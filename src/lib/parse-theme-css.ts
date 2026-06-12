import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const STYLES_PATH = resolve(import.meta.dirname, "../styles.css");

const CUSTOM_PROPERTY_PATTERN = /(--[\w-]+)\s*:\s*([^;]+);/g;

export function extractCustomProperties(block: string): Record<string, string> {
	const properties: Record<string, string> = {};
	for (const match of block.matchAll(CUSTOM_PROPERTY_PATTERN)) {
		properties[match[1]] = match[2].trim();
	}
	return properties;
}

export function extractCssBlock(css: string, selector: string): string {
	const start = css.indexOf(selector);
	if (start === -1) {
		throw new Error(`Selector not found: ${selector}`);
	}

	const braceStart = css.indexOf("{", start);
	if (braceStart === -1) {
		throw new Error(`Opening brace not found for selector: ${selector}`);
	}

	let depth = 0;
	for (let index = braceStart; index < css.length; index += 1) {
		const char = css[index];
		if (char === "{") {
			depth += 1;
		} else if (char === "}") {
			depth -= 1;
			if (depth === 0) {
				return css.slice(braceStart + 1, index);
			}
		}
	}

	throw new Error(`Closing brace not found for selector: ${selector}`);
}

export function loadStylesheet(): string {
	return readFileSync(STYLES_PATH, "utf8");
}

export function loadThemeTokens(selector: string): Record<string, string> {
	const css = loadStylesheet();
	const block = extractCssBlock(css, selector);
	return extractCustomProperties(block);
}

export function resolveTokenValue(
	tokens: Record<string, string>,
	value: string,
	depth = 0,
): string {
	const trimmed = value.trim();
	const varMatch = /^var\((--[^)]+)\)$/.exec(trimmed);
	if (!varMatch || depth >= 10) {
		return trimmed;
	}

	const referenced = tokens[varMatch[1]];
	if (!referenced) {
		return trimmed;
	}

	return resolveTokenValue(tokens, referenced, depth + 1);
}

export function resolveThemeTokens(
	tokens: Record<string, string>,
): Record<string, string> {
	const resolved: Record<string, string> = {};
	for (const [name, value] of Object.entries(tokens)) {
		resolved[name] = resolveTokenValue(tokens, value);
	}
	return resolved;
}
