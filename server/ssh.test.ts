import { describe, expect, it } from "vitest";
import { parseAndValidateOs, UnsupportedOsError } from "./ssh";

describe("parseAndValidateOs", () => {
	it("accepts Ubuntu 22.04 and returns normalized server info", () => {
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
		});
	});

	it("rejects unsupported operating systems", () => {
		expect(() =>
			parseAndValidateOs(
				[
					'NAME="Ubuntu"',
					'VERSION_ID="20.04"',
					'PRETTY_NAME="Ubuntu 20.04"',
					"ID=ubuntu",
				].join("\n"),
				"x86_64\n",
			),
		).toThrowError(UnsupportedOsError);
	});
});
