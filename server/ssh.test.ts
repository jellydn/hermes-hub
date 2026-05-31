import { describe, expect, it } from "vitest";
import {
	normalizeSshError,
	parseAndValidateOs,
	SshConnectError,
	shellQuote,
	UnsupportedOsError,
} from "./ssh";

describe("parseAndValidateOs", () => {
	it("accepts Ubuntu 22.04 and returns normalized server info with supported level", () => {
		const result = parseAndValidateOs(
			[
				'NAME="Ubuntu"',
				'VERSION_ID="22.04"',
				'PRETTY_NAME="Ubuntu 22.04.4 LTS"',
				"ID=ubuntu",
			].join("\n"),
			"x86_64\n",
		);

		expect(result).toMatchObject({
			osName: "Ubuntu 22.04.4 LTS",
			osVersion: "22.04",
			architecture: "x86_64",
			supportLevel: "supported",
		});
	});

	it("allows older Ubuntu versions with untested support level", () => {
		const result = parseAndValidateOs(
			[
				'NAME="Ubuntu"',
				'VERSION_ID="20.04"',
				'PRETTY_NAME="Ubuntu 20.04"',
				"ID=ubuntu",
			].join("\n"),
			"x86_64\n",
		);

		expect(result).toMatchObject({
			osName: "Ubuntu 20.04",
			osVersion: "20.04",
			architecture: "x86_64",
			supportLevel: "untested",
		});
	});

	it("allows non-Ubuntu/Debian Linux distros with untested support level", () => {
		const result = parseAndValidateOs(
			[
				'NAME="Fedora Linux"',
				'VERSION_ID="38"',
				'PRETTY_NAME="Fedora Linux 38 (Workstation Edition)"',
				"ID=fedora",
			].join("\n"),
			"x86_64\n",
		);

		expect(result).toMatchObject({
			osName: "Fedora Linux 38 (Workstation Edition)",
			osVersion: "38",
			architecture: "x86_64",
			supportLevel: "untested",
		});
	});

	it("rejects non-Linux or missing os-release", () => {
		expect(() =>
			parseAndValidateOs(
				[
					'NAME="FreeBSD"',
					'VERSION_ID="13.2"',
					'PRETTY_NAME="FreeBSD 13.2-RELEASE"',
					"ID=",
				].join("\n"),
				"x86_64\n",
			),
		).toThrowError(UnsupportedOsError);

		expect(() => parseAndValidateOs("\n", "x86_64\n")).toThrowError(
			UnsupportedOsError,
		);
	});
});

describe("normalizeSshError", () => {
	it("maps auth-related messages to invalid credentials", () => {
		const err = new Error("All configured authentication methods failed");
		const normalized = normalizeSshError(err);
		expect(normalized).toBeInstanceOf(SshConnectError);
		expect(normalized.message).toBe("invalid credentials");
	});

	it("maps network/timeouts to host unreachable", () => {
		const err = new Error("Connection timed out");
		const normalized = normalizeSshError(err);
		expect(normalized).toBeInstanceOf(SshConnectError);
		expect(normalized.message).toBe("host unreachable");
	});

	it("passes through UnsupportedOsError unchanged", () => {
		const err = new UnsupportedOsError("no /etc/os-release");
		const normalized = normalizeSshError(err);
		expect(normalized).toBe(err);
	});

	it("defaults unknown errors to host unreachable SshConnectError", () => {
		const err = new Error("something else went wrong");
		const normalized = normalizeSshError(err);
		expect(normalized).toBeInstanceOf(SshConnectError);
		expect(normalized.message).toBe("host unreachable");
	});
});

describe("shellQuote", () => {
	it("wraps a simple string in single quotes", () => {
		expect(shellQuote("hello")).toBe("'hello'");
	});

	it("escapes single quotes via the shell-standard '\\'' sequence", () => {
		const result = shellQuote("it's");
		expect(result).toBe("'it'\\''s'");
	});

	it("escapes multiple single quotes", () => {
		const result = shellQuote("'a' 'b'");
		expect(result).toBe("''\\''a'\\'' '\\''b'\\'''");
	});

	it("wraps shell metacharacters as literal text", () => {
		const result = shellQuote("$(rm -rf /)");
		expect(result).toBe("'$(rm -rf /)'");
	});

	it("wraps backtick command substitution as literal text", () => {
		const result = shellQuote("`whoami`");
		expect(result).toBe("'`whoami`'");
	});

	it("wraps semicolons and pipes as literal text", () => {
		const result = shellQuote("; rm -rf / || echo pwned");
		expect(result).toBe("'; rm -rf / || echo pwned'");
	});

	it("handles empty strings", () => {
		expect(shellQuote("")).toBe("''");
	});

	it("handles strings with only single quotes", () => {
		const result = shellQuote("'''");
		expect(result).toBe("''\\'''\\'''\\'''");
	});
});
