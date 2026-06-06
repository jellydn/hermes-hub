import { describe, expect, it, vi } from "vitest";

import {
	formatHermesCliImportFailure,
	formatWebUiContainerFailureDetails,
} from "./diagnostics-formatting";
import {
	assertValidComposeServiceNames,
	assertWebUiReachable,
	buildComposeUpCommand,
	buildWebUiAgentSourceSyncCommand,
	composePull,
	composeUp,
	composeUpAll,
	hermesContainerName,
	isContainerRunning,
	isValidDockerTag,
	isWebUiContainerRunning,
	readContainerDiagnostics,
	readWebUiContainerDiagnostics,
	restartGateway,
	rollbackGateway,
	runPairingCommand,
	setProviderModel,
	syncAgentSourceForWebUi,
	updateGateway,
	WEB_UI_CONTAINER,
	writeComposeFile,
} from "./runtime";

function mockSsh(
	execImpl?: (
		cmd: string,
		opts?: unknown,
	) => { code: number; stdout: string; stderr: string },
) {
	const execCommand = vi.fn(
		async (cmd: string, opts?: unknown) => {
			if (execImpl) {
				return execImpl(cmd, opts);
			}
			return { code: 0, stdout: "", stderr: "" };
		},
	);
	return { execCommand };
}

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
		const result = await isContainerRunning(
			{ execCommand } as never,
			"hermes",
		);
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
		const result = await isContainerRunning(
			{ execCommand } as never,
			"hermes",
		);
		expect(result).toBe(false);
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

describe("isWebUiContainerRunning", () => {
	it("delegates to isContainerRunning with the Web UI container name", async () => {
		const { execCommand } = mockSsh(() => ({
			code: 0,
			stdout: "hermes-webui\n",
			stderr: "",
		}));

		expect(
			await isWebUiContainerRunning({ execCommand } as never),
		).toBe(true);
		expect(execCommand).toHaveBeenCalledWith(
			expect.stringContaining("hermes-webui"),
		);
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

describe("formatWebUiContainerFailureDetails", () => {
	it("combines container state and recent logs", () => {
		expect(
			formatWebUiContainerFailureDetails(
				"exited exit=1 error=",
				"startup failed",
			),
		).toBe("exited exit=1 error=. Recent logs: startup failed");
	});

	it("returns empty string when no diagnostics are available", () => {
		expect(
			formatWebUiContainerFailureDetails(undefined, undefined),
		).toBe("");
	});

	it("truncates long output and preserves the tail with ellipsis", () => {
		const start = "[EARLY_STARTUP_NOISE]";
		const fatal = "!! CRITICAL: subscription crashed";
		const logs = start + "x".repeat(2400) + fatal;
		const result = formatWebUiContainerFailureDetails(
			"restarting exit=1 error=",
			logs,
		);

		expect(result).toContain(fatal);
		expect(result).toContain("...");
		expect(result).not.toContain(start);
	});

	it("returns only prefix when logs are missing", () => {
		expect(
			formatWebUiContainerFailureDetails("running exit=0 error=", undefined),
		).toBe("running exit=0 error=. Recent logs: ");
	});
});

describe("formatHermesCliImportFailure", () => {
	it("includes the import error and container diagnostics", () => {
		const msg = formatHermesCliImportFailure(
			"ModuleNotFoundError: No module named 'hermes_cli'",
			"running exit=0 error=",
			"startup ok\nimport failed",
		);

		expect(msg).toContain("cannot import hermes_cli");
		expect(msg).toContain("import failed");
	});

	it("falls back when diagnostics are unavailable", () => {
		expect(
			formatHermesCliImportFailure(undefined, undefined, undefined),
		).toBe(
			"Hermes Web UI cannot import hermes_cli (unknown import error).",
		);
	});
});

describe("assertWebUiReachable", () => {
	it("succeeds on the first attempt when container is running and HTTP responds", async () => {
		const { execCommand } = mockSsh((cmd: string) => {
			if (cmd.includes("docker ps")) {
				return { code: 0, stdout: "hermes-webui\n", stderr: "" };
			}
			if (cmd.includes("curl")) {
				return { code: 0, stdout: "", stderr: "" };
			}
			return { code: 0, stdout: "", stderr: "" };
		});

		await expect(
			assertWebUiReachable({ execCommand } as never, 8787),
		).resolves.toBeUndefined();
	});

	it("retries after sleeping when container is not yet running", async () => {
		let callCount = 0;
		const { execCommand } = mockSsh((cmd: string) => {
			if (cmd.includes("docker ps")) {
				callCount += 1;
				if (callCount === 1) {
					return { code: 0, stdout: "", stderr: "" };
				}
				return { code: 0, stdout: "hermes-webui\n", stderr: "" };
			}
			if (cmd.includes("sleep")) {
				return { code: 0, stdout: "", stderr: "" };
			}
			if (cmd.includes("curl")) {
				return { code: 0, stdout: "", stderr: "" };
			}
			return { code: 0, stdout: "", stderr: "" };
		});

		await expect(
			assertWebUiReachable({ execCommand } as never, 8787),
		).resolves.toBeUndefined();

		expect(execCommand).toHaveBeenCalledWith("sleep 5");
	});

	it("retries after sleeping when HTTP probe fails", async () => {
		const callCounts: Record<string, number> = {};
		const { execCommand } = mockSsh((cmd: string) => {
			callCounts[cmd] = (callCounts[cmd] ?? 0) + 1;

			if (cmd.includes("docker ps")) {
				return { code: 0, stdout: "hermes-webui\n", stderr: "" };
			}
			if (cmd.includes("curl")) {
				if (callCounts[cmd] === 1) {
					return { code: 22, stdout: "", stderr: "" };
				}
				return { code: 0, stdout: "", stderr: "" };
			}
			if (cmd.includes("sleep")) {
				return { code: 0, stdout: "", stderr: "" };
			}
			return { code: 0, stdout: "", stderr: "" };
		});

		await assertWebUiReachable({ execCommand } as never, 8787);
		expect(execCommand).toHaveBeenCalledWith("sleep 5");
	});
});

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

		await expect(
			restartGateway({ execCommand } as never),
		).rejects.toThrow("Container not found");
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

		await expect(
			updateGateway({ execCommand } as never),
		).rejects.toThrow("Pull failed");
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

		const output = await rollbackGateway(
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

		await runPairingCommand(
			{ execCommand } as never,
			"print(42)",
			{ PAIRING_CODE: "ABC12345" },
		);

		expect(capturedCmd).toContain("-e 'PAIRING_CODE=ABC12345'");
	});

	it("includes the chown repair command before docker exec", async () => {
		let capturedCmd = "";
		const { execCommand } = mockSsh((cmd: string) => {
			capturedCmd = cmd;
			return { code: 0, stdout: "{}", stderr: "" };
		});

		await runPairingCommand(
			{ execCommand } as never,
			"print(1)",
		);

		expect(capturedCmd).toContain("docker exec hermes sh -lc");
		expect(capturedCmd).toContain("chown -R hermes:hermes");
		expect(capturedCmd).toContain("&& docker exec --user hermes");
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
		expect(() =>
			assertValidComposeServiceNames(["hermes;rm -rf /"]),
		).toThrow(/Invalid compose service name/);
	});
});

describe("writeComposeFile", () => {
	it("writes content via heredoc with a random UUID delimiter", async () => {
		let capturedCmd = "";
		const { execCommand } = mockSsh((cmd: string) => {
			capturedCmd = cmd;
			return { code: 0, stdout: "", stderr: "" };
		});

		await writeComposeFile(
			{ execCommand } as never,
			"services:\n  hermes: {}",
		);

		expect(capturedCmd).toContain("cat > ~/hermes/docker-compose.yml <<");
		expect(capturedCmd).toContain("HERMES_COMPOSE_");
		expect(capturedCmd).toContain("services:\n  hermes: {}");
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

		await expect(
			composeUp({ execCommand } as never),
		).rejects.toThrow("up failed");
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

		await expect(
			composePull({ execCommand } as never),
		).rejects.toThrow("Network error");
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

		await expect(
			composeUpAll({ execCommand } as never),
		).rejects.toThrow("Startup error");
	});
});
