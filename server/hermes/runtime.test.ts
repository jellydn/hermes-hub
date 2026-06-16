import { describe, expect, it } from "vitest";

import {
	hermesContainerName,
	readContainerDiagnostics,
	readWebUiContainerDiagnostics,
	WEB_UI_CONTAINER,
} from "./runtime";
import { mockSsh } from "./runtime/test-helpers";

describe("constants", () => {
	it("exports canonical container names", () => {
		expect(hermesContainerName).toBe("hermes");
		expect(WEB_UI_CONTAINER).toBe("hermes-webui");
	});
});

describe("readContainerDiagnostics", () => {
	it("reads container state and recent logs in parallel", async () => {
		const { execCommand } = mockSsh((cmd: string) => {
			if (cmd.includes("docker inspect")) {
				return { code: 0, stdout: "running exit=0 error=", stderr: "" };
			}
			return { code: 0, stdout: "startup ok\nlistening on :8787", stderr: "" };
		});

		const diag = await readContainerDiagnostics(
			{ execCommand } as never,
			"hermes-webui",
		);

		expect(diag.state).toBe("running exit=0 error=");
		expect(diag.logs).toBe("startup ok\nlistening on :8787");
		expect(execCommand).toHaveBeenCalledTimes(2);
	});

	it("falls back to stderr when stdout is empty", async () => {
		const { execCommand } = mockSsh((cmd: string) => {
			if (cmd.includes("docker inspect")) {
				return { code: 1, stdout: "", stderr: "Error: No such container" };
			}
			return { code: 1, stdout: "", stderr: "docker: no container found" };
		});

		const diag = await readContainerDiagnostics(
			{ execCommand } as never,
			"missing-container",
		);

		expect(diag.state).toBe("Error: No such container");
		expect(diag.logs).toBe("docker: no container found");
	});
});

describe("readWebUiContainerDiagnostics", () => {
	it("delegates to readContainerDiagnostics with Web UI container name", async () => {
		const { execCommand } = mockSsh((cmd: string) => {
			if (cmd.includes("docker inspect")) {
				return { code: 0, stdout: "exited exit=1 error=", stderr: "" };
			}
			return { code: 0, stdout: "!! ERROR: port already in use", stderr: "" };
		});

		const diag = await readWebUiContainerDiagnostics({
			execCommand,
		} as never);

		expect(diag.state).toBe("exited exit=1 error=");
		expect(diag.logs).toContain("ERROR");
	});
});
