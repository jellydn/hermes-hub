import type { NodeSSH } from "node-ssh";

import {
	establishSshConnection,
	type SshConnectionInput,
} from "../ssh/connection";

const IDLE_TIMEOUT_MS = 60_000;
const CLEANUP_INTERVAL_MS = 15_000;

type PoolKey = string;

type PooledConnection = {
	ssh: NodeSSH;
	input: SshConnectionInput;
	lastUsed: number;
	refCount: number;
};

const pools = new Map<PoolKey, PooledConnection>();
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function poolKey(userId: string, serverId: string): PoolKey {
	return `${userId}:${serverId}`;
}

function inputsMatch(
	left: SshConnectionInput,
	right: SshConnectionInput,
): boolean {
	return (
		left.host === right.host &&
		left.port === right.port &&
		left.username === right.username &&
		left.authMethod === right.authMethod &&
		left.credential === right.credential &&
		left.expectedFingerprint === right.expectedFingerprint
	);
}

function ensureCleanupTimer() {
	if (cleanupTimer) {
		return;
	}

	cleanupTimer = setInterval(() => {
		const now = Date.now();
		for (const [key, entry] of pools) {
			if (entry.refCount === 0 && now - entry.lastUsed > IDLE_TIMEOUT_MS) {
				entry.ssh.dispose();
				pools.delete(key);
			}
		}

		if (pools.size === 0 && cleanupTimer) {
			clearInterval(cleanupTimer);
			cleanupTimer = null;
		}
	}, CLEANUP_INTERVAL_MS);
	cleanupTimer.unref?.();
}

async function acquirePooledSsh(
	userId: string,
	serverId: string,
	input: SshConnectionInput,
): Promise<PooledConnection> {
	const key = poolKey(userId, serverId);
	let entry = pools.get(key);

	if (entry && (!entry.ssh.isConnected() || !inputsMatch(entry.input, input))) {
		entry.ssh.dispose();
		pools.delete(key);
		entry = undefined;
	}

	if (!entry) {
		const { ssh } = await establishSshConnection(input);
		entry = {
			ssh,
			input,
			lastUsed: Date.now(),
			refCount: 0,
		};
		pools.set(key, entry);
		ensureCleanupTimer();
	}

	entry.refCount += 1;
	entry.lastUsed = Date.now();
	return entry;
}

function releasePooledSsh(entry: PooledConnection) {
	entry.refCount = Math.max(0, entry.refCount - 1);
	entry.lastUsed = Date.now();
}

export async function withPooledSshConnection<T>(
	userId: string,
	serverId: string,
	input: SshConnectionInput,
	run: (ssh: NodeSSH) => Promise<T>,
): Promise<T> {
	const entry = await acquirePooledSsh(userId, serverId, input);

	try {
		return await run(entry.ssh);
	} catch (error) {
		if (entry.refCount <= 1) {
			entry.ssh.dispose();
			pools.delete(poolKey(userId, serverId));
		}
		throw error;
	} finally {
		releasePooledSsh(entry);
	}
}

export function invalidatePooledSsh(userId: string, serverId: string) {
	const key = poolKey(userId, serverId);
	const entry = pools.get(key);
	if (entry) {
		entry.ssh.dispose();
		pools.delete(key);
	}
}

export function resetWebUiSshPoolForTests() {
	for (const entry of pools.values()) {
		entry.ssh.dispose();
	}
	pools.clear();
	if (cleanupTimer) {
		clearInterval(cleanupTimer);
		cleanupTimer = null;
	}
}
