import { describe, expect, it, vi } from "vitest";

import {
	isContainerRunning,
	isWebUiContainerRunning,
} from "../runtime";

function mockSsh(
	execImpl?: (
		cmd: string,
		opts?: unknown,
	) => { code: number; stdout: string; stderr: string },
) {
	const execCommand = vi.fn(async (cmd: string, opts?: unknown) => {
		if (execImpl) {
			return execImpl(cmd, opts);
		}
		return { code: 0, stdout: "", stderr: "" };
	});
	return { execCommand };
}

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
