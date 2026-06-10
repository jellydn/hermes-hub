import type { NodeSSH } from "node-ssh";

import { PartialDeployError } from "../../hermes/partial-deploy-error";
import {
	buildActualManifest,
	buildDeployCommands,
	findBlockedSkills,
} from "./deploy-plan";
import type { EnabledSkill } from "./policy";
import {
	listRemoteHermesSkills,
	MANIFEST_PATH,
	readRemoteManifest,
	writeRemoteFile,
} from "./remote";

export type AgentSkillsDeployResult = {
	skillCount: number;
	blockedSkills: string[];
};

export async function runAgentSkillsDeploy(
	ssh: NodeSSH,
	enabledSkills: EnabledSkill[],
): Promise<AgentSkillsDeployResult> {
	const previousManifest = await readRemoteManifest(ssh);
	const plan = buildDeployCommands(previousManifest, enabledSkills);

	if (plan.shellCommands.length > 0) {
		const compoundCommand = plan.shellCommands.join(" && ");
		const result = await ssh.execCommand(compoundCommand);
		if (result.code !== 0) {
			throw new Error(result.stderr || "Failed to deploy agent skills changes");
		}
	}

	for (const fileWrite of plan.fileWrites) {
		await writeRemoteFile(ssh, fileWrite.path, fileWrite.content);
	}

	const { skills: remoteSkillNames } = await listRemoteHermesSkills(ssh);
	const remoteSkills = new Set(remoteSkillNames);
	const blockedSkills = findBlockedSkills(enabledSkills, remoteSkills);
	const actualManifest = buildActualManifest(enabledSkills, remoteSkills);

	await writeRemoteFile(
		ssh,
		MANIFEST_PATH,
		JSON.stringify(actualManifest, null, 2),
	);

	if (blockedSkills.length > 0) {
		throw new PartialDeployError(blockedSkills, actualManifest.length);
	}

	return {
		skillCount: actualManifest.length,
		blockedSkills,
	};
}
