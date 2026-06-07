import type { Context } from "hono";
import type { NodeSSH } from "node-ssh";
import { managedComposeVolumeHome } from "../constants";
import { clearDashboardCache } from "../dashboard";
import { getDb } from "../db";
import { deployToHermesAgent } from "../hermes/deploy";
import { getClientIp } from "../lib/get-client-ip";
import { insertAuditLog } from "../lib/insert-audit-log";
import { requireAuthSession } from "../request-guards";
import { shellQuote } from "../ssh";
import {
	parseAgentSkillCreateBody,
	parseAgentSkillUpdateBody,
	type SkillSourceType,
} from "./agent-skills/config";
import {
	createAgentSkillRecord,
	deleteAgentSkillRecord,
	getAgentSkillByName,
	getOwnedAgentSkillRecord,
	listAgentSkillRecords,
	updateAgentSkillRecord,
} from "./agent-skills/records";
import { parseDeployServerIdBody } from "./deploy-body";

const AGENT_SKILL_NAME_CONFLICT_ERROR =
	"An agent skill with this name already exists.";

function isAgentSkillNameConflict(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		error.code === "23505"
	);
}

export async function createAgentSkill(context: Context) {
	const session = await requireAuthSession(context);
	if (session instanceof Response) {
		return session;
	}

	let payload: unknown;
	try {
		payload = await context.req.json();
	} catch {
		return context.json({ error: "Invalid JSON body" }, 400);
	}

	const parsed = parseAgentSkillCreateBody(payload);
	if (!parsed.ok) {
		return context.json({ error: parsed.error }, 400);
	}

	const existing = await getAgentSkillByName(session.user.id, parsed.data.name);
	if (existing) {
		return context.json({ error: AGENT_SKILL_NAME_CONFLICT_ERROR }, 400);
	}

	const db = getDb();
	const ipAddress = getClientIp(context);

	try {
		const skill = await db.transaction(async (tx) => {
			const created = await createAgentSkillRecord(tx, {
				userId: session.user.id,
				name: parsed.data.name,
				sourceType: parsed.data.sourceType,
				installRef: parsed.data.installRef ?? null,
				content: parsed.data.content ?? null,
				enabled: parsed.data.enabled ?? true,
			});

			await insertAuditLog(tx, {
				userId: session.user.id,
				action: "agent_skill.created",
				details: {
					skillId: created.id,
					name: created.name,
					sourceType: created.sourceType,
				},
				ipAddress,
			});

			return created;
		});

		clearDashboardCache();
		return context.json({ skill });
	} catch (error) {
		if (isAgentSkillNameConflict(error)) {
			return context.json({ error: AGENT_SKILL_NAME_CONFLICT_ERROR }, 400);
		}

		const message =
			error instanceof Error ? error.message : "Unable to create agent skill.";
		return context.json({ error: message }, 500);
	}
}

export async function updateAgentSkill(context: Context) {
	const session = await requireAuthSession(context);
	if (session instanceof Response) {
		return session;
	}

	const skillId = context.req.param("id");
	if (!skillId) {
		return context.json({ error: "Skill id is required." }, 400);
	}

	let payload: unknown;
	try {
		payload = await context.req.json();
	} catch {
		return context.json({ error: "Invalid JSON body" }, 400);
	}

	const existing = await getOwnedAgentSkillRecord(session.user.id, skillId);
	if (!existing) {
		return context.json({ error: "Agent skill not found." }, 404);
	}

	const parsed = parseAgentSkillUpdateBody(
		{ sourceType: existing.sourceType as SkillSourceType },
		payload,
	);
	if (!parsed.ok) {
		return context.json({ error: parsed.error }, 400);
	}

	// Unique name check on rename
	if (parsed.data.name && parsed.data.name !== existing.name) {
		const conflict = await getAgentSkillByName(
			session.user.id,
			parsed.data.name,
		);
		if (conflict) {
			return context.json({ error: AGENT_SKILL_NAME_CONFLICT_ERROR }, 400);
		}
	}

	const db = getDb();
	const ipAddress = getClientIp(context);

	try {
		const skill = await db.transaction(async (tx) => {
			const updated = await updateAgentSkillRecord(tx, {
				skillId,
				userId: session.user.id,
				updates: parsed.data,
			});

			await insertAuditLog(tx, {
				userId: session.user.id,
				action: "agent_skill.updated",
				details: {
					skillId: updated.id,
					name: updated.name,
				},
				ipAddress,
			});

			return updated;
		});

		clearDashboardCache();
		return context.json({ skill });
	} catch (error) {
		if (isAgentSkillNameConflict(error)) {
			return context.json({ error: AGENT_SKILL_NAME_CONFLICT_ERROR }, 400);
		}

		const message =
			error instanceof Error ? error.message : "Unable to update agent skill.";
		return context.json({ error: message }, 500);
	}
}

export async function deleteAgentSkill(context: Context) {
	const session = await requireAuthSession(context);
	if (session instanceof Response) {
		return session;
	}

	const skillId = context.req.param("id");
	if (!skillId) {
		return context.json({ error: "Skill id is required." }, 400);
	}

	const existing = await getOwnedAgentSkillRecord(session.user.id, skillId);
	if (!existing) {
		return context.json({ error: "Agent skill not found." }, 404);
	}

	const db = getDb();
	const ipAddress = getClientIp(context);

	try {
		await db.transaction(async (tx) => {
			await deleteAgentSkillRecord(tx, session.user.id, skillId);

			await insertAuditLog(tx, {
				userId: session.user.id,
				action: "agent_skill.deleted",
				details: {
					skillId,
					name: existing.name,
				},
				ipAddress,
			});
		});

		clearDashboardCache();
		return context.json({ success: true });
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Unable to delete agent skill.";
		return context.json({ error: message }, 500);
	}
}

export const MANIFEST_PATH = `${managedComposeVolumeHome}/.hermes/hermeshub-agent-skills.json`;

export async function readRemoteManifest(
	ssh: NodeSSH,
): Promise<Array<{ name: string; sourceType: string }>> {
	const result = await ssh.execCommand(
		`sudo cat ${MANIFEST_PATH} 2>/dev/null || true`,
	);
	const content = result.stdout?.trim();
	if (!content) {
		return [];
	}
	try {
		const parsed = JSON.parse(content);
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

export function buildManifestWriteCommand(
	manifest: Array<{ name: string; sourceType: string }>,
): string {
	const content = JSON.stringify(manifest, null, 2);
	const encoded = Buffer.from(content, "utf8").toString("base64");
	return [
		`sudo mkdir -p ${managedComposeVolumeHome}/.hermes`,
		`printf '%s' '${encoded}' | base64 -d | sudo tee ${MANIFEST_PATH} > /dev/null`,
	].join(" && ");
}

export function buildCustomSkillWriteCommand(
	name: string,
	content: string,
): string {
	const skillDir = `${managedComposeVolumeHome}/.hermes/skills/hermeshub/${name}`;
	const skillPath = `${skillDir}/SKILL.md`;
	const encoded = Buffer.from(content, "utf8").toString("base64");
	return [
		`sudo mkdir -p ${shellQuote(skillDir)}`,
		`printf '%s' '${encoded}' | base64 -d | sudo tee ${shellQuote(skillPath)} > /dev/null`,
	].join(" && ");
}

export async function deploySkillsToHermes(context: Context) {
	const session = await requireAuthSession(context);
	if (session instanceof Response) {
		return session;
	}

	const records = await listAgentSkillRecords(session.user.id);
	const enabledSkills = records.filter((s) => s.enabled);

	let payload: unknown;
	try {
		payload = await context.req.json();
	} catch {
		payload = null;
	}

	const parsed = parseDeployServerIdBody(payload);
	if (!parsed.ok) {
		return context.json({ error: parsed.error }, 400);
	}

	return deployToHermesAgent(context, session, parsed.serverId, {
		deploy: async (ssh) => {
			// 1. Read previous manifest
			const previousManifest = await readRemoteManifest(ssh);

			// 2. Build deployment commands
			const commands: string[] = [];

			// Remove previously managed skills missing from enabledSkills
			for (const prev of previousManifest) {
				if (!prev || typeof prev !== "object" || !prev.name) {
					continue;
				}
				const isStillEnabled = enabledSkills.some(
					(curr) => curr.name === prev.name,
				);
				if (!isStillEnabled) {
					if (prev.sourceType === "hub" || prev.sourceType === "url") {
						commands.push(
							`sudo docker exec hermes hermes skills uninstall ${shellQuote(prev.name)}`,
						);
					} else if (prev.sourceType === "custom") {
						commands.push(
							`sudo rm -rf ${shellQuote(`${managedComposeVolumeHome}/.hermes/skills/hermeshub/${prev.name}`)}`,
						);
					}
				}
			}

			// Install/write enabled skills
			for (const skill of enabledSkills) {
				if (skill.sourceType === "hub" || skill.sourceType === "url") {
					const installRef = skill.installRef || "";
					commands.push(
						`sudo docker exec hermes hermes skills install ${shellQuote(installRef)} --name ${shellQuote(skill.name)}`,
					);
				} else if (skill.sourceType === "custom") {
					commands.push(
						buildCustomSkillWriteCommand(skill.name, skill.content || ""),
					);
				}
			}

			// Write new manifest
			const newManifest = enabledSkills.map((s) => ({
				name: s.name,
				sourceType: s.sourceType,
			}));
			commands.push(buildManifestWriteCommand(newManifest));

			// 3. Execute all commands in a single chained shell execution
			if (commands.length > 0) {
				const compoundCommand = commands.join(" && ");
				const result = await ssh.execCommand(compoundCommand);
				if (result.code !== 0) {
					throw new Error(
						result.stderr || "Failed to deploy agent skills changes",
					);
				}
			}
		},
		failureAuditAction: "agent_skills.deploy.failed",
		successAuditAction: "agent_skills.deployed",
		buildFailureAuditDetails: (sshCtx, error) => ({
			serverId: sshCtx.serverId,
			serverHost: sshCtx.server.host,
			error,
			skillCount: enabledSkills.length,
		}),
		buildSuccessAuditDetails: (sshCtx) => ({
			serverId: sshCtx.serverId,
			serverHost: sshCtx.server.host,
			skillCount: enabledSkills.length,
		}),
		buildSuccessResponse: (sshCtx, deployedAt) => ({
			serverHost: sshCtx.server.host,
			skillCount: enabledSkills.length,
			deployedAt: deployedAt.toISOString(),
		}),
	});
}
