import { describe, expect, it } from "vitest";

import { formStateFromPreset, getFormValidationError } from "./mcp-form-state";
import { getMcpServerPreset } from "./mcp-server-presets";

describe("mcp-form-state presets", () => {
	it("builds memory preset args without overrides", () => {
		const preset = getMcpServerPreset("memory");
		expect(preset).toBeTruthy();

		const form = formStateFromPreset(preset as NonNullable<typeof preset>);
		expect(form.argsText).toBe("-y\n@modelcontextprotocol/server-memory");
	});

	it("builds filesystem preset args from overrides", () => {
		const preset = getMcpServerPreset("filesystem");
		expect(preset).toBeTruthy();

		const form = formStateFromPreset(preset as NonNullable<typeof preset>, {
			allowedDirectory: "/srv/hermes-data",
		});
		expect(form.argsText).toBe(
			"-y\n@modelcontextprotocol/server-filesystem\n/srv/hermes-data",
		);
	});
});

describe("getFormValidationError", () => {
	it("rejects non-positive timeout values", () => {
		expect(
			getFormValidationError({
				...emptyForm(),
				timeout: "0",
			}),
		).toBe("Timeout must be a positive integer.");
	});

	it("allows empty timeout fields", () => {
		expect(getFormValidationError(emptyForm())).toBeNull();
	});
});

function emptyForm() {
	const preset = getMcpServerPreset("memory");
	if (!preset) {
		throw new Error("memory preset is required for tests");
	}

	return formStateFromPreset(preset);
}
