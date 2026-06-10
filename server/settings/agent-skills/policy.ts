import { managedComposeVolumeHome } from "../../constants";
import { shellQuote } from "../../ssh";
import {
	normalizeSkillInstallRef,
	resolveManifestName,
	type SkillSourceType,
} from "./config";
import {
	buildCustomSkillFileWrite,
	type FileWrite,
	type ManifestEntry,
} from "./remote";

export type EnabledSkill = {
	name: string;
	sourceType: string;
	installRef?: string | null;
	content?: string | null;
};

type SkillDeployPolicy = {
	matchesEnabled: (prev: ManifestEntry, curr: EnabledSkill) => boolean;
	uninstallCommand: (prev: ManifestEntry) => string | null;
	installCommand: (skill: EnabledSkill) => string | null;
	fileWrite: (skill: EnabledSkill) => FileWrite | null;
	manifestEntry: (
		skill: EnabledSkill,
		remoteSkills: Set<string>,
	) => ManifestEntry | null;
};

const hubPolicy: SkillDeployPolicy = {
	matchesEnabled(prev, curr) {
		return (
			curr.sourceType === "hub" &&
			prev.sourceType === "hub" &&
			prev.name === resolveManifestName(curr)
		);
	},
	uninstallCommand(prev) {
		return `echo y | sudo docker exec -i hermes hermes skills uninstall ${shellQuote(
			prev.name,
		)} || true`;
	},
	installCommand(skill) {
		const installRef = normalizeSkillInstallRef(skill.installRef ?? "");
		return `sudo docker exec hermes hermes skills install ${shellQuote(
			installRef,
		)} --yes --force`;
	},
	fileWrite: () => null,
	manifestEntry(skill, remoteSkills) {
		const resolvedName = resolveManifestName(skill);
		if (!remoteSkills.has(resolvedName)) {
			return null;
		}
		return {
			name: resolvedName,
			sourceType: skill.sourceType,
			installRef: normalizeSkillInstallRef(skill.installRef ?? ""),
		};
	},
};

const urlPolicy: SkillDeployPolicy = {
	matchesEnabled(prev, curr) {
		return (
			curr.sourceType === "url" &&
			prev.sourceType === "url" &&
			prev.name === resolveManifestName(curr)
		);
	},
	uninstallCommand(prev) {
		return `echo y | sudo docker exec -i hermes hermes skills uninstall ${shellQuote(
			prev.name,
		)} || true`;
	},
	installCommand(skill) {
		const installRef = normalizeSkillInstallRef(skill.installRef ?? "");
		return `sudo docker exec hermes hermes skills install ${shellQuote(
			installRef,
		)} --name ${shellQuote(skill.name)} --yes --force`;
	},
	fileWrite: () => null,
	manifestEntry(skill, remoteSkills) {
		if (!remoteSkills.has(skill.name)) {
			return null;
		}
		return {
			name: skill.name,
			sourceType: skill.sourceType,
			installRef: normalizeSkillInstallRef(skill.installRef ?? ""),
		};
	},
};

const customPolicy: SkillDeployPolicy = {
	matchesEnabled(prev, curr) {
		return (
			curr.sourceType === "custom" &&
			prev.sourceType === "custom" &&
			prev.name === curr.name
		);
	},
	uninstallCommand(prev) {
		return `sudo rm -rf ${shellQuote(
			`${managedComposeVolumeHome}/.hermes/skills/hermeshub/${prev.name}`,
		)}`;
	},
	installCommand: () => null,
	fileWrite(skill) {
		return buildCustomSkillFileWrite(skill.name, skill.content ?? "");
	},
	manifestEntry(skill) {
		return {
			name: skill.name,
			sourceType: skill.sourceType,
		};
	},
};

const policies: Record<SkillSourceType, SkillDeployPolicy> = {
	hub: hubPolicy,
	url: urlPolicy,
	custom: customPolicy,
};

export function getSkillDeployPolicy(
	sourceType: string,
): SkillDeployPolicy | null {
	if (sourceType in policies) {
		return policies[sourceType as SkillSourceType];
	}
	return null;
}

export function skillExpectsRemoteInventory(skill: EnabledSkill): boolean {
	return skill.sourceType === "hub" || skill.sourceType === "url";
}
