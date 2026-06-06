export const STALE_DEPLOY_ERROR =
	"Web UI deploy timed out. The HermesHub process may have restarted during setup.";

function readStaleDeployThreshold(): number {
	const envValue = process.env.STALE_DEPLOY_THRESHOLD_MS;
	if (envValue) {
		const parsed = Number(envValue);
		if (!Number.isNaN(parsed) && parsed > 0) {
			return parsed;
		}
	}

	return 10 * 60 * 1000;
}

const STALE_DEPLOY_THRESHOLD_MS = readStaleDeployThreshold();

export function isStaleDeploy(deployStartedAt: Date | null): boolean {
	if (!deployStartedAt) {
		return true;
	}

	return Date.now() - deployStartedAt.getTime() > STALE_DEPLOY_THRESHOLD_MS;
}
