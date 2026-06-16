import { describe, expect, it } from "vitest";

import {
	formatHermesCliImportFailure,
	formatWebUiContainerFailureDetails,
} from "../diagnostics-formatting";
import { assertWebUiReachable } from "../runtime";
import { mockSsh } from "./test-helpers";

describe("formatWebUiContainerFailureDetails", () => {
	it("combines container state and recent logs", () => {
		expect(
			formatWebUiContainerFailureDetails(
				"exited exit=1 error=",
				"startup failed",
			),
		).toBe("exited exit=1 error=. Recent logs: startup failed");
	});

	it("returns empty string when no diagnostics are available", () => {
		expect(formatWebUiContainerFailureDetails(undefined, undefined)).toBe("");
	});

	it("truncates long output and preserves the tail with ellipsis", () => {
		const start = "[EARLY_STARTUP_NOISE]";
		const fatal = "!! CRITICAL: subscription crashed";
		const logs = start + "x".repeat(2400) + fatal;
		const result = formatWebUiContainerFailureDetails(
			"restarting exit=1 error=",
			logs,
		);

		expect(result).toContain(fatal);
		expect(result).toContain("...");
		expect(result).not.toContain(start);
	});

	it("returns only prefix when logs are missing", () => {
		expect(
			formatWebUiContainerFailureDetails("running exit=0 error=", undefined),
		).toBe("running exit=0 error=. Recent logs: ");
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
	});

	it("falls back when diagnostics are unavailable", () => {
		expect(formatHermesCliImportFailure(undefined, undefined, undefined)).toBe(
			"Hermes Web UI cannot import hermes_cli (unknown import error).",
		);
	});
});

describe("assertWebUiReachable", () => {
	it("succeeds on the first attempt when container is running and HTTP responds", async () => {
		const { execCommand } = mockSsh((cmd: string) => {
			if (cmd.includes("docker ps")) {
				return { code: 0, stdout: "hermes-webui\n", stderr: "" };
			}
			if (cmd.includes("curl")) {
				return { code: 0, stdout: "", stderr: "" };
			}
			return { code: 0, stdout: "", stderr: "" };
		});

		await expect(
			assertWebUiReachable({ execCommand } as never, 8787),
		).resolves.toBeUndefined();
	});

	it("retries after sleeping when container is not yet running", async () => {
		let callCount = 0;
		const { execCommand } = mockSsh((cmd: string) => {
			if (cmd.includes("docker ps")) {
				callCount += 1;
				if (callCount === 1) {
					return { code: 0, stdout: "", stderr: "" };
				}
				return { code: 0, stdout: "hermes-webui\n", stderr: "" };
			}
			if (cmd.includes("sleep")) {
				return { code: 0, stdout: "", stderr: "" };
			}
			if (cmd.includes("curl")) {
				return { code: 0, stdout: "", stderr: "" };
			}
			return { code: 0, stdout: "", stderr: "" };
		});

		await expect(
			assertWebUiReachable({ execCommand } as never, 8787),
		).resolves.toBeUndefined();

		expect(execCommand).toHaveBeenCalledWith("sleep 5");
	});

	it("retries after sleeping when HTTP probe fails", async () => {
		const callCounts: Record<string, number> = {};
		const { execCommand } = mockSsh((cmd: string) => {
			callCounts[cmd] = (callCounts[cmd] ?? 0) + 1;

			if (cmd.includes("docker ps")) {
				return { code: 0, stdout: "hermes-webui\n", stderr: "" };
			}
			if (cmd.includes("curl")) {
				if (callCounts[cmd] === 1) {
					return { code: 22, stdout: "", stderr: "" };
				}
				return { code: 0, stdout: "", stderr: "" };
			}
			if (cmd.includes("sleep")) {
				return { code: 0, stdout: "", stderr: "" };
			}
			return { code: 0, stdout: "", stderr: "" };
		});

		await assertWebUiReachable({ execCommand } as never, 8787);
		expect(execCommand).toHaveBeenCalledWith("sleep 5");
	});
});
