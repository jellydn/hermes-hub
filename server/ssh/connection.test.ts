import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { verifyServerConnection, withSshConnection } from "./connection";
import { normalizeSshError, SshConnectError } from "./errors";

const sshConnect = vi.fn();
const dispose = vi.fn();
const execCommand = vi.fn();

vi.mock("node-ssh", () => {
	return {
		NodeSSH: class {
			connection: unknown = {
				hostFingerprint:
					"abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
				hostKeyAlgorithm: "ssh-ed25519",
			};
			connect = (config: { hostVerifier?: (keyHex: string) => boolean }) =>
				sshConnect(config);
			dispose = dispose;
			execCommand = execCommand;
		},
	};
});

const expected = `SHA256:${createHash("sha256").update(Buffer.from("abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789", "hex")).digest("base64")}`;

describe("withSshConnection host key fingerprint", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		sshConnect.mockImplementation(
			async (config: { hostVerifier?: (keyHex: string) => boolean }) => {
				if (config?.hostVerifier) {
					config.hostVerifier(
						"abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
					);
				}
			},
		);
		execCommand.mockResolvedValue({ code: 0, stdout: "ok", stderr: "" });
	});

	it("passes through when no expected fingerprint is set", async () => {
		await withSshConnection(
			{
				host: "203.0.113.1",
				port: 22,
				username: "root",
				authMethod: "password",
				credential: "secret",
			},
			async (ssh) => {
				await ssh.execCommand("uptime");
			},
		);
		const connectArgs = sshConnect.mock.calls[0]?.[0];
		expect(connectArgs?.hostVerifier).toBeUndefined();
	});

	it("rejects with host_key_mismatch and includes the observed key", async () => {
		await expect(
			withSshConnection(
				{
					host: "203.0.113.1",
					port: 22,
					username: "root",
					authMethod: "password",
					credential: "secret",
					expectedFingerprint: "SHA256:ZZZ",
				},
				async () => undefined,
			),
		).rejects.toMatchObject({
			code: "host_key_mismatch",
			hostKey: {
				fingerprint: expected,
				algorithm: "unknown",
			},
		});

		const connectArgs = sshConnect.mock.calls[0]?.[0];
		expect(typeof connectArgs?.hostVerifier).toBe("function");
		expect(() =>
			connectArgs?.hostVerifier?.(
				"abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
			),
		).toThrow(SshConnectError);
	});

	it("accepts when expected fingerprint matches the actual key", async () => {
		execCommand.mockImplementation(async (command: string) => {
			if (command === "cat /etc/os-release") {
				return {
					code: 0,
					stdout: 'NAME="Ubuntu"\nVERSION_ID="22.04"\nID=ubuntu\n',
					stderr: "",
				};
			}
			if (command === "uname -m") {
				return { code: 0, stdout: "x86_64\n", stderr: "" };
			}
			return { code: 0, stdout: "ok", stderr: "" };
		});

		const result = await verifyServerConnection({
			host: "203.0.113.1",
			port: 22,
			username: "root",
			authMethod: "password",
			credential: "secret",
			expectedFingerprint: expected,
		});
		expect(result.hostKey.fingerprint).toBe(expected);
		expect(result.verified.osName).toContain("Ubuntu");

		await withSshConnection(
			{
				host: "203.0.113.1",
				port: 22,
				username: "root",
				authMethod: "password",
				credential: "secret",
				expectedFingerprint: expected,
			},
			async (ssh) => {
				await ssh.execCommand("echo hi");
			},
		);
	});
});

describe("normalizeSshError", () => {
	it("maps 'Host denied (verification failed)' to host_key_mismatch", () => {
		const result = normalizeSshError(
			new Error("Host denied (verification failed)"),
		);
		expect(result).toBeInstanceOf(SshConnectError);
		expect((result as SshConnectError).code).toBe("host_key_mismatch");
	});

	it("maps 'Host key verification failed' to host_key_mismatch", () => {
		const result = normalizeSshError(new Error("Host key verification failed"));
		expect((result as SshConnectError).code).toBe("host_key_mismatch");
	});

	it("maps 'host key fingerprint mismatch' to host_key_mismatch", () => {
		const result = normalizeSshError(
			new Error("host key fingerprint mismatch"),
		);
		expect((result as SshConnectError).code).toBe("host_key_mismatch");
	});

	it("maps auth failures to invalid_credentials", () => {
		const result = normalizeSshError(
			new Error("All configured authentication methods failed"),
		);
		expect((result as SshConnectError).code).toBe("invalid_credentials");
	});

	it("maps connection timeouts to host_unreachable", () => {
		const result = normalizeSshError(new Error("connect ETIMEDOUT"));
		expect((result as SshConnectError).code).toBe("host_unreachable");
	});

	it("returns a default host_unreachable for unknown errors", () => {
		const result = normalizeSshError(new Error("something exotic went wrong"));
		expect((result as SshConnectError).code).toBe("host_unreachable");
	});
});
