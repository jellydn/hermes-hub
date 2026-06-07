// @vitest-environment happy-dom

import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { type ComponentPropsWithoutRef, isValidElement, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hermesCommunitySiteUrl } from "@/lib/hermes-community";
import type { ServerDetailSnapshot } from "@/lib/server-detail";

const fetchMock = vi.fn();

vi.mock("lucide-react", () => {
	const MockIcon = (props: Record<string, unknown>) => <svg {...props} />;
	return {
		ExternalLink: MockIcon,
		Monitor: MockIcon,
		Rocket: MockIcon,
		RefreshCw: MockIcon,
		LoaderCircle: MockIcon,
		Eye: MockIcon,
		EyeOff: MockIcon,
		CheckCircle2: MockIcon,
		AlertCircle: MockIcon,
		TriangleAlert: MockIcon,
		Info: MockIcon,
		Circle: MockIcon,
	};
});

vi.mock("@/components/ui/button", () => ({
	Button: ({
		children,
		asChild,
		...props
	}: ComponentPropsWithoutRef<"button"> & { asChild?: boolean }) => {
		if (asChild && isValidElement(children)) {
			return children;
		}

		return (
			<button type="button" {...props}>
				{children}
			</button>
		);
	},
}));

import { HermesWebUiCard } from "./hermes-web-ui-card";

function StatefulHermesWebUiCard({
	initialDetail,
}: {
	initialDetail: ServerDetailSnapshot;
}) {
	const [detail, setDetail] = useState(initialDetail);

	return (
		<HermesWebUiCard
			detail={detail}
			onDetailChange={(update) => {
				setDetail((current) =>
					typeof update === "function" ? update(current) : update,
				);
			}}
		/>
	);
}

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

beforeEach(() => {
	vi.clearAllMocks();
	vi.stubGlobal("fetch", fetchMock);
});

describe("HermesWebUiCard", () => {
	it("renders setup when install succeeded and Web UI is disabled", () => {
		render(<HermesWebUiCard detail={createDetail()} />);

		expect(screen.getByTestId("hermes-web-ui-card")).toBeTruthy();
		expect(screen.getByTestId("hermes-web-ui-setup")).toBeTruthy();
		expect(screen.queryByTestId("hermes-web-ui-open")).toBeNull();
	});

	it("is absent when there is no install", () => {
		render(<HermesWebUiCard detail={createDetail({ install: null })} />);

		expect(screen.queryByTestId("hermes-web-ui-card")).toBeNull();
	});

	it("is absent when the latest install failed", () => {
		render(
			<HermesWebUiCard
				detail={createDetail({
					install: {
						status: "failed",
						version: "latest",
						updatedAt: "2026-05-26T03:00:00.000Z",
					},
				})}
			/>,
		);

		expect(screen.queryByTestId("hermes-web-ui-card")).toBeNull();
	});

	it("shows open and password controls when Web UI is enabled", () => {
		render(
			<HermesWebUiCard
				detail={createDetail({
					webUi: createWebUi({ enabled: true, deployStatus: "succeeded" }),
				})}
			/>,
		);

		const openLink = screen.getByTestId("hermes-web-ui-open");
		expect(openLink.getAttribute("href")).toBe(
			"/api/servers/server_123/web-ui/proxy/",
		);
		expect(screen.getByTestId("hermes-web-ui-password")).toBeTruthy();
		expect(screen.getByTestId("hermes-web-ui-redeploy")).toBeTruthy();
	});

	it("shows deploying state without setup button", () => {
		render(
			<HermesWebUiCard
				detail={createDetail({
					webUi: createWebUi({ deployStatus: "deploying" }),
				})}
			/>,
		);

		expect(screen.getByText("Setting up Web UI...")).toBeTruthy();
		expect(screen.queryByTestId("hermes-web-ui-setup")).toBeNull();
	});

	it("shows failed state with retry setup button", () => {
		render(
			<HermesWebUiCard
				detail={createDetail({
					webUi: createWebUi({
						deployStatus: "failed",
						deployError: "SSH timeout",
					}),
				})}
			/>,
		);

		expect(screen.getByText("SSH timeout")).toBeTruthy();
		expect(screen.getByText("Retry setup")).toBeTruthy();
	});

	it("keeps open controls visible while redeploying an enabled Web UI", () => {
		render(
			<HermesWebUiCard
				detail={createDetail({
					webUi: createWebUi({
						enabled: true,
						deployStatus: "deploying",
					}),
				})}
			/>,
		);

		expect(screen.getByTestId("hermes-web-ui-open")).toBeTruthy();
		expect(screen.getByTestId("hermes-web-ui-password")).toBeTruthy();
		expect(screen.getByText("Setting up Web UI...")).toBeTruthy();
	});

	it("redeploys Web UI when it is already enabled", async () => {
		vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });

		fetchMock
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					webUi: createWebUi({
						enabled: true,
						deployStatus: "deploying",
						updatedAt: "2026-05-26T05:00:00.000Z",
					}),
				}),
			})
			.mockResolvedValue({
				ok: true,
				json: async () => ({
					webUi: createWebUi({
						enabled: true,
						deployStatus: "succeeded",
						updatedAt: "2026-05-26T05:00:00.000Z",
					}),
				}),
			});

		render(
			<StatefulHermesWebUiCard
				initialDetail={createDetail({
					webUi: createWebUi({
						enabled: true,
						deployStatus: "succeeded",
					}),
				})}
			/>,
		);

		fireEvent.click(screen.getByTestId("hermes-web-ui-redeploy"));

		await waitFor(() => {
			expect(fetchMock).toHaveBeenCalledWith(
				"/api/servers/server_123/web-ui/deploy",
				{ method: "POST" },
			);
			expect(screen.getByText("Setting up Web UI...")).toBeTruthy();
		});

		await act(async () => {
			await vi.advanceTimersByTimeAsync(5000);
		});

		expect(
			await screen.findByText(
				"Hermes Web UI redeployed. Try opening it again.",
			),
		).toBeTruthy();
	});

	it("shows open control after polling completes", async () => {
		vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });

		fetchMock
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					webUi: createWebUi({ deployStatus: "deploying" }),
				}),
			})
			.mockResolvedValue({
				ok: true,
				json: async () => ({
					webUi: createWebUi({
						enabled: true,
						deployStatus: "succeeded",
					}),
				}),
			});

		render(<StatefulHermesWebUiCard initialDetail={createDetail()} />);
		fireEvent.click(screen.getByTestId("hermes-web-ui-setup"));

		await waitFor(() => {
			expect(screen.getByText("Setting up Web UI...")).toBeTruthy();
		});

		await act(async () => {
			await vi.advanceTimersByTimeAsync(5000);
		});

		expect(await screen.findByTestId("hermes-web-ui-open")).toBeTruthy();
		expect(screen.queryByTestId("hermes-web-ui-setup")).toBeNull();
	});

	it("deploys Web UI and updates detail on success", async () => {
		vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });

		fetchMock
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					webUi: createWebUi({ deployStatus: "deploying" }),
				}),
			})
			.mockResolvedValue({
				ok: true,
				json: async () => ({
					webUi: createWebUi({
						enabled: true,
						deployStatus: "succeeded",
					}),
				}),
			});

		render(<StatefulHermesWebUiCard initialDetail={createDetail()} />);

		fireEvent.click(screen.getByTestId("hermes-web-ui-setup"));

		await waitFor(() => {
			expect(fetchMock).toHaveBeenCalledWith(
				"/api/servers/server_123/web-ui/deploy",
				{ method: "POST" },
			);
			expect(screen.getByText("Setting up Web UI...")).toBeTruthy();
		});

		await act(async () => {
			await vi.advanceTimersByTimeAsync(5000);
		});

		expect(await screen.findByTestId("hermes-web-ui-open")).toBeTruthy();
	});

	it("shows poll failure error when background deploy fails", async () => {
		vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });

		fetchMock
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					webUi: createWebUi({ deployStatus: "deploying" }),
				}),
			})
			.mockResolvedValue({
				ok: true,
				json: async () => ({
					webUi: createWebUi({
						deployStatus: "failed",
						deployError: "Container start failed",
					}),
				}),
			});

		render(<StatefulHermesWebUiCard initialDetail={createDetail()} />);
		fireEvent.click(screen.getByTestId("hermes-web-ui-setup"));

		await waitFor(() => {
			expect(screen.getByText("Setting up Web UI...")).toBeTruthy();
		});

		await act(async () => {
			await vi.advanceTimersByTimeAsync(5000);
		});

		expect(await screen.findByText("Container start failed")).toBeTruthy();
	});

	it("shows an error when deploy fails", async () => {
		fetchMock.mockResolvedValue({
			ok: false,
			json: async () => ({ error: "Missing SSH credential" }),
		});

		render(<HermesWebUiCard detail={createDetail()} />);
		fireEvent.click(screen.getByTestId("hermes-web-ui-setup"));

		expect(await screen.findByText("Missing SSH credential")).toBeTruthy();
	});

	it("shows an error when deploy fetch rejects", async () => {
		fetchMock.mockRejectedValue(new Error("network down"));

		render(<HermesWebUiCard detail={createDetail()} />);
		fireEvent.click(screen.getByTestId("hermes-web-ui-setup"));

		expect(
			await screen.findByText("Web UI setup failed: Connection failed."),
		).toBeTruthy();
	});

	it("reveals the Web UI password", async () => {
		fetchMock.mockResolvedValue({
			ok: true,
			json: async () => ({ password: "generated-password" }),
		});

		render(
			<HermesWebUiCard
				detail={createDetail({
					webUi: createWebUi({ enabled: true, deployStatus: "succeeded" }),
				})}
			/>,
		);

		fireEvent.click(screen.getByTestId("hermes-web-ui-password"));

		expect(
			(await screen.findByTestId("hermes-web-ui-password-value")).textContent,
		).toBe("generated-password");
	});

	it("links to the Hermes community site", () => {
		render(<HermesWebUiCard detail={createDetail()} />);

		const communityLinks = screen
			.getAllByRole("link")
			.filter((link) => link.getAttribute("href") === hermesCommunitySiteUrl);

		expect(communityLinks.length).toBeGreaterThanOrEqual(1);
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
	install?: ServerDetailSnapshot["install"];
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
		install:
			overrides && "install" in overrides
				? (overrides.install ?? null)
				: {
						status: "succeeded",
						version: "latest",
						updatedAt: "2026-05-26T03:00:00.000Z",
					},
		actionHistory: [],
		rollbackTarget: "latest",
		webUi: overrides && "webUi" in overrides ? (overrides.webUi ?? null) : null,
	};
}
