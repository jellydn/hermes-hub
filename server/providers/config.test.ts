import { describe, expect, it } from "vitest";

import { deriveCustomProviderApiKeyEnvVar } from "./config";

describe("deriveCustomProviderApiKeyEnvVar", () => {
	it("preserves repeated underscores when sanitizing punycode hostnames", () => {
		expect(
			deriveCustomProviderApiKeyEnvVar("https://hub.xn--bcher-kva.com/v1"),
		).toBe("XN__BCHER_KVA_API_KEY");
	});

	it("rejects hostnames with digits anywhere in the final label", () => {
		expect(
			deriveCustomProviderApiKeyEnvVar("https://api.example.c0m/v1"),
		).toBeNull();
	});
});
