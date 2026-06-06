// @vitest-environment happy-dom

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ServerDetailSnapshot } from "@/lib/server-detail";

import { useHermesWebUi } from "./use-hermes-web-ui";

const fetchMock = vi.fn();

afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

beforeEach(() => {
	vi.clearAllMocks();
	vi.stubGlobal("fetch", fetchMock);
});

describe("useHermesWebUi", () => {
	it("clears local Web UI override state when incoming detail changes", async () => {
		const onDetailChange = vi.fn();
		const initialDetail = createDetail({
			webUi: createWebUi({
				deployStatus: "deploying",
				updatedAt: "2026-06-06T04:00:00.000Z",
			}),
		});

		fetchMock.mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				webUi: createWebUi({ deployStatus: "deploying" }),
			}),
		});

		const { result, rerender } = renderHook(
			({ detail }) => useHermesWebUi(detail, onDetailChange),
			{ initialProps: { detail: createDetail() } },
		);

		await act(async () => {
			await result.current.deploy();
		});

		expect(result.current.webUi?.deployStatus).toBe("deploying");

		rerender({
			detail: initialDetail,
		});

		await waitFor(() => {
			expect(result.current.webUi?.deployStatus).toBe("deploying");
			expect(result.current.webUi?.updatedAt).toBe("2026-06-06T04:00:00.000Z");
		});
	});

	it("surfaces password reveal failures without leaving the spinner active", async () => {
		fetchMock.mockResolvedValueOnce({
			ok: false,
			json: async () => ({
				error: "Failed to decrypt Hermes Web UI password.",
			}),
		});

		const { result } = renderHook(() =>
			useHermesWebUi(
				createDetail({
					webUi: createWebUi({ enabled: true, deployStatus: "succeeded" }),
				}),
			),
		);

		await act(async () => {
			await result.current.revealPassword();
		});

		expect(result.current.isRevealingPassword).toBe(false);
		expect(result.current.error).toBe(
			"Failed to decrypt Hermes Web UI password.",
		);
	});
});

function createWebUi(
	overrides?: Partial<NonNullable<ServerDetailSnapshot["webUi"]>>,
): NonNullable<ServerDetailSnapshot["webUi"]> {
	return {
		enabled: false,
		port: 8787,
		proxyPath: "/api/servers/server_123/web-ui/proxy/",
		deployStatus: "idle",
		deployError: null,
		deployStartedAt: null,
		updatedAt: "2026-05-26T04:00:00.000Z",
		...overrides,
	};
}

function createDetail(overrides?: {
	webUi?: ServerDetailSnapshot["webUi"];
}): ServerDetailSnapshot {
	return {
		server: {
			id: "server_123",
			label: "Production VPS",
			host: "203.0.113.10",
			port: 22,
			username: "root",
			authMethod: "password",
			status: "connected",
			osName: "Ubuntu",
			osVersion: "24.04",
			architecture: "x86_64",
			supportLevel: "supported",
		},
		install: {
			status: "succeeded",
			version: "latest",
			updatedAt: "2026-05-26T03:00:00.000Z",
		},
		actionHistory: [],
		rollbackTarget: "latest",
		webUi: overrides && "webUi" in overrides ? (overrides.webUi ?? null) : null,
	};
}
