import type { Context } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAuthSession, getOwnedServerRecord, resolveServerSshConfigOrError } =
	vi.hoisted(() => ({
		getAuthSession: vi.fn(),
		getOwnedServerRecord: vi.fn(),
		resolveServerSshConfigOrError: vi.fn(),
	}));

vi.mock("./auth", () => ({ getAuthSession }));
vi.mock("./server-records", () => ({
	getOwnedServerRecord,
	resolveServerSshConfigOrError,
}));

import {
	requireAuthSession,
	requireOwnedServer,
	requireOwnedServerSsh,
} from "./request-guards";

function makeContext(params: { id?: string } = {}): Context {
	return {
		req: {
			raw: { headers: new Headers() },
			param: (name: string) => params[name as keyof typeof params],
		},
		json: (body: unknown, status = 200) =>
			new Response(JSON.stringify(body), {
				status,
				headers: { "content-type": "application/json" },
			}),
	} as unknown as Context;
}

const session = { user: { id: "u1" }, session: { id: "s1" } };
const server = {
	id: "server_1",
	host: "1.2.3.4",
	port: 22,
	username: "root",
	authMethod: "password",
	encryptedCredential: "enc-cred",
	storeCredential: true,
	hostKeyFingerprint: "SHA256:abc",
	userId: "u1",
} as never;

describe("requireAuthSession", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns 401 when no session", async () => {
		getAuthSession.mockResolvedValue(null);
		const result = await requireAuthSession(makeContext());
		expect(result).toBeInstanceOf(Response);
		expect((result as Response).status).toBe(401);
	});

	it("returns session when authenticated", async () => {
		getAuthSession.mockResolvedValue(session);
		const result = await requireAuthSession(makeContext());
		expect(result).not.toBeInstanceOf(Response);
		expect(result).toEqual(session);
	});
});

describe("requireOwnedServer", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns 400 when id param is missing", async () => {
		getAuthSession.mockResolvedValue(session);
		const result = await requireOwnedServer(makeContext({}));
		expect(result).toBeInstanceOf(Response);
		expect((result as Response).status).toBe(400);
	});

	it("returns 401 when unauthenticated", async () => {
		getAuthSession.mockResolvedValue(null);
		const result = await requireOwnedServer(makeContext({ id: "server_1" }));
		expect(result).toBeInstanceOf(Response);
		expect((result as Response).status).toBe(401);
	});

	it("returns 404 when server not owned by user", async () => {
		getAuthSession.mockResolvedValue(session);
		getOwnedServerRecord.mockResolvedValue(null);
		const result = await requireOwnedServer(makeContext({ id: "server_1" }));
		expect(result).toBeInstanceOf(Response);
		expect((result as Response).status).toBe(404);
	});

	it("returns owned context with userId filter (IDOR guard)", async () => {
		getAuthSession.mockResolvedValue(session);
		getOwnedServerRecord.mockResolvedValue(server);
		const result = await requireOwnedServer(makeContext({ id: "server_1" }));
		expect(result).not.toBeInstanceOf(Response);
		expect(getOwnedServerRecord).toHaveBeenCalledWith({
			serverId: "server_1",
			userId: "u1",
		});
		expect((result as { server: unknown }).server).toBe(server);
	});
});

describe("requireOwnedServerSsh", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns 400 when id param is missing", async () => {
		getAuthSession.mockResolvedValue(session);
		const result = await requireOwnedServerSsh(makeContext({}));
		expect(result).toBeInstanceOf(Response);
		expect((result as Response).status).toBe(400);
	});

	it("returns 404 when not owned", async () => {
		getAuthSession.mockResolvedValue(session);
		getOwnedServerRecord.mockResolvedValue(null);
		const result = await requireOwnedServerSsh(makeContext({ id: "server_1" }));
		expect(result).toBeInstanceOf(Response);
		expect((result as Response).status).toBe(404);
	});

	it("returns 400 when SSH config resolution fails", async () => {
		getAuthSession.mockResolvedValue(session);
		getOwnedServerRecord.mockResolvedValue(server);
		resolveServerSshConfigOrError.mockReturnValue({
			ok: false,
			error: "Stored credential is missing.",
		});
		const result = await requireOwnedServerSsh(makeContext({ id: "server_1" }));
		expect(result).toBeInstanceOf(Response);
		expect((result as Response).status).toBe(400);
	});

	it("returns SSH context on success", async () => {
		getAuthSession.mockResolvedValue(session);
		getOwnedServerRecord.mockResolvedValue(server);
		resolveServerSshConfigOrError.mockReturnValue({
			ok: true,
			authMethod: "password",
			credential: "secret",
		});
		const result = await requireOwnedServerSsh(makeContext({ id: "server_1" }));
		expect(result).not.toBeInstanceOf(Response);
		const ctx = result as {
			authMethod: string;
			credential: string;
			server: unknown;
		};
		expect(ctx.authMethod).toBe("password");
		expect(ctx.credential).toBe("secret");
		expect(ctx.server).toBe(server);
	});
});
