import type { NodeSSH } from "node-ssh";

import type { SshConnectionInput } from "../ssh";
import { proxyHttpOverStream } from "./proxy-http";
import type { TcpForwardStream } from "./proxy-types";
import { withPooledSshConnection } from "./ssh-pool";

function openTcpForward(
	ssh: NodeSSH,
	remoteHost: string,
	remotePort: number,
): Promise<TcpForwardStream> {
	const connection = ssh.connection;
	if (!connection) {
		return Promise.reject(new Error("SSH connection is not available"));
	}

	return new Promise((resolve, reject) => {
		connection.forwardOut(
			"127.0.0.1",
			0,
			remoteHost,
			remotePort,
			(error: Error | undefined, stream: TcpForwardStream) => {
				if (error) {
					reject(error);
					return;
				}

				resolve(stream);
			},
		);
	});
}

export async function withSshTcpForward<T>(
	userId: string,
	serverId: string,
	input: SshConnectionInput & {
		remoteHost: string;
		remotePort: number;
	},
	run: (stream: TcpForwardStream) => Promise<T>,
): Promise<T> {
	return withPooledSshConnection(userId, serverId, input, async (ssh) => {
		const stream = await openTcpForward(
			ssh,
			input.remoteHost,
			input.remotePort,
		);
		try {
			return await run(stream);
		} finally {
			stream.end();
		}
	});
}

export async function proxyRequestOverSsh(input: {
	userId: string;
	serverId: string;
	ssh: SshConnectionInput;
	remoteHost: string;
	remotePort: number;
	request: Request;
	upstreamPath: string;
	upstreamHost?: string;
}) {
	return withSshTcpForward(
		input.userId,
		input.serverId,
		{
			...input.ssh,
			remoteHost: input.remoteHost,
			remotePort: input.remotePort,
		},
		(stream) =>
			proxyHttpOverStream({
				request: input.request,
				stream,
				upstreamPath: input.upstreamPath,
				upstreamHost: input.upstreamHost,
			}),
	);
}
