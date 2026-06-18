import { describe, expect, it } from "vitest";
import { maskHost } from "./utils";

describe("maskHost", () => {
	it("masks an IPv4 address, showing only the last octet", () => {
		expect(maskHost("95.111.232.131")).toBe("···.131");
	});

	it("masks a hostname, showing only the TLD", () => {
		expect(maskHost("my-server.example.com")).toBe("···.com");
	});

	it("handles a single-segment string (no dots)", () => {
		expect(maskHost("localhost")).toBe("···localhost");
	});

	it("handles an empty string gracefully", () => {
		expect(maskHost("")).toBe("···");
	});

	it("masks an IPv4 with different octet lengths", () => {
		expect(maskHost("8.8.8.8")).toBe("···.8");
	});
});
