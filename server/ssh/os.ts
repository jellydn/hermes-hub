import { UnsupportedOsError } from "./errors";

export type VerifiedServerInfo = {
	osName: string;
	osVersion: string;
	architecture: string;
	raw: Record<string, string>;
	supportLevel: "supported" | "untested";
};

export function parseAndValidateOs(
	osReleaseContent: string,
	architectureOutput: string,
): VerifiedServerInfo {
	const raw: Record<string, string> = {};
	for (const line of osReleaseContent.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed) {
			continue;
		}

		const separator = trimmed.split("=");
		if (separator.length < 2) {
			continue;
		}

		const key = separator[0] ?? "";
		const value = separator.slice(1).join("=").replace(/^"|"$/g, "");
		if (!key) {
			continue;
		}

		raw[key] = value;
	}

	const osId = raw.ID?.toLowerCase();
	const prettyName = raw.PRETTY_NAME ?? raw.NAME ?? "Unknown OS";
	const versionId = raw.VERSION_ID ?? "unknown";
	const architecture = architectureOutput.trim();

	// Non-Linux or missing os-release: throw
	if (!osId || osId === "unknown") {
		throw new UnsupportedOsError(
			`Unsupported OS: ${prettyName}. This server does not appear to run a Linux distribution with /etc/os-release.`,
		);
	}

	const majorVersion = Number.parseInt(versionId.split(".")[0] ?? "0", 10);

	// Ubuntu 22.04+ and Debian 12+ are officially supported
	if (
		(osId === "ubuntu" && majorVersion >= 22) ||
		(osId === "debian" && majorVersion >= 12)
	) {
		return {
			osName: prettyName,
			osVersion: versionId,
			architecture,
			raw,
			supportLevel: "supported",
		};
	}

	// Ubuntu < 22, Debian < 12, or any other Linux distro → warn-and-proceed
	return {
		osName: prettyName,
		osVersion: versionId,
		architecture,
		raw,
		supportLevel: "untested",
	};
}
