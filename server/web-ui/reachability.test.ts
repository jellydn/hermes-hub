import { describe, expect, it } from "vitest";

import { formatWebUiProxyError, isRemotePortUnreachable } from "./reachability";

describe("isRemotePortUnreachable", () => {
	it("detects SSH channel and connection refused errors", () => {
		expect(
			isRemotePortUnreachable(
				new Error("(SSH) Channel open failure: Connection refused"),
			),
		).toBe(true);
	});

	it("returns false for unrelated errors", () => {
		expect(isRemotePortUnreachable(new Error("Upstream timeout"))).toBe(false);
	});
});

describe("formatWebUiProxyError", () => {
	it("translates SSH connection refused into actionable guidance", () => {
		expect(
			formatWebUiProxyError(
				new Error("(SSH) Channel open failure: Connection refused"),
				8787,
			),
		).toContain(
			"Hermes Web UI is not reachable on the server (127.0.0.1:8787)",
		);
	});

	it("passes through unrelated proxy errors", () => {
		expect(formatWebUiProxyError(new Error("Upstream timeout"), 8787)).toBe(
			"Upstream timeout",
		);
	});
});
