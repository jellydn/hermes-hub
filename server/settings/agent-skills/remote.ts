import type { NodeSSH } from "node-ssh";

import { managedComposeVolumeHome } from "../../constants";
import { parseRemoteSkillsList } from "../../hermes/skills-list";
import { shellQuote } from "../../ssh";
import { isValidAgentSkillName } from "./config";

export const MANIFEST_PATH = `${managedComposeVolumeHome}/.hermes/hermeshub-agent-skills.json`;

export const HERMES_SKILLS_LIST_COMMAND =
	"sudo docker exec hermes hermes skills list";

export type ManifestEntry = {
	name: string;
	sourceType: string;
	installRef?: string;
};

export type FileWrite = {
	content: string;
	path: string;
};

export async function readRemoteManifest(
	ssh: NodeSSH,
): Promise<ManifestEntry[]> {
	const result = await ssh.execCommand(
		`sudo cat ${MANIFEST_PATH} 2>/dev/null || true`,
	);
	const content = result.stdout?.trim();
	if (!content) {
		return [];
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(content);
	} catch {
		return [];
	}
	if (!Array.isArray(parsed)) {
		return [];
	}
	return parsed.flatMap((entry): ManifestEntry[] => {
		if (!entry || typeof entry !== "object") {
			return [];
		}
		const { name, sourceType, installRef } = entry as Record<string, unknown>;
		if (typeof name !== "string" || typeof sourceType !== "string") {
			return [];
		}
		if (!isValidAgentSkillName(name)) {
			throw new Error(`Unsafe manifest name '${name}' in ${MANIFEST_PATH}.`);
		}
		return [
			{
				name,
				sourceType,
				installRef: typeof installRef === "string" ? installRef : undefined,
			},
		];
	});
}

export async function writeRemoteFile(
	ssh: NodeSSH,
	path: string,
	content: string,
): Promise<void> {
	const dir = path.substring(0, path.lastIndexOf("/"));
	await ssh.execCommand(`sudo mkdir -p ${shellQuote(dir)}`);
	const result = await ssh.execCommand(
		`sudo tee ${shellQuote(path)} > /dev/null`,
		{ stdin: content },
	);
	if (result.code !== 0) {
		throw new Error(result.stderr || `Failed to write ${path}`);
	}
}

export function buildCustomSkillFileWrite(
	name: string,
	content: string,
): FileWrite {
	return {
		content,
		path: `${managedComposeVolumeHome}/.hermes/skills/hermeshub/${name}/SKILL.md`,
	};
}

export async function listRemoteHermesSkills(ssh: NodeSSH): Promise<{
	raw: string;
	skills: string[];
	count: number;
}> {
	const cmdResult = await ssh.execCommand(HERMES_SKILLS_LIST_COMMAND);
	if (cmdResult.code !== 0) {
		throw new Error(cmdResult.stderr || "Hermes skills list command failed");
	}
	const raw = cmdResult.stdout || "";
	const parsed = parseRemoteSkillsList(raw);
	return { raw, ...parsed };
}
