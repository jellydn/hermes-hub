import { describe, expect, it } from "vitest";

import { getHubInstalledName, resolveManifestName } from "./config";

describe("getHubInstalledName", () => {
	it("returns empty string for empty input", () => {
		expect(getHubInstalledName("")).toBe("");
	});

	it("extracts name from simple ref", () => {
		expect(getHubInstalledName("web-search")).toBe("web-search");
	});

	it("extracts name from path-style ref", () => {
		expect(getHubInstalledName("tobi/hermes-web-search")).toBe(
			"hermes-web-search",
		);
	});

	it("strips version specifier", () => {
		expect(getHubInstalledName("tobi/hermes-web-search@v1.0.0")).toBe(
			"hermes-web-search",
		);
	});

	it("strips version specifier from simple ref", () => {
		expect(getHubInstalledName("web-search@latest")).toBe("web-search");
	});

	it("handles deep path correctly", () => {
		expect(getHubInstalledName("org/repo/skills/my-skill")).toBe("my-skill");
	});

	it("returns last segment of browse.sh ref", () => {
		expect(
			getHubInstalledName("browse-sh/windy.com/geo-weather-fetch-w3o49h"),
		).toBe("geo-weather-fetch-w3o49h");
	});
});

describe("resolveManifestName", () => {
	it("returns saved name for custom skills", () => {
		expect(
			resolveManifestName({ sourceType: "custom", name: "my-skill" }),
		).toBe("my-skill");
	});

	it("returns saved name for url skills", () => {
		expect(
			resolveManifestName({
				sourceType: "url",
				name: "remote-skill",
				installRef: "https://example.com/SKILL.md",
			}),
		).toBe("remote-skill");
	});

	it("returns saved name for hub skills (passed via --name)", () => {
		expect(
			resolveManifestName({
				sourceType: "hub",
				name: "geo-weather-fetch",
				installRef: "browse-sh/windy.com/geo-weather-fetch-w3o49h",
			}),
		).toBe("geo-weather-fetch");
	});

	it("returns saved name for simple path hub ref", () => {
		expect(
			resolveManifestName({
				sourceType: "hub",
				name: "web-search",
				installRef: "tobi/hermes-web-search",
			}),
		).toBe("web-search");
	});

	it("returns saved name even when installRef is null", () => {
		expect(
			resolveManifestName({
				sourceType: "hub",
				name: "my-skill",
				installRef: null,
			}),
		).toBe("my-skill");
	});

	it("returns saved name for versioned hub ref", () => {
		expect(
			resolveManifestName({
				sourceType: "hub",
				name: "my-skill",
				installRef: "org/repo@v1.0.0",
			}),
		).toBe("my-skill");
	});
});
