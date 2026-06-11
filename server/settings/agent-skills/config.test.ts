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

	it("derives name from browse.sh ref, stripping random-id suffix", () => {
		expect(
			getHubInstalledName("browse-sh/weather.gov/get-forecast-1uezib"),
		).toBe("get-forecast");
	});

	it("derives name from browse.sh ref with different suffix", () => {
		expect(
			getHubInstalledName("browse-sh/windy.com/geo-weather-fetch-w3o49h"),
		).toBe("geo-weather-fetch");
	});

	it("leaves last segment unchanged when it does not match browse.sh pattern", () => {
		expect(getHubInstalledName("browse-sh/example.com/a-normal-name")).toBe(
			"a-normal-name",
		);
	});

	it("strips hyphens from skills.sh refs to match installed directory names", () => {
		expect(getHubInstalledName("skills-sh/example.com/last-30-days")).toBe(
			"last30days",
		);
	});

	it("does not strip random-id suffix from non-browse.sh hub refs", () => {
		expect(getHubInstalledName("skills-sh/example.com/my-skill-1uezib")).toBe(
			"myskill1uezib",
		);
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

	it("returns Hermes-derived name from browse.sh ref (strips -<id>)", () => {
		expect(
			resolveManifestName({
				sourceType: "hub",
				name: "Weather Gov Forecast",
				installRef: "browse-sh/weather.gov/get-forecast-1uezib",
			}),
		).toBe("get-forecast");
	});

	it("derives manifest name from simple path hub ref", () => {
		expect(
			resolveManifestName({
				sourceType: "hub",
				name: "Web Search",
				installRef: "tobi/hermes-web-search",
			}),
		).toBe("hermes-web-search");
	});

	it("returns empty string when hub installRef is null", () => {
		expect(
			resolveManifestName({
				sourceType: "hub",
				name: "my-skill",
				installRef: null,
			}),
		).toBe("");
	});

	it("derives manifest name from versioned hub ref, stripping @version", () => {
		expect(
			resolveManifestName({
				sourceType: "hub",
				name: "my-skill",
				installRef: "org/repo@v1.0.0",
			}),
		).toBe("repo");
	});
});
