import type { Context } from "hono";
import { vi } from "vitest";

export function createContext(input?: {
	method?: string;
	url?: string;
	serverId?: string;
}) {
	return {
		req: {
			raw: new Request(input?.url ?? "http://localhost:3000/", {
				method: input?.method ?? "GET",
			}),
			url: input?.url ?? "http://localhost:3000/",
			header: vi.fn().mockReturnValue(null),
			param: (name: string) =>
				name === "id" ? (input?.serverId ?? "server_123") : undefined,
		},
		json: (body: unknown, status = 200) =>
			Response.json(body, { status }) as Response,
	} as unknown as Context;
}
