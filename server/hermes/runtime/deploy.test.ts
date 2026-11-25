import { describe, expect, it } from "vitest";

import { defaultHermesImage, legacyDefaultHermesImages } from "../../constants";
import {
	assertHermesSupportsProvider,
	assertValidComposeServiceNames,
	buildComposeUpCommand,
	composePull,
	composeUp,
	composeUpAll,
	runPairingCommand,
	writeComposeFile,
} from "../runtime";
import { mockSsh } from "./test-helpers";

describe("runPairingCommand", () => {
	it("executes python via docker and returns parsed JSON", async () => {
		const { execCommand } = mockSsh(() => ({
			code: 0,
			stdout: JSON.stringify({ pending: [], approved: [] }),
			stderr: "",
		}));

		const result = await runPairingCommand(
			{ execCommand } as never,
			'print(json.dumps({"status": "ok"}))',
		);

		expect(result).toEqual({ pending: [], approved: [] });
		expect(execCommand).toHaveBeenCalledWith(
			expect.stringContaining("docker exec"),
			expect.objectContaining({ execOptions: { timeout: 30_000 } }),
		);
	});

	it("includes env vars in the docker exec command", async () => {
		let capturedCmd = "";
		const { execCommand } = mockSsh((cmd: string) => {
			capturedCmd = cmd;
			return { code: 0, stdout: "{}", stderr: "" };
		});

		await runPairingCommand({ execCommand } as never, "print(42)", {
			PAIRING_CODE: "ABC12345",
		});

		expect(capturedCmd).toContain("-e 'PAIRING_CODE=ABC12345'");
	});

	it("includes the chown repair command before docker exec", async () => {
		let capturedCmd = "";
		const { execCommand } = mockSsh((cmd: string) => {
			capturedCmd = cmd;
			return { code: 0, stdout: "{}", stderr: "" };
		});

		await runPairingCommand({ execCommand } as never, "print(1)");

		expect(capturedCmd).toContain("sudo docker exec hermes sh -lc");
		expect(capturedCmd).toContain("chown -R hermes:hermes");
		expect(capturedCmd).toContain("&& sudo docker exec --user hermes");
	});

	it("throws when the docker command fails", async () => {
		const { execCommand } = mockSsh(() => ({
			code: 1,
			stdout: "",
			stderr: "container not running",
		}));

		await expect(
			runPairingCommand({ execCommand } as never, "print(1)"),
		).rejects.toThrow("container not running");
	});

	it("throws when the stdout is not valid JSON", async () => {
		const { execCommand } = mockSsh(() => ({
			code: 0,
			stdout: "not json at all",
			stderr: "",
		}));

		await expect(
			runPairingCommand({ execCommand } as never, "print(1)"),
		).rejects.toThrow(/Invalid pairing response/);
	});
});

describe("assertValidComposeServiceNames", () => {
	it("accepts valid docker compose service names", () => {
		expect(() =>
			assertValidComposeServiceNames(["hermes", "hermes-webui"]),
		).not.toThrow();
	});

	it("rejects names with shell metacharacters", () => {
		expect(() => assertValidComposeServiceNames(["hermes;rm -rf /"])).toThrow(
			/Invalid compose service name/,
		);
	});
});

describe("writeComposeFile", () => {
	it("writes content via heredoc with a random UUID delimiter", async () => {
		let capturedCmd = "";
		const { execCommand } = mockSsh((cmd: string) => {
			capturedCmd = cmd;
			return { code: 0, stdout: "", stderr: "" };
		});

		await writeComposeFile({ execCommand } as never, "services:\n  hermes: {}");

		expect(capturedCmd).toContain("cat > ~/hermes/docker-compose.yml <<");
		expect(capturedCmd).toContain("HERMES_COMPOSE_");
		expect(capturedCmd).toContain("services:\n  hermes: {}");
	});

	const updatedImage =
		"nousresearch/hermes-agent@sha256:1111111111111111111111111111111111111111111111111111111111111111";
	const compose = `services:\n  hermes:\n    image: ${defaultHermesImage}\n`;

	async function writeOver(existingImage: string) {
		let written = "";
		const { execCommand } = mockSsh((cmd: string) => {
			if (cmd.startsWith("sed -n")) {
				return { code: 0, stdout: `${existingImage}\n`, stderr: "" };
			}
			written = cmd;
			return { code: 0, stdout: "", stderr: "" };
		});
		await writeComposeFile({ execCommand } as never, compose);
		return written;
	}

	it("keeps the image a server got from Update Hermes", async () => {
		const written = await writeOver(updatedImage);
		expect(written).toContain(`image: ${updatedImage}`);
		expect(written).not.toContain(defaultHermesImage);
	});

	it("moves a server off an earlier Hub default image", async () => {
		const written = await writeOver(legacyDefaultHermesImages[0] ?? "");
		expect(written).toContain(`image: ${defaultHermesImage}`);
	});

	it("ignores an image line that is not a Hermes ref", async () => {
		const written = await writeOver(
			"nousresearch/hermes-agent:latest; rm -rf /",
		);
		expect(written).toContain(`image: ${defaultHermesImage}`);
	});

	it("throws when the write fails", async () => {
		const { execCommand } = mockSsh(() => ({
			code: 1,
			stdout: "",
			stderr: "Permission denied",
		}));

		await expect(
			writeComposeFile({ execCommand } as never, "services: {}"),
		).rejects.toThrow("Permission denied");
	});
});

describe("buildComposeUpCommand", () => {
	it("builds full-stack compose when no services are targeted", () => {
		expect(buildComposeUpCommand()).toBe(
			"cd ~/hermes && sudo docker compose up -d",
		);
	});

	it("targets specific services with --no-deps", () => {
		expect(buildComposeUpCommand({ services: ["hermes-webui"] })).toBe(
			"cd ~/hermes && sudo docker compose up -d --no-deps hermes-webui",
		);
	});

	it("pulls before up when pull is requested", () => {
		expect(
			buildComposeUpCommand({ services: ["hermes-webui"], pull: true }),
		).toBe(
			"cd ~/hermes && sudo docker compose pull hermes-webui && sudo docker compose up -d --no-deps hermes-webui",
		);
	});

	it("adds --force-recreate when requested", () => {
		expect(
			buildComposeUpCommand({
				services: ["hermes-webui"],
				pull: true,
				forceRecreate: true,
			}),
		).toBe(
			"cd ~/hermes && sudo docker compose pull hermes-webui && sudo docker compose up -d --force-recreate --no-deps hermes-webui",
		);
	});
});

describe("composeUp", () => {
	it("builds the command and executes it over SSH", async () => {
		const { execCommand } = mockSsh(() => ({
			code: 0,
			stdout: "",
			stderr: "",
		}));

		await composeUp({ execCommand } as never, {
			services: ["hermes-webui"],
			pull: true,
		});

		expect(execCommand).toHaveBeenCalledWith(
			"cd ~/hermes && sudo docker compose pull hermes-webui && sudo docker compose up -d --no-deps hermes-webui",
		);
	});

	it("throws when the command fails", async () => {
		const { execCommand } = mockSsh(() => ({
			code: 1,
			stdout: "",
			stderr: "up failed",
		}));

		await expect(composeUp({ execCommand } as never)).rejects.toThrow(
			"up failed",
		);
	});
});

describe("composePull", () => {
	it("pulls all images", async () => {
		const { execCommand } = mockSsh(() => ({
			code: 0,
			stdout: "Pulled\n",
			stderr: "",
		}));

		await composePull({ execCommand } as never);

		expect(execCommand).toHaveBeenCalledWith(
			"cd ~/hermes && sudo docker compose pull",
		);
	});

	it("throws on failure", async () => {
		const { execCommand } = mockSsh(() => ({
			code: 1,
			stdout: "",
			stderr: "Network error",
		}));

		await expect(composePull({ execCommand } as never)).rejects.toThrow(
			"Network error",
		);
	});
});

describe("composeUpAll", () => {
	it("brings up all services", async () => {
		const { execCommand } = mockSsh(() => ({
			code: 0,
			stdout: "Started\n",
			stderr: "",
		}));

		await composeUpAll({ execCommand } as never);

		expect(execCommand).toHaveBeenCalledWith(
			"cd ~/hermes && sudo docker compose up -d",
		);
	});

	it("throws on failure", async () => {
		const { execCommand } = mockSsh(() => ({
			code: 1,
			stdout: "",
			stderr: "Startup error",
		}));

		await expect(composeUpAll({ execCommand } as never)).rejects.toThrow(
			"Startup error",
		);
	});
});

describe("assertHermesSupportsProvider", () => {
	function sshWithVersion(stdout: string, code = 0) {
		return mockSsh(() => ({ code, stdout, stderr: "" })) as never;
	}

	it("rejects OpenCode Go on Hermes older than v0.21.6", async () => {
		await expect(
			assertHermesSupportsProvider(
				sshWithVersion("Hermes Agent v0.21.5 (2026.10.1)"),
				"opencode-go",
			),
		).rejects.toThrow(/v0\.21\.5.*v0\.21\.6/);
	});

	it("allows OpenCode Go on v0.21.6 and later", async () => {
		await expect(
			assertHermesSupportsProvider(
				sshWithVersion("Hermes Agent v0.21.6 (2026.10.8)"),
				"opencode-go",
			),
		).resolves.toBeUndefined();
	});

	it("does not block when the version cannot be read", async () => {
		await expect(
			assertHermesSupportsProvider(sshWithVersion("", 1), "opencode-go"),
		).resolves.toBeUndefined();
	});
});
