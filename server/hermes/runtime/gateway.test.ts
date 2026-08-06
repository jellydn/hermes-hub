import { describe, expect, it, vi } from "vitest";

import {
	isValidDockerTag,
	restartGateway,
	rollbackGateway,
	setProviderModel,
	updateGateway,
} from "../runtime";
import { mockSsh } from "./test-helpers";

vi.mock("../version", () => ({
	getLatestImageRef: vi.fn().mockResolvedValue({
		tag: "latest",
		digest:
			"sha256:4c8aceb35c5b309ebeb0c3bafed52544aff3ff78005cbcfb744ddbaa8829d924",
		pushedAt: "2026-08-06T12:00:00.000Z",
	}),
}));

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
	it("rewrites compose to the latest digest, pulls, and recreates", async () => {
		const { execCommand } = mockSsh(() => ({
			code: 0,
			stdout: "Updated\n",
			stderr: "",
		}));

		const { imageRef, output } = await updateGateway({ execCommand } as never);

		expect(execCommand).toHaveBeenCalledWith(
			expect.stringContaining("sudo sed -i.bak"),
		);
		expect(execCommand).toHaveBeenCalledWith(
			expect.stringContaining("sudo docker compose pull hermes"),
		);
		expect(execCommand).toHaveBeenCalledWith(
			expect.stringContaining("--no-deps hermes"),
		);
		expect(imageRef).toBe(
			"nousresearch/hermes-agent@sha256:4c8aceb35c5b309ebeb0c3bafed52544aff3ff78005cbcfb744ddbaa8829d924",
		);
		expect(output).toBe("Updated");
	});

	it("uses an explicit digest target when provided", async () => {
		const { execCommand } = mockSsh(() => ({
			code: 0,
			stdout: "ok",
			stderr: "",
		}));

		const { imageRef } = await updateGateway({ execCommand } as never, {
			digest:
				"sha256:abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
		});

		expect(execCommand).toHaveBeenCalledWith(
			expect.stringContaining(
				"nousresearch/hermes-agent@sha256:abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
			),
		);
		expect(imageRef).toBe(
			"nousresearch/hermes-agent@sha256:abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
		);
	});

	it("uses an explicit tag target when provided", async () => {
		const { execCommand } = mockSsh(() => ({
			code: 0,
			stdout: "ok",
			stderr: "",
		}));

		const { imageRef } = await updateGateway({ execCommand } as never, {
			tag: "v2026.8.3",
		});

		expect(execCommand).toHaveBeenCalledWith(
			expect.stringContaining("nousresearch/hermes-agent:v2026.8.3"),
		);
		expect(imageRef).toBe("nousresearch/hermes-agent:v2026.8.3");
	});

	it("sed matches both @sha256 and :tag forms", async () => {
		const { execCommand } = mockSsh(() => ({
			code: 0,
			stdout: "ok",
			stderr: "",
		}));

		await updateGateway({ execCommand } as never, { tag: "v1.0.0" });

		const callArg = execCommand.mock.calls[0][0] as string;
		expect(callArg).toContain("s|image: nousresearch/hermes-agent@.*|");
		expect(callArg).toContain("s|image: nousresearch/hermes-agent:.*|");
	});

	it("falls back to :latest tag when getLatestImageRef fails", async () => {
		const { getLatestImageRef } = await import("../version");
		vi.mocked(getLatestImageRef).mockResolvedValueOnce(null);

		const { execCommand } = mockSsh(() => ({
			code: 0,
			stdout: "ok",
			stderr: "",
		}));

		const { imageRef } = await updateGateway({ execCommand } as never);

		expect(imageRef).toBe("nousresearch/hermes-agent:latest");
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

	it("sed matches digest-pinned image lines for rollback", async () => {
		const { execCommand } = mockSsh(() => ({
			code: 0,
			stdout: "ok",
			stderr: "",
		}));

		await rollbackGateway({ execCommand } as never, "v1.0.0");

		const callArg = execCommand.mock.calls[0][0] as string;
		expect(callArg).toContain("s|image: nousresearch/hermes-agent@.*|");
		expect(callArg).toContain("s|image: nousresearch/hermes-agent:.*|");
		expect(callArg).toContain("image: nousresearch/hermes-agent:v1.0.0");
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
