import type { NodeSSH } from "node-ssh";

import { managedComposeVolumeHome } from "../constants";

export const HERMES_SOUL_MD_PATH = `${managedComposeVolumeHome}/.hermes/SOUL.md`;
export const MAX_AGENT_PERSONA_LENGTH = 20_000;

export function validateAgentPersona(
	content: string,
): { ok: true; content: string } | { ok: false; error: string } {
	const trimmed = content.trim();
	if (!trimmed) {
		return { ok: false, error: "Persona content cannot be empty." };
	}

	if (trimmed.length > MAX_AGENT_PERSONA_LENGTH) {
		return {
			ok: false,
			error: `Persona content cannot exceed ${MAX_AGENT_PERSONA_LENGTH} characters.`,
		};
	}

	return { ok: true, content: trimmed };
}

export function buildSoulMdWriteCommand(content: string): string {
	const encoded = Buffer.from(content, "utf8").toString("base64");
	return [
		`sudo mkdir -p ${managedComposeVolumeHome}/.hermes`,
		`printf '%s' '${encoded}' | base64 -d | sudo tee ${HERMES_SOUL_MD_PATH} > /dev/null`,
	].join(" && ");
}

export async function writeSoulMd(
	ssh: NodeSSH,
	content: string,
): Promise<void> {
	const validated = validateAgentPersona(content);
	if (!validated.ok) {
		throw new Error(validated.error);
	}

	const result = await ssh.execCommand(
		buildSoulMdWriteCommand(validated.content),
	);
	if (result.code !== 0) {
		throw new Error(result.stderr || "Failed to write SOUL.md");
	}
}
