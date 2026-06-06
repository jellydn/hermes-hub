import { describe, expect, it } from "vitest";

import {
	formatHermesCliImportFailure,
	formatWebUiContainerFailureDetails,
} from "./diagnostics-formatting";

describe("formatWebUiContainerFailureDetails", () => {
	it("combines state and short logs in full", () => {
		expect(
			formatWebUiContainerFailureDetails(
				"exited exit=1 error=",
				"startup failed",
			),
		).toBe("exited exit=1 error=. Recent logs: startup failed");
	});

	it("returns empty string when both state and logs are undefined", () => {
		expect(formatWebUiContainerFailureDetails(undefined, undefined)).toBe("");
	});

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
		expect(formatWebUiContainerFailureDetails("   ", "segfault at 0x0")).toBe(
			"Recent logs: segfault at 0x0",
		);
	});

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

	it("returns empty string when both inputs are empty strings", () => {
		expect(formatWebUiContainerFailureDetails("", "")).toBe("");
	});

	it("returns empty string when both inputs are whitespace", () => {
		expect(formatWebUiContainerFailureDetails("   ", "\n\t ")).toBe("");
	});

	it("keeps the full message when logs fit exactly in the remaining space", () => {
		const logs = "1234567890123456789012";
		const result = formatWebUiContainerFailureDetails("state", logs, 42);

		expect(result).toBe("state. Recent logs: 1234567890123456789012");
		expect(result).not.toContain("...");
	});

	it("truncates with ellipsis when logs exceed remaining by one char", () => {
		const logs = "x".repeat(21);
		const result = formatWebUiContainerFailureDetails("state", logs, 40);

		expect(result).toContain("...");
		expect(result.length).toBeLessThanOrEqual(40);
	});

	it("returns only truncated prefix when maxLength is smaller than the prefix itself", () => {
		const result = formatWebUiContainerFailureDetails(
			"restarting exit=0 error=",
			"some logs",
			10,
		);

		expect(result).toBe("restarting");
		expect(result).not.toContain("...");
	});

	it("returns the full prefix when maxLength equals prefix length", () => {
		const state = "abc";
		const result = formatWebUiContainerFailureDetails(state, "some logs", 18);

		expect(result).toBe("abc. Recent logs: ");
	});

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

describe("formatHermesCliImportFailure", () => {
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

	it("falls back to 'unknown import error' when importError is undefined", () => {
		expect(formatHermesCliImportFailure(undefined, undefined, undefined)).toBe(
			"Hermes Web UI cannot import hermes_cli (unknown import error).",
		);
	});

	it("falls back to 'unknown import error' when importError is whitespace", () => {
		expect(formatHermesCliImportFailure("   ", undefined, undefined)).toBe(
			"Hermes Web UI cannot import hermes_cli (unknown import error).",
		);
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

	it("appends logs-only diagnostics when state is missing", () => {
		const msg = formatHermesCliImportFailure(
			"SyntaxError",
			undefined,
			"hermes_cli/__init__.py line 42",
		);

		expect(msg).toContain("cannot import hermes_cli (SyntaxError)");
		expect(msg).toContain("line 42");
	});

	it("keeps full diagnostics when they fit in remaining space", () => {
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
		const msg = formatHermesCliImportFailure(
			"ImportError",
			undefined,
			"VERY_LONG_LOG_MESSAGE_THAT_WILL_BE_CUT",
			70,
		);

		expect(msg).toContain("cannot import hermes_cli (ImportError)");
		expect(msg.length).toBeLessThanOrEqual(70);
	});

	it("returns full prefix when importError is long and diagnostics are missing", () => {
		// When !details the function returns prefix without maxLength guard.
		const longError = "x".repeat(500);
		const msg = formatHermesCliImportFailure(
			longError,
			undefined,
			undefined,
			200,
		);

		expect(msg).toContain("cannot import hermes_cli");
		expect(msg.startsWith("Hermes Web UI cannot import hermes_cli (xxxx")).toBe(
			true,
		);
	});

	it("returns only the prefix when maxLength allows no room for details", () => {
		const prefix = "Hermes Web UI cannot import hermes_cli (ImportError).";
		const msg = formatHermesCliImportFailure(
			"ImportError",
			"running",
			"some logs",
			prefix.length,
		);

		expect(msg).toBe(prefix);
	});

	it("treats whitespace-only details as missing", () => {
		expect(formatHermesCliImportFailure("ImportError", "   ", "\n\t")).toBe(
			"Hermes Web UI cannot import hermes_cli (ImportError).",
		);
	});
});
