import { describe, expect, it } from "vitest";

import {
	buildWebUiAgentSourceSyncCommand,
	syncAgentSourceForWebUi,
} from "../runtime";
import { mockSsh } from "./test-helpers";

describe("buildWebUiAgentSourceSyncCommand", () => {
	it("builds the mkdir + cp + chown chain", () => {
		const cmd = buildWebUiAgentSourceSyncCommand();
		expect(cmd).toContain("sudo mkdir -p");
		expect(cmd).toContain("sudo rm -rf");
		expect(cmd).toContain("sudo docker cp");
		expect(cmd).toContain("sudo chown -R");
		expect(cmd).toContain(" && ");
	});
});

describe("syncAgentSourceForWebUi", () => {
	it("checks Hermes is running, verifies source, then syncs", async () => {
		const { execCommand } = mockSsh((cmd: string) => {
			if (cmd.includes("docker ps")) {
				return { code: 0, stdout: "hermes\n", stderr: "" };
			}
			if (cmd.includes("test -d")) {
				return { code: 0, stdout: "", stderr: "" };
			}
			return { code: 0, stdout: "", stderr: "" };
		});

		await syncAgentSourceForWebUi({ execCommand } as never);

		expect(execCommand).toHaveBeenNthCalledWith(
			1,
			expect.stringContaining("sudo docker ps"),
		);
		expect(execCommand).toHaveBeenNthCalledWith(
			2,
			expect.stringContaining("sudo docker exec"),
		);
		expect(execCommand).toHaveBeenNthCalledWith(
			3,
			expect.stringContaining("sudo docker cp"),
		);
	});

	it("throws when Hermes container is not running", async () => {
		const { execCommand } = mockSsh(() => ({
			code: 0,
			stdout: "",
			stderr: "",
		}));

		await expect(
			syncAgentSourceForWebUi({ execCommand } as never),
		).rejects.toThrow(/Hermes container is not running/i);
	});

	it("throws when agent source is missing", async () => {
		const { execCommand } = mockSsh((cmd: string) => {
			if (cmd.includes("docker ps")) {
				return { code: 0, stdout: "hermes\n", stderr: "" };
			}
			return { code: 1, stdout: "", stderr: "" };
		});

		await expect(
			syncAgentSourceForWebUi({ execCommand } as never),
		).rejects.toThrow(/is missing in the Hermes container/);
	});

	it("throws when the sync command fails", async () => {
		const { execCommand } = mockSsh((cmd: string) => {
			if (cmd.includes("docker ps")) {
				return { code: 0, stdout: "hermes\n", stderr: "" };
			}
			if (cmd.includes("test -d")) {
				return { code: 0, stdout: "", stderr: "" };
			}
			return {
				code: 1,
				stdout: "",
				stderr: "docker cp failed: no such directory",
			};
		});

		await expect(
			syncAgentSourceForWebUi({ execCommand } as never),
		).rejects.toThrow(/docker cp failed/);
	});
});
