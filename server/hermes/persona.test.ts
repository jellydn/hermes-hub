import { describe, expect, it } from "vitest";

import {
	buildSoulMdWriteCommand,
	MAX_AGENT_PERSONA_LENGTH,
	validateAgentPersona,
} from "./persona";

describe("validateAgentPersona", () => {
	it("rejects empty content", () => {
		expect(validateAgentPersona("")).toEqual({
			ok: false,
			error: "Persona content cannot be empty.",
		});
	});

	it("rejects whitespace-only content", () => {
		expect(validateAgentPersona("   \n\t  ")).toEqual({
			ok: false,
			error: "Persona content cannot be empty.",
		});
	});

	it("rejects content over the character limit", () => {
		const content = "a".repeat(MAX_AGENT_PERSONA_LENGTH + 1);
		expect(validateAgentPersona(content)).toEqual({
			ok: false,
			error: `Persona content cannot exceed ${MAX_AGENT_PERSONA_LENGTH} characters.`,
		});
	});

	it("accepts trimmed content within the limit", () => {
		expect(validateAgentPersona("  helpful assistant  ")).toEqual({
			ok: true,
			content: "helpful assistant",
		});
	});
});

describe("buildSoulMdWriteCommand", () => {
	it("base64-encodes persona content for safe shell transfer", () => {
		const command = buildSoulMdWriteCommand("line one\nline'two");

		expect(command).toContain("sudo mkdir -p /root/.hermes");
		expect(command).toContain("printf '%s' '");
		expect(command).toContain("| base64 -d | sudo tee /root/.hermes/SOUL.md");
		expect(command).not.toContain("line'two");
	});
});
