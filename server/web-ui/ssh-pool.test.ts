import type { NodeSSH } from "node-ssh";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { establishSshConnection } = vi.hoisted(() => ({
	establishSshConnection: vi.fn(),
}));

vi.mock("../ssh/connection", () => ({
	establishSshConnection,
}));

import {
	invalidatePooledSsh,
	resetWebUiSshPoolForTests,
	withPooledSshConnection,
} from "./ssh-pool";

const sshInput = {
	host: "203.0.113.10",
	port: 22,
	username: "root",
	authMethod: "password" as const,
	credential: "secret",
};

function createMockSsh(id: string) {
	return {
		id,
		isConnected: () => true,
		dispose: vi.fn(),
		connection: {},
	} as unknown as NodeSSH;
}

describe("web-ui ssh pool", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		resetWebUiSshPoolForTests();
	});

	it("reuses pooled SSH connections for the same user and server", async () => {
		const ssh = createMockSsh("ssh-1");
		establishSshConnection.mockResolvedValue({ ssh, hostKey: {} });

		const seen: NodeSSH[] = [];
		await withPooledSshConnection(
			"user_123",
			"server_123",
			sshInput,
			async (s) => {
				seen.push(s);
			},
		);
		await withPooledSshConnection(
			"user_123",
			"server_123",
			sshInput,
			async (s) => {
				seen.push(s);
			},
		);

		expect(establishSshConnection).toHaveBeenCalledTimes(1);
		expect(seen[0]).toBe(seen[1]);
	});

	it("invalidates pooled SSH connections on demand", async () => {
		const ssh = createMockSsh("ssh-1");
		establishSshConnection.mockResolvedValue({ ssh, hostKey: {} });

		await withPooledSshConnection(
			"user_123",
			"server_123",
			sshInput,
			async () => "ok",
		);
		invalidatePooledSsh("user_123", "server_123");
		await withPooledSshConnection(
			"user_123",
			"server_123",
			sshInput,
			async () => "ok",
		);

		expect(establishSshConnection).toHaveBeenCalledTimes(2);
		expect(ssh.dispose).toHaveBeenCalled();
	});
});
