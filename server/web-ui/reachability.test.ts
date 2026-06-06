import { beforeEach, describe, expect, it, vi } from "vitest";

import {
	assertWebUiReachable,
	formatWebUiProxyError,
	isRemotePortUnreachable,
} from "./reachability";

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
			.mockResolvedValueOnce({ stdout: "", stderr: "", code: 0 });

		await assertWebUiReachable({ execCommand } as never, 8787);

		expect(execCommand).toHaveBeenCalledWith("sleep 5");
		expect(execCommand).toHaveBeenCalledWith(
			"curl -sf -o /dev/null --max-time 5 http://127.0.0.1:8787/login",
		);
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
			stdout: "startup failed",
			stderr: "",
			code: 0,
		});

		await expect(
			assertWebUiReachable({ execCommand } as never, 8787),
		).rejects.toThrow(/container is not running/i);
	});
});
