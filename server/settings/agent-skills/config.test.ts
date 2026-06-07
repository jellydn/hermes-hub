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
});

describe("resolveManifestName", () => {
	it("returns name for non-hub skills", () => {
		expect(
			resolveManifestName({ sourceType: "custom", name: "my-skill" }),
		).toBe("my-skill");
	});

	it("returns name for url skills", () => {
		expect(
			resolveManifestName({
				sourceType: "url",
				name: "remote-skill",
				installRef: "https://example.com/SKILL.md",
			}),
		).toBe("remote-skill");
	});

	it("returns upstream bundle name for hub skills", () => {
		expect(
			resolveManifestName({
				sourceType: "hub",
				name: "ui-alias",
				installRef: "tobi/hermes-web-search",
			}),
		).toBe("hermes-web-search");
	});

	it("strips version from hub installRef", () => {
		expect(
			resolveManifestName({
				sourceType: "hub",
				name: "my-skill",
				installRef: "org/repo@v1.0.0",
			}),
		).toBe("repo");
	});

	it("handles null installRef for hub skills", () => {
		expect(
			resolveManifestName({
				sourceType: "hub",
				name: "fallback-name",
				installRef: null,
			}),
		).toBe("");
	});
});
