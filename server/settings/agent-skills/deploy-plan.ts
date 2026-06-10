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
	remoteSkills: Set<string>,
): ManifestEntry[] {
	const manifest: ManifestEntry[] = [];

	for (const skill of enabledSkills) {
		const policy = getSkillDeployPolicy(skill.sourceType);
		if (!policy) {
			continue;
		}

		const entry = policy.manifestEntry(skill, remoteSkills);
		if (entry) {
			manifest.push(entry);
		}
	}

	return manifest;
}

export function findBlockedSkills(
	enabledSkills: EnabledSkill[],
	remoteSkills: Set<string>,
): string[] {
	const blocked: string[] = [];

	for (const skill of enabledSkills) {
		if (!skillExpectsRemoteInventory(skill)) {
			continue;
		}

		const expectedName = resolveManifestName(skill);
		if (expectedName && !remoteSkills.has(expectedName)) {
			blocked.push(expectedName);
		}
	}

	return blocked;
}
