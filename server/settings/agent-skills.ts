import type { Context } from "hono";
import type { NodeSSH } from "node-ssh";
import { managedComposeVolumeHome } from "../constants";
import { clearDashboardCache } from "../dashboard";
import { getDb } from "../db";
import { deployToHermesAgent } from "../hermes/deploy";
import { resolveHermesDeployContext } from "../hermes/deploy-context";
import { getClientIp } from "../lib/get-client-ip";
import { insertAuditLog } from "../lib/insert-audit-log";
import { requireAuthSession } from "../request-guards";
import { shellQuote, withSshConnection } from "../ssh";
import {
	isValidAgentSkillName,
	normalizeSkillInstallRef,
	parseAgentSkillCreateBody,
	parseAgentSkillUpdateBody,
	parseRemoteSkillsList,
	resolveManifestName,
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

export type ManifestEntry = { name: string; sourceType: string };

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
		const { name, sourceType } = entry as Record<string, unknown>;
		if (typeof name !== "string" || typeof sourceType !== "string") {
			return [];
		}
		if (!isValidAgentSkillName(name)) {
			throw new Error(`Unsafe manifest name '${name}' in ${MANIFEST_PATH}.`);
		}
		return [{ name, sourceType }];
	});
}

export type FileWrite = {
	content: string;
	path: string;
};

export function buildManifestWriteCommand(
	manifest: ManifestEntry[],
): FileWrite {
	return {
		content: JSON.stringify(manifest, null, 2),
		path: MANIFEST_PATH,
	};
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

async function writeRemoteFile(
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

type DeployPlan = {
	fileWrites: FileWrite[];
	manifestWrite: FileWrite;
	shellCommands: string[];
};

/**
 * `hermes skills install` exits 0 even on failure (scanner block or
 * unfetchable source). Scan the output for those markers so a silent
 * failure surfaces as a real error.
 */
export function detectSkillInstallFailure(output: string): string | null {
	const failures: string[] = [];
	for (const rawLine of output.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line) {
			continue;
		}
		if (
			line.includes("Installation blocked:") ||
			/Could not fetch .* from any source/.test(line)
		) {
			failures.push(line);
		}
	}
	return failures.length > 0 ? failures.join("\n") : null;
}

export function buildDeployCommands(
	previousManifest: ManifestEntry[],
	enabledSkills: Array<{
		name: string;
		sourceType: string;
		installRef?: string | null;
		content?: string | null;
	}>,
): DeployPlan {
	const fileWrites: FileWrite[] = [];
	const shellCommands: string[] = [];

	// Remove previously managed skills missing from enabledSkills.
	// Also remove when source type changes (e.g. custom → hub with same name)
	// to avoid stale remote artifacts.
	for (const prev of previousManifest) {
		const shouldKeep = enabledSkills.some(
			(curr) =>
				resolveManifestName(curr) === prev.name &&
				curr.sourceType === prev.sourceType,
		);
		if (!shouldKeep) {
			if (prev.sourceType === "hub" || prev.sourceType === "url") {
				// Uninstall failures are non-blocking: a skill may have been removed
				// manually, or the Hermes CLI may return non-zero for an absent skill.
				// Tolerate cleanup failures so they can't block the primary install intent.
				shellCommands.push(
					`echo y | sudo docker exec -i hermes hermes skills uninstall ${shellQuote(
						prev.name,
					)} || true`,
				);
			} else if (prev.sourceType === "custom") {
				shellCommands.push(
					`sudo rm -rf ${shellQuote(
						`${managedComposeVolumeHome}/.hermes/skills/hermeshub/${prev.name}`,
					)}`,
				);
			}
		}
	}

	// Install/write enabled skills
	for (const skill of enabledSkills) {
		// Rewrite GitHub folder/file URLs to the `owner/repo/path` slug the
		// Hermes CLI understands, so a whole skill folder (SKILL.md plus scripts
		// and other files) is installed instead of only a single raw SKILL.md.
		const installRef = normalizeSkillInstallRef(skill.installRef || "");
		if (skill.sourceType === "hub") {
			// No --name: Hermes CLI derives the installed name from the ref itself.
			shellCommands.push(
				`sudo docker exec hermes hermes skills install ${shellQuote(
					installRef,
				)} --yes --force`,
			);
		} else if (skill.sourceType === "url") {
			shellCommands.push(
				`sudo docker exec hermes hermes skills install ${shellQuote(
					installRef,
				)} --name ${shellQuote(resolveManifestName(skill))} --yes --force`,
			);
		} else if (skill.sourceType === "custom") {
			fileWrites.push(
				buildCustomSkillFileWrite(skill.name, skill.content || ""),
			);
		}
	}

	// Build new manifest (written after shell commands succeed)
	const newManifest = enabledSkills.map((s) => ({
		name: resolveManifestName(s),
		sourceType: s.sourceType,
	}));
	const manifestWrite = buildManifestWriteCommand(newManifest);

	return { fileWrites, manifestWrite, shellCommands };
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
			const previousManifest = await readRemoteManifest(ssh);
			const plan = buildDeployCommands(previousManifest, enabledSkills);

			// Run shell commands first (install/uninstall).
			// Custom files and manifest are written after so a failed hub/url
			// install never leaves stale state on the remote host.
			if (plan.shellCommands.length > 0) {
				const compoundCommand = plan.shellCommands.join(" && ");
				const result = await ssh.execCommand(compoundCommand);
				if (result.code !== 0) {
					throw new Error(
						result.stderr || "Failed to deploy agent skills changes",
					);
				}
				// `hermes skills install` exits 0 even when the security scanner blocks
				// a skill or the source cannot be fetched, so the &&-chain never aborts.
				// Detect those failures from the command output and surface them.
				const installFailure = detectSkillInstallFailure(
					`${result.stdout ?? ""}\n${result.stderr ?? ""}`,
				);
				if (installFailure) {
					throw new Error(installFailure);
				}
			}

			// Write custom skill files via SSH stdin.
			for (const fw of plan.fileWrites) {
				await writeRemoteFile(ssh, fw.path, fw.content);
			}

			// Post-install verification: query the remote inventory and check
			// that every enabled hub/url skill actually landed.  Hermes CLI
			// reports "Exit 0" even when install was silently skipped or the
			// output scanner missed a failure, so this is our last chance to
			// catch a missing skill before we write the manifest.
			// Custom skills are written as files and are not tracked by hermes
			// skills list, so we skip them here.
			const verifiableSkills = enabledSkills.filter(
				(s) => s.sourceType === "hub" || s.sourceType === "url",
			);
			if (verifiableSkills.length > 0) {
				const verifyResult = await ssh.execCommand(
					"sudo docker exec hermes hermes skills list",
				);
				const verifiedNames = new Set(
					parseRemoteSkillsList(verifyResult.stdout ?? "").skills,
				);
				const missing = verifiableSkills
					.map((s) => resolveManifestName(s))
					.filter((n) => n && !verifiedNames.has(n));
				if (missing.length > 0) {
					throw new Error(
						`Post-install verification failed: Hermes did not install these skills: ${missing.join(", ")}`,
					);
				}
			}

			// Write the managed manifest ONLY after all shell commands succeed
			// AND post-install verification passes.
			// If install/uninstall fails, the manifest is not updated, so a failed
			// hub install never leaves the remote manifest claiming success.
			await writeRemoteFile(
				ssh,
				plan.manifestWrite.path,
				plan.manifestWrite.content,
			);
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

export async function getRemoteSkillsList(context: Context) {
	const session = await requireAuthSession(context);
	if (session instanceof Response) {
		return session;
	}

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

	const deployCtx = await resolveHermesDeployContext(
		context,
		session,
		parsed.serverId,
	);
	if (deployCtx instanceof Response) {
		return deployCtx;
	}

	const { sshCtx } = deployCtx;

	try {
		const result = await withSshConnection(
			{
				host: sshCtx.server.host,
				port: sshCtx.server.port,
				username: sshCtx.server.username,
				authMethod: sshCtx.authMethod,
				credential: sshCtx.credential,
				expectedFingerprint: sshCtx.server.hostKeyFingerprint ?? undefined,
			},
			async (ssh) => {
				const cmdResult = await ssh.execCommand(
					"sudo docker exec hermes hermes skills list",
				);
				if (cmdResult.code !== 0) {
					throw new Error(
						cmdResult.stderr || "Hermes skills list command failed",
					);
				}
				return cmdResult.stdout || "";
			},
		);

		const parsedSkills = parseRemoteSkillsList(result);
		return context.json({
			raw: result,
			skills: parsedSkills.skills,
			count: parsedSkills.count,
		});
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Remote command failed";
		return context.json(
			{ error: `Failed to fetch remote skills: ${message}` },
			502,
		);
	}
}
