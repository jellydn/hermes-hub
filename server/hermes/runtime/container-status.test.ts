import { describe, expect, it } from "vitest";

import {
	hermesContainerName,
	isContainerRunning,
	isWebUiContainerRunning,
	readContainerDiagnostics,
	readWebUiContainerDiagnostics,
	WEB_UI_CONTAINER,
} from "../runtime";
import { mockSsh } from "./test-helpers";

describe("constants", () => {
	it("exports canonical container names", () => {
		expect(hermesContainerName).toBe("hermes");
		expect(WEB_UI_CONTAINER).toBe("hermes-webui");
	});
});

describe("isContainerRunning", () => {
	it("returns true when the container name appears in docker ps output", async () => {
		const { execCommand } = mockSsh(() => ({
			code: 0,
			stdout: "hermes\n",
			stderr: "",
		}));
		const result = await isContainerRunning({ execCommand } as never, "hermes");
		expect(result).toBe(true);
		expect(execCommand).toHaveBeenCalledWith(
			expect.stringContaining("sudo docker ps"),
		);
	});

	it("returns false when the container is not in the output", async () => {
		const { execCommand } = mockSsh(() => ({
			code: 0,
			stdout: "",
			stderr: "",
		}));
		const result = await isContainerRunning(
			{ execCommand } as never,
			"hermes-webui",
		);
		expect(result).toBe(false);
	});

	it("returns false when stdout is empty", async () => {
		const { execCommand } = mockSsh(() => ({
			code: 0,
			stdout: "",
			stderr: "",
		}));
		const result = await isContainerRunning({ execCommand } as never, "hermes");
		expect(result).toBe(false);
	});
});

describe("isWebUiContainerRunning", () => {
	it("delegates to isContainerRunning with the Web UI container name", async () => {
		const { execCommand } = mockSsh(() => ({
			code: 0,
			stdout: "hermes-webui\n",
			stderr: "",
		}));

		expect(await isWebUiContainerRunning({ execCommand } as never)).toBe(true);
		expect(execCommand).toHaveBeenCalledWith(
			expect.stringContaining("hermes-webui"),
		);
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
