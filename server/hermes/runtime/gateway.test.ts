import { describe, expect, it } from "vitest";

import {
	isValidDockerTag,
	restartGateway,
	rollbackGateway,
	setProviderModel,
	updateGateway,
} from "../runtime";
import { mockSsh } from "./test-helpers";

describe("restartGateway", () => {
	it("restarts the Hermes container via docker compose", async () => {
		const { execCommand } = mockSsh(() => ({
			code: 0,
			stdout: "hermes restarted\n",
			stderr: "",
		}));

		const output = await restartGateway({ execCommand } as never);

		expect(execCommand).toHaveBeenCalledWith(
			"cd ~/hermes && sudo docker compose restart hermes",
		);
		expect(output).toBe("hermes restarted");
	});

	it("throws when the restart command fails", async () => {
		const { execCommand } = mockSsh(() => ({
			code: 1,
			stdout: "",
			stderr: "Container not found",
		}));

		await expect(restartGateway({ execCommand } as never)).rejects.toThrow(
			"Container not found",
		);
	});
});

describe("updateGateway", () => {
	it("pulls and recreates the Hermes container", async () => {
		const { execCommand } = mockSsh(() => ({
			code: 0,
			stdout: "Updated\n",
			stderr: "",
		}));

		const output = await updateGateway({ execCommand } as never);

		expect(execCommand).toHaveBeenCalledWith(
			expect.stringContaining("sudo docker compose pull hermes"),
		);
		expect(execCommand).toHaveBeenCalledWith(
			expect.stringContaining("--no-deps hermes"),
		);
		expect(output).toBe("Updated");
	});

	it("throws when the update command fails", async () => {
		const { execCommand } = mockSsh(() => ({
			code: 1,
			stdout: "",
			stderr: "Pull failed",
		}));

		await expect(updateGateway({ execCommand } as never)).rejects.toThrow(
			"Pull failed",
		);
	});
});

describe("isValidDockerTag", () => {
	it("accepts valid Docker image tags", () => {
		expect(isValidDockerTag("latest")).toBe(true);
		expect(isValidDockerTag("v1.2.3")).toBe(true);
		expect(isValidDockerTag("my_image")).toBe(true);
		expect(isValidDockerTag("a")).toBe(true);
	});

	it("rejects tags with shell-injectable characters", () => {
		expect(isValidDockerTag("v1.0; rm -rf /")).toBe(false);
		expect(isValidDockerTag("$(whoami)")).toBe(false);
		expect(isValidDockerTag("tag with spaces")).toBe(false);
	});

	it("rejects tags starting with invalid chars", () => {
		expect(isValidDockerTag(".invalid")).toBe(false);
		expect(isValidDockerTag("-invalid")).toBe(false);
	});
});

describe("rollbackGateway", () => {
	it("pulls a specific tag, updates compose file, and recreates", async () => {
		const { execCommand } = mockSsh(() => ({
			code: 0,
			stdout: "Rolled back\n",
			stderr: "",
		}));

		const output = await rollbackGateway({ execCommand } as never, "v1.2.3");

		expect(execCommand).toHaveBeenCalledWith(
			expect.stringContaining("sudo docker pull"),
		);
		expect(execCommand).toHaveBeenCalledWith(
			expect.stringContaining("sudo sed -i.bak"),
		);
		expect(output).toBe("Rolled back");
	});

	it("throws for invalid image tags", async () => {
		const { execCommand } = mockSsh();

		await expect(
			rollbackGateway({ execCommand } as never, "bad; rm -rf /"),
		).rejects.toThrow(/Invalid image tag/);
	});

	it("throws when the rollback command fails", async () => {
		const { execCommand } = mockSsh(() => ({
			code: 1,
			stdout: "",
			stderr: "Image not found",
		}));

		await expect(
			rollbackGateway({ execCommand } as never, "v9.9.9"),
		).rejects.toThrow("Image not found");
	});

	it("defaults to latest when tag is whitespace", async () => {
		const { execCommand } = mockSsh(() => ({
			code: 0,
			stdout: "ok",
			stderr: "",
		}));

		await rollbackGateway({ execCommand } as never, "   ");

		expect(execCommand).toHaveBeenCalledWith(
			expect.stringContaining("nousresearch/hermes-agent:latest"),
		);
	});
});

describe("setProviderModel", () => {
	it("sleeps then sets the model inside the Hermes container", async () => {
		const { execCommand } = mockSsh(() => ({
			code: 0,
			stdout: "",
			stderr: "",
		}));

		await setProviderModel({ execCommand } as never, "gpt-4o");

		expect(execCommand).toHaveBeenNthCalledWith(1, "sleep 2");
		expect(execCommand).toHaveBeenNthCalledWith(
			2,
			"sudo docker exec hermes hermes config set model 'gpt-4o'",
		);
	});

	it("throws when the config command fails", async () => {
		const { execCommand } = mockSsh((cmd: string) => {
			if (cmd.includes("sleep")) {
				return { code: 0, stdout: "", stderr: "" };
			}
			return { code: 1, stdout: "", stderr: "Hermes not running" };
		});

		await expect(
			setProviderModel({ execCommand } as never, "gpt-4o"),
		).rejects.toThrow("Hermes not running");
	});
});
