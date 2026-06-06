import { describe, expect, it } from "vitest";

import {
	formatHermesCliImportFailure,
	formatWebUiContainerFailureDetails,
} from "./diagnostics-formatting";

// ── formatWebUiContainerFailureDetails ────────────────────────────

describe("formatWebUiContainerFailureDetails", () => {
	// -- happy paths (duplicated from integration-level tests for module ownership) --

	it("combines state and short logs in full", () => {
		expect(
			formatWebUiContainerFailureDetails("exited exit=1 error=", "startup failed"),
		).toBe("exited exit=1 error=. Recent logs: startup failed");
	});

	it("returns empty string when both state and logs are undefined", () => {
		expect(formatWebUiContainerFailureDetails(undefined, undefined)).toBe("");
	});

	// -- logs-only path --

	it("prepends 'Recent logs:' when state is missing", () => {
		expect(
			formatWebUiContainerFailureDetails(undefined, "container crashed"),
		).toBe("Recent logs: container crashed");
	});

	it("returns empty when state is undefined and logs trims to empty", () => {
		// "".trim() is falsy, so the function treats an empty-string log the
		// same as undefined — nothing to report.
		expect(formatWebUiContainerFailureDetails(undefined, "")).toBe("");
	});

	it("treats whitespace-only state as missing and uses logs prefix", () => {
		expect(
			formatWebUiContainerFailureDetails("   ", "segfault at 0x0"),
		).toBe("Recent logs: segfault at 0x0");
	});

	// -- state-only path --

	it("returns the state prefix when logs are undefined", () => {
		expect(
			formatWebUiContainerFailureDetails("restarting exit=2 error=", undefined),
		).toBe("restarting exit=2 error=. Recent logs: ");
	});

	it("returns the state prefix when logs are whitespace-only", () => {
		expect(
			formatWebUiContainerFailureDetails("restarting exit=2 error=", "   "),
		).toBe("restarting exit=2 error=. Recent logs: ");
	});

	// -- all inputs empty / whitespace --

	it("returns empty string when both inputs are empty strings", () => {
		expect(formatWebUiContainerFailureDetails("", "")).toBe("");
	});

	it("returns empty string when both inputs are whitespace", () => {
		expect(formatWebUiContainerFailureDetails("   ", "\n\t ")).toBe("");
	});

	// -- truncation boundaries --

	it("keeps the full message when logs fit exactly in the remaining space", () => {
		// Prefix "state. Recent logs: " = 20 chars. With maxLength=42, remaining=22.
		const logs = "1234567890123456789012"; // exactly 22 chars
		const result = formatWebUiContainerFailureDetails("state", logs, 42);

		expect(result).toBe("state. Recent logs: 1234567890123456789012");
		expect(result).not.toContain("...");
	});

	it("truncates with ellipsis when logs exceed remaining by one char", () => {
		// Prefix "state. Recent logs: " = 20 chars.  With maxLength=40, remaining=20.
		// Ellipsis eats 3 chars from remaining: 20-3=17 chars of tail preserved.
		// 21-char logs => 1 over, triggers truncation.
		const logs = "x".repeat(21);
		const result = formatWebUiContainerFailureDetails("state", logs, 40);

		expect(result).toContain("...");
		expect(result.length).toBeLessThanOrEqual(40);
	});

	it("returns only truncated prefix when maxLength is smaller than the prefix itself", () => {
		// Prefix: "restarting exit=0 error=. Recent logs: " = 38 chars
		const result = formatWebUiContainerFailureDetails(
			"restarting exit=0 error=",
			"some logs",
			10,
		);

		expect(result).toBe("restarting");
		expect(result).not.toContain("...");
	});

	it("returns the full prefix when maxLength equals prefix length", () => {
		const state = "abc"; // "abc. Recent logs: " = 18 chars
		const result = formatWebUiContainerFailureDetails(state, "some logs", 18);

		expect(result).toBe("abc. Recent logs: ");
	});

	// -- truncation preserves the tail (meaningful error at end) --

	it("drops the early noise and keeps the final fatal line", () => {
		const start = "[EARLY_STARTUP_NOISE]";
		const fatal = "!! ERROR: HERMES_WEBUI_STATE_DIR not set";
		const logs = start + "x".repeat(2400) + fatal;
		const result = formatWebUiContainerFailureDetails(
			"restarting exit=1 error=",
			logs,
		);

		expect(result).toContain(fatal);
		expect(result).toContain("...");
		expect(result).not.toContain(start);
	});

	// -- custom maxLength --

	it("respects a small custom maxLength", () => {
		const result = formatWebUiContainerFailureDetails(
			"exited exit=1 error=",
			"a very long log message that should be truncated",
			50,
		);

		expect(result.length).toBeLessThanOrEqual(50);
		expect(result).toContain("...");
		expect(result).toContain("truncated");
	});
});

// ── formatHermesCliImportFailure ──────────────────────────────────

describe("formatHermesCliImportFailure", () => {
	// -- happy path --

	it("includes the import error and container diagnostics", () => {
		const msg = formatHermesCliImportFailure(
			"ModuleNotFoundError: No module named 'hermes_cli'",
			"running exit=0 error=",
			"startup ok\nimport failed",
		);

		expect(msg).toContain("cannot import hermes_cli");
		expect(msg).toContain("import failed");
		expect(msg).toContain("running exit=0 error=");
	});

	// -- fallbacks --

	it("falls back to 'unknown import error' when importError is undefined", () => {
		expect(
			formatHermesCliImportFailure(undefined, undefined, undefined),
		).toBe("Hermes Web UI cannot import hermes_cli (unknown import error).");
	});

	it("falls back to 'unknown import error' when importError is whitespace", () => {
		expect(
			formatHermesCliImportFailure("   ", undefined, undefined),
		).toBe("Hermes Web UI cannot import hermes_cli (unknown import error).");
	});

	it("returns just the prefix when diagnostics are missing", () => {
		expect(
			formatHermesCliImportFailure("ImportError", undefined, undefined),
		).toBe("Hermes Web UI cannot import hermes_cli (ImportError).");
	});

	it("returns just the prefix when diagnostics are empty strings", () => {
		expect(formatHermesCliImportFailure("ImportError", "", "")).toBe(
			"Hermes Web UI cannot import hermes_cli (ImportError).",
		);
	});

	// -- logs-only diagnostics --

	it("appends logs-only diagnostics when state is missing", () => {
		const msg = formatHermesCliImportFailure(
			"SyntaxError",
			undefined,
			"hermes_cli/__init__.py line 42",
		);

		expect(msg).toContain("cannot import hermes_cli (SyntaxError)");
		expect(msg).toContain("line 42");
	});

	// -- truncation boundaries --

	it("keeps full diagnostics when they fit in remaining space", () => {
		// Prefix: ~55 chars. With maxLength=200, remaining ~144 chars.
		// Details: "Recent logs: OK" = 17 chars, well within remaining.
		const msg = formatHermesCliImportFailure(
			"ImportError",
			undefined,
			"OK",
			200,
		);

		expect(msg).toContain("cannot import hermes_cli (ImportError)");
		expect(msg).toContain("Recent logs: OK");
		expect(msg).not.toContain("...");
	});

	it("truncates details when they exceed remaining space", () => {
		// Prefix: ~55 chars. With maxLength=70, remaining=70-55-1=14 chars for details.
		const msg = formatHermesCliImportFailure(
			"ImportError",
			undefined,
			"VERY_LONG_LOG_MESSAGE_THAT_WILL_BE_CUT",
			70,
		);

		expect(msg).toContain("cannot import hermes_cli (ImportError)");
		// Should be truncated to fit: 14 chars of details preserved
		expect(msg.length).toBeLessThanOrEqual(70);
	});

	// -- very long importError (defensive: docker exec stderr is bounded, but guard anyway) --

	it("returns full prefix when importError is long and diagnostics are missing", () => {
		// When !details the function returns prefix as-is — no maxLength guard
		// in that branch.  This mirrors formatWebUiContainerFailureDetails
		// returning the full state prefix when logs are absent.
		const longError = "x".repeat(500);
		const msg = formatHermesCliImportFailure(longError, undefined, undefined, 200);

		expect(msg).toContain("cannot import hermes_cli");
		expect(msg.startsWith("Hermes Web UI cannot import hermes_cli (xxxx")).toBe(true);
	});

	// -- maxLength exactly consumed by prefix --

	it("returns only the prefix when maxLength allows no room for details", () => {
		const prefix = "Hermes Web UI cannot import hermes_cli (ImportError).";
		const msg = formatHermesCliImportFailure(
			"ImportError",
			"running",
			"some logs",
			prefix.length, // exactly the prefix length, no room for space+details
		);

		expect(msg).toBe(prefix);
	});

	// -- details are whitespace / empty --

	it("treats whitespace-only details as missing", () => {
		expect(
			formatHermesCliImportFailure("ImportError", "   ", "\n\t"),
		).toBe("Hermes Web UI cannot import hermes_cli (ImportError).");
	});
});
