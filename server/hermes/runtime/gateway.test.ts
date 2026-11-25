import { describe, expect, it, vi } from "vitest";

import {
	isValidDockerTag,
	restartGateway,
	rollbackGateway,
	setProviderModel,
	updateGateway,
} from "../runtime";
import { mockDockerHost, mockSsh } from "./test-helpers";

vi.mock("../version", () => ({
	getLatestImageRef: vi.fn().mockResolvedValue({
		tag: "latest",
		digest:
			"sha256:4c8aceb35c5b309ebeb0c3bafed52544aff3ff78005cbcfb744ddbaa8829d924",
		pushedAt: "2026-08-06T12:00:00.000Z",
	}),
}));

const OLD_IMAGE =
	"nousresearch/hermes-agent@sha256:0df64d3f063ed22f9a0287d0f7a4c314ed9a504cbdefe55d6803b0d40761dcb9";

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
	it("pulls the latest digest before it rewrites compose, then recreates", async () => {
		const { execCommand } = mockDockerHost({
			composeImage: OLD_IMAGE,
			containerImage: OLD_IMAGE,
			swapStdout: "Updated\n",
		});

		const { imageRef, output } = await updateGateway({ execCommand } as never);

		const command = String(
			execCommand.mock.calls.find(([cmd]) => cmd.includes("docker pull"))?.[0],
		);
		// A failed pull must leave docker-compose.yml unchanged.
		expect(command.indexOf(`sudo docker pull ${imageRef}`)).toBeGreaterThan(-1);
		expect(command.indexOf(`sudo docker pull ${imageRef}`)).toBeLessThan(
			command.indexOf("sudo sed -i.bak"),
		);
		expect(command).toContain("--no-deps hermes");
		expect(imageRef).toBe(
			"nousresearch/hermes-agent@sha256:4c8aceb35c5b309ebeb0c3bafed52544aff3ff78005cbcfb744ddbaa8829d924",
		);
		expect(output).toBe("Updated");
	});

	it("uses an explicit digest target when provided", async () => {
		const { execCommand } = mockDockerHost({
			composeImage: OLD_IMAGE,
			containerImage: OLD_IMAGE,
			swapStdout: "ok",
		});

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
		const { execCommand } = mockDockerHost({
			composeImage: OLD_IMAGE,
			containerImage: OLD_IMAGE,
			swapStdout: "ok",
		});

		const { imageRef } = await updateGateway({ execCommand } as never, {
			tag: "v2026.8.3",
		});

		expect(execCommand).toHaveBeenCalledWith(
			expect.stringContaining("nousresearch/hermes-agent:v2026.8.3"),
		);
		expect(imageRef).toBe("nousresearch/hermes-agent:v2026.8.3");
	});

	it("sed matches both @sha256 and :tag forms", async () => {
		const { execCommand } = mockDockerHost({
			composeImage: OLD_IMAGE,
			containerImage: OLD_IMAGE,
			swapStdout: "ok",
		});

		await updateGateway({ execCommand } as never, { tag: "v1.0.0" });

		const callArg = execCommand.mock.calls[1][0] as string;
		expect(callArg).toContain("s|image: nousresearch/hermes-agent@.*|");
		expect(callArg).toContain("s|image: nousresearch/hermes-agent:.*|");
	});

	it("falls back to :latest tag when getLatestImageRef fails", async () => {
		const { getLatestImageRef } = await import("../version");
		vi.mocked(getLatestImageRef).mockResolvedValueOnce(null);

		const { execCommand } = mockDockerHost({
			composeImage: OLD_IMAGE,
			containerImage: OLD_IMAGE,
			swapStdout: "ok",
		});

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
		const { execCommand } = mockDockerHost({
			composeImage: OLD_IMAGE,
			containerImage: OLD_IMAGE,
			swapStdout: "Rolled back\n",
		});

		const { output } = await rollbackGateway(
			{ execCommand } as never,
			"v1.2.3",
		);

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
		const { execCommand } = mockDockerHost({
			composeImage: OLD_IMAGE,
			containerImage: OLD_IMAGE,
			swapStdout: "ok",
		});

		await rollbackGateway({ execCommand } as never, "   ");

		expect(execCommand).toHaveBeenCalledWith(
			expect.stringContaining("nousresearch/hermes-agent:latest"),
		);
	});

	it("sed matches digest-pinned image lines for rollback", async () => {
		const { execCommand } = mockDockerHost({
			composeImage: OLD_IMAGE,
			containerImage: OLD_IMAGE,
			swapStdout: "ok",
		});

		await rollbackGateway({ execCommand } as never, "v1.0.0");

		const callArg = execCommand.mock.calls[1][0] as string;
		expect(callArg).toContain("s|image: nousresearch/hermes-agent@.*|");
		expect(callArg).toContain("s|image: nousresearch/hermes-agent:.*|");
		expect(callArg).toContain("image: nousresearch/hermes-agent:v1.0.0");
	});

	it("accepts the full digest ref that Update Hermes records", async () => {
		const ref =
			"nousresearch/hermes-agent@sha256:ef0650d523ee1b5ab32c779acabc446d9936869a9932591553688a62bcf0c42f";
		const { execCommand } = mockDockerHost({
			composeImage: "nousresearch/hermes-agent:v0.23.4",
			containerImage: "nousresearch/hermes-agent:v0.23.4",
		});

		const result = await rollbackGateway({ execCommand } as never, ref);

		expect(result.imageRef).toBe(ref);
		expect(result.previousImageRef).toBe("nousresearch/hermes-agent:v0.23.4");
		expect(execCommand).toHaveBeenCalledWith(
			expect.stringContaining(`sudo docker pull ${ref}`),
		);
	});

	it("records the running digest when compose uses a movable tag", async () => {
		const running =
			"nousresearch/hermes-agent@sha256:ef0650d523ee1b5ab32c779acabc446d9936869a9932591553688a62bcf0c42f";
		const { execCommand } = mockDockerHost({
			composeImage: "nousresearch/hermes-agent:latest",
			containerImage: "nousresearch/hermes-agent:latest",
			repoDigests: [running],
		});

		const result = await rollbackGateway({ execCommand } as never, "v0.21.6");

		expect(result.previousImageRef).toBe(running);
		// If the new image fails to start, compose goes back to the old digest,
		// not to `:latest`, which the pull may have moved.
		expect(execCommand).toHaveBeenCalledWith(
			expect.stringContaining(
				`|| { sudo sed -i 's|image: nousresearch/hermes-agent@.*|image: ${running}|; s|image: nousresearch/hermes-agent:.*|image: ${running}|' docker-compose.yml; sudo docker compose up -d --no-deps hermes; exit 1; }`,
			),
		);
	});
});

describe("image swap against the running container", () => {
	const NEW_IMAGE =
		"nousresearch/hermes-agent@sha256:4c8aceb35c5b309ebeb0c3bafed52544aff3ff78005cbcfb744ddbaa8829d924";

	it("records the image the container runs when compose already names another", async () => {
		const { execCommand } = mockDockerHost({
			composeImage: NEW_IMAGE,
			containerImage: OLD_IMAGE,
		});

		const result = await updateGateway({ execCommand } as never);

		expect(result.imageRef).toBe(NEW_IMAGE);
		expect(result.previousImageRef).toBe(OLD_IMAGE);
	});

	it("fails when compose up exits 0 but the container keeps the old image", async () => {
		const { execCommand } = mockDockerHost({
			composeImage: OLD_IMAGE,
			containerImage: OLD_IMAGE,
			onSwap: "keep",
		});

		await expect(updateGateway({ execCommand } as never)).rejects.toThrow(
			`Failed to update Hermes: the hermes container runs ${OLD_IMAGE}, not ${NEW_IMAGE}.`,
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
			"sudo docker exec hermes hermes config set model.default 'gpt-4o'",
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
