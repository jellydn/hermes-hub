import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	formatHermesCliImportFailure,
	formatWebUiContainerFailureDetails,
} from "../hermes/diagnostics-formatting";
import { assertWebUiReachable } from "../hermes/runtime";
import { formatWebUiProxyError, isRemotePortUnreachable } from "./handlers";

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

describe("formatHermesCliImportFailure", () => {
	it("includes the import error and recent container logs", () => {
		expect(
			formatHermesCliImportFailure(
				"ModuleNotFoundError: No module named 'hermes_cli'",
				"running exit=0 error=",
				"startup ok\nimport failed",
			),
		).toContain("cannot import hermes_cli");
		expect(
			formatHermesCliImportFailure(
				"ModuleNotFoundError: No module named 'hermes_cli'",
				"running exit=0 error=",
				"startup ok\nimport failed",
			),
		).toContain("import failed");
	});

	it("falls back when diagnostics are unavailable", () => {
		expect(formatHermesCliImportFailure(undefined, undefined, undefined)).toBe(
			"Hermes Web UI cannot import hermes_cli (unknown import error).",
		);
	});
});

describe("formatWebUiContainerFailureDetails", () => {
	it("preserves the final failure line when startup logs are long", () => {
		const fatal = "!! ERROR: HERMES_WEBUI_STATE_DIR not set";
		const logs = `UNIQUE_START_MARKER\n${"EARLY_INIT_NOISE\n".repeat(
			200,
		)}${fatal}`;
		const message = formatWebUiContainerFailureDetails(
			"restarting exit=1 error=",
			logs,
		);

		expect(message).toContain(fatal);
		expect(message).not.toContain("UNIQUE_START_MARKER");
		expect(message).toContain("...");
	});

	it("keeps container state and recent logs together", () => {
		expect(
			formatWebUiContainerFailureDetails(
				"exited exit=1 error=",
				"startup failed",
			),
		).toBe("exited exit=1 error=. Recent logs: startup failed");
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

describe("assertWebUiReachable", () => {
	const execCommand = vi.fn();

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("waits for the container to enter the running state before probing HTTP", async () => {
		execCommand
			.mockResolvedValueOnce({ stdout: "", stderr: "", code: 0 })
			.mockResolvedValueOnce({ stdout: "", stderr: "", code: 0 })
			.mockResolvedValueOnce({
				stdout: "hermes-webui",
				stderr: "",
				code: 0,
			})
			.mockResolvedValueOnce({ stdout: "", stderr: "", code: 0 })
			.mockResolvedValueOnce({ stdout: "", stderr: "", code: 0 });

		await assertWebUiReachable({ execCommand } as never, 8787);

		expect(execCommand).toHaveBeenNthCalledWith(
			1,
			expect.stringContaining("sudo docker ps"),
		);
		expect(execCommand).toHaveBeenNthCalledWith(2, "sleep 5");
		expect(execCommand).toHaveBeenNthCalledWith(
			4,
			"curl -sf -o /dev/null --max-time 5 http://127.0.0.1:8787/login",
		);
		expect(execCommand).toHaveBeenNthCalledWith(
			5,
			`sudo docker exec hermes-webui /app/venv/bin/python -c "import hermes_cli"`,
		);
	});

	it("keeps probing HTTP until the login endpoint responds", async () => {
		execCommand
			.mockResolvedValueOnce({
				stdout: "hermes-webui",
				stderr: "",
				code: 0,
			})
			.mockResolvedValueOnce({ stdout: "", stderr: "", code: 22 })
			.mockResolvedValueOnce({ stdout: "", stderr: "", code: 0 })
			.mockResolvedValueOnce({
				stdout: "hermes-webui",
				stderr: "",
				code: 0,
			})
			.mockResolvedValueOnce({ stdout: "", stderr: "", code: 0 })
			.mockResolvedValueOnce({ stdout: "", stderr: "", code: 0 });

		await assertWebUiReachable({ execCommand } as never, 8787);

		expect(execCommand).toHaveBeenCalledWith("sleep 5");
		expect(execCommand).toHaveBeenCalledWith(
			"curl -sf -o /dev/null --max-time 5 http://127.0.0.1:8787/login",
		);
		expect(execCommand).toHaveBeenCalledWith(
			`sudo docker exec hermes-webui /app/venv/bin/python -c "import hermes_cli"`,
		);
	});

	it("reports container diagnostics when hermes_cli import fails", async () => {
		execCommand
			.mockResolvedValueOnce({
				stdout: "hermes-webui",
				stderr: "",
				code: 0,
			})
			.mockResolvedValueOnce({ stdout: "", stderr: "", code: 0 })
			.mockResolvedValueOnce({
				stdout: "",
				stderr: "ModuleNotFoundError: No module named 'hermes_cli'",
				code: 1,
			})
			.mockResolvedValueOnce({
				stdout: "running exit=0 error=",
				stderr: "",
				code: 0,
			})
			.mockResolvedValueOnce({
				stdout: `${"init noise\n".repeat(40)}!! ERROR: hermes_cli missing`,
				stderr: "",
				code: 0,
			});

		await expect(
			assertWebUiReachable({ execCommand } as never, 8787),
		).rejects.toThrow(/hermes_cli missing/i);
	});

	it("reports container diagnostics when the service never stays running", async () => {
		for (let attempt = 0; attempt < 59; attempt += 1) {
			execCommand.mockResolvedValueOnce({ stdout: "", stderr: "", code: 0 });
			execCommand.mockResolvedValueOnce({ stdout: "", stderr: "", code: 0 });
		}
		execCommand.mockResolvedValueOnce({ stdout: "", stderr: "", code: 0 });
		execCommand.mockResolvedValueOnce({
			stdout: "exited exit=1 error=",
			stderr: "",
			code: 0,
		});
		execCommand.mockResolvedValueOnce({
			stdout: `${"init noise\n".repeat(40)}!! ERROR: subscript failed`,
			stderr: "",
			code: 0,
		});

		await expect(
			assertWebUiReachable({ execCommand } as never, 8787),
		).rejects.toThrow(/subscript failed/i);
	});
});
