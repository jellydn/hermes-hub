import { isSkillInstalledOnRemote } from "#shared/contracts/agent-skills";
import { resolveManifestName } from "./config";
import {
	type EnabledSkill,
	getSkillDeployPolicy,
	skillExpectsRemoteInventory,
} from "./policy";
import type { FileWrite, ManifestEntry } from "./remote";

export type DeployPlan = {
	fileWrites: FileWrite[];
	shellCommands: string[];
};

export function buildDeployCommands(
	previousManifest: ManifestEntry[],
	enabledSkills: EnabledSkill[],
): DeployPlan {
	const fileWrites: FileWrite[] = [];
	const shellCommands: string[] = [];

	for (const prev of previousManifest) {
		const policy = getSkillDeployPolicy(prev.sourceType);
		if (!policy) {
			continue;
		}

		const stillEnabled = enabledSkills.some((curr) =>
			policy.matchesEnabled(prev, curr),
		);
		if (stillEnabled) {
			continue;
		}

		const uninstall = policy.uninstallCommand(prev);
		if (uninstall) {
			shellCommands.push(uninstall);
		}
	}

	for (const skill of enabledSkills) {
		const policy = getSkillDeployPolicy(skill.sourceType);
		if (!policy) {
			continue;
		}

		const install = policy.installCommand(skill);
		if (install) {
			shellCommands.push(install);
		}

		const fileWrite = policy.fileWrite(skill);
		if (fileWrite) {
			fileWrites.push(fileWrite);
		}
	}

	return { fileWrites, shellCommands };
}

export function buildActualManifest(
	enabledSkills: EnabledSkill[],
	installedSkillNames: Set<string>,
): ManifestEntry[] {
	const manifest: ManifestEntry[] = [];

	for (const skill of enabledSkills) {
		const policy = getSkillDeployPolicy(skill.sourceType);
		if (!policy) {
			continue;
		}

		const entry = policy.manifestEntry(skill);
		if (!entry) {
			continue;
		}

		if (
			skillExpectsRemoteInventory(skill) &&
			!isSkillInstalledOnRemote(entry.name, installedSkillNames)
		) {
			continue;
		}

		manifest.push(entry);
	}

	return manifest;
}

export function findBlockedSkills(
	enabledSkills: EnabledSkill[],
	installedSkillNames: Set<string>,
): string[] {
	const blocked: string[] = [];

	for (const skill of enabledSkills) {
		if (!skillExpectsRemoteInventory(skill)) {
			continue;
		}

		const expectedName = resolveManifestName(skill);
		if (
			expectedName &&
			!isSkillInstalledOnRemote(expectedName, installedSkillNames)
		) {
			blocked.push(expectedName);
		}
	}

	return blocked;
}
