import { describe, expect, it } from "vitest";

import { parsePersonaSaveBody } from "./config";

describe("parsePersonaSaveBody", () => {
	it("rejects null payloads", () => {
		expect(parsePersonaSaveBody(null)).toEqual({
			ok: false,
			error: "Persona content is required.",
		});
	});

	it("rejects missing agentPersona", () => {
		expect(parsePersonaSaveBody({})).toEqual({
			ok: false,
			error: "Persona content is required.",
		});
	});

	it("rejects empty persona content", () => {
		expect(parsePersonaSaveBody({ agentPersona: "   " })).toEqual({
			ok: false,
			error: "Persona content cannot be empty.",
		});
	});

	it("accepts valid persona content", () => {
		expect(
			parsePersonaSaveBody({ agentPersona: " helpful assistant " }),
		).toEqual({
			ok: true,
			content: "helpful assistant",
		});
	});
});
