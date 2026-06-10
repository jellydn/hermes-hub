/**
 * Thrown by specific deployers (e.g. agent skills) to signal that the core
 * deployment succeeded but some optional items were blocked — typically by
 * the Hermes security scanner's "dangerous" verdict.
 *
 * The generic deploy engine catches this, treats it as a partial success
 * (writes success audit, returns 200), and forwards blockedSkills in the
 * response so the UI can surface a warning instead of a red error.
 */
export class PartialDeployError extends Error {
	readonly blockedSkills: string[];
	readonly deployedCount: number;

	constructor(blockedSkills: string[], deployedCount: number) {
		super(`Some skills were not installed: ${blockedSkills.join(", ")}`);
		this.name = "PartialDeployError";
		this.blockedSkills = blockedSkills;
		this.deployedCount = deployedCount;
	}
}
