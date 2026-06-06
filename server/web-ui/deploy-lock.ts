const inFlightDeploys = new Set<string>();

export function tryAcquireWebUiDeployLock(serverId: string): boolean {
	if (inFlightDeploys.has(serverId)) {
		return false;
	}

	inFlightDeploys.add(serverId);
	return true;
}

export function releaseWebUiDeployLock(serverId: string): void {
	inFlightDeploys.delete(serverId);
}

export function resetWebUiDeployLockForTests(): void {
	inFlightDeploys.clear();
}
