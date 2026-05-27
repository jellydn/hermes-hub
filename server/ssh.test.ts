import { describe, expect, it } from "vitest";
import { parseAndValidateOs, UnsupportedOsError } from "./ssh";

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
