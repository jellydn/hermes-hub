import { HERMES_HUB_SKILL_CATEGORY } from "#shared/contracts/agent-skills";
import { managedComposeVolumeHome } from "../../constants";
import { shellQuote } from "../../ssh";
import {
	deriveSkillMdFetchUrl,
	normalizeSkillInstallRef,
	resolveManifestName,
	type SkillSourceType,
} from "./config";
import {
	buildCustomSkillFileWrite,
	buildDirectSkillInstallCommand,
	type FileWrite,
	type ManifestEntry,
} from "./remote";

export type EnabledSkill = {
	name: string;
	sourceType: string;
	installRef?: string | null;
	content?: string | null;
	acceptScannerRisk: boolean;
};

type SkillDeployPolicy = {
	matchesEnabled: (prev: ManifestEntry, curr: EnabledSkill) => boolean;
	uninstallCommand: (prev: ManifestEntry) => string | null;
	installCommand: (skill: EnabledSkill) => string | null;
	fileWrite: (skill: EnabledSkill) => FileWrite | null;
	manifestEntry: (skill: EnabledSkill) => ManifestEntry | null;
};

function buildHermesHubInstallSuffix(skillName?: string): string {
	const flags = [
		`--category ${shellQuote(HERMES_HUB_SKILL_CATEGORY)}`,
		"--yes",
		"--force",
	];
	if (skillName) {
		flags.unshift(`--name ${shellQuote(skillName)}`);
	}
	return flags.join(" ");
}

function removeLegacyFlatSkillDir(skillName: string): string {
	return `sudo rm -rf ${shellQuote(
		`${managedComposeVolumeHome}/.hermes/skills/${skillName}`,
	)}`;
}

function removeHermeshubSkillDir(skillName: string): string {
	return `sudo rm -rf ${shellQuote(
		`${managedComposeVolumeHome}/.hermes/skills/hermeshub/${skillName}`,
	)}`;
}

function buildScannerBypassInstallCommand(skill: EnabledSkill): string | null {
	const installRef = skill.installRef ?? "";
	const fetchUrl = deriveSkillMdFetchUrl(
		installRef,
		skill.sourceType as SkillSourceType,
	);
	if (!fetchUrl) {
		return null;
	}

	const resolvedName = resolveManifestName(skill);
	if (!resolvedName) {
		return null;
	}

	return [
		removeLegacyFlatSkillDir(resolvedName),
		removeHermeshubSkillDir(resolvedName),
		buildDirectSkillInstallCommand(resolvedName, fetchUrl),
	].join(" && ");
}

function resolveRemoteInstallCommand(
	skill: EnabledSkill,
	buildCliInstall: () => string,
): string | null {
	if (skill.acceptScannerRisk) {
		return buildScannerBypassInstallCommand(skill);
	}
	return buildCliInstall();
}

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
		return resolveRemoteInstallCommand(skill, () => {
			const installRef = normalizeSkillInstallRef(skill.installRef ?? "");
			const resolvedName = resolveManifestName(skill);
			const legacyCleanup = resolvedName
				? `${removeLegacyFlatSkillDir(resolvedName)} && `
				: "";
			return `${legacyCleanup}sudo docker exec hermes hermes skills install ${shellQuote(
				installRef,
			)} ${buildHermesHubInstallSuffix()}`;
		});
	},
	fileWrite: () => null,
	manifestEntry(skill) {
		const resolvedName = resolveManifestName(skill);
		if (!resolvedName) {
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
		return resolveRemoteInstallCommand(skill, () => {
			const installRef = normalizeSkillInstallRef(skill.installRef ?? "");
			return `${removeLegacyFlatSkillDir(skill.name)} && sudo docker exec hermes hermes skills install ${shellQuote(
				installRef,
			)} ${buildHermesHubInstallSuffix(skill.name)}`;
		});
	},
	fileWrite: () => null,
	manifestEntry(skill) {
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
