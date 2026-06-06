// @vitest-environment happy-dom

import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
} from "@testing-library/react";
import type { ComponentPropsWithoutRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("lucide-react", () => {
	const MockIcon = (props: Record<string, unknown>) => <svg {...props} />;
	return {
		CloudUpload: MockIcon,
		LoaderCircle: MockIcon,
		Plus: MockIcon,
		Save: MockIcon,
		Trash2: MockIcon,
	};
});

vi.mock("@/components/ui/button", () => ({
	Button: ({
		children,
		disabled,
		onClick,
		type = "button",
		...props
	}: ComponentPropsWithoutRef<"button">) => (
		<button type={type} disabled={disabled} onClick={onClick} {...props}>
			{children}
		</button>
	),
}));

import { McpSettings } from "./mcp-settings";

const fetchMock = vi.fn();

vi.stubGlobal("fetch", fetchMock);

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

const savedServer = {
	id: "mcp_1",
	name: "github",
	transport: "stdio" as const,
	enabled: true,
	command: "npx",
	args: ["-y", "@modelcontextprotocol/server-github"],
	url: null,
	env: [
		{
			key: "GITHUB_PERSONAL_ACCESS_TOKEN",
			valueLast4: "1234",
			hasStoredValue: true,
		},
	],
	headers: [],
	toolsInclude: [],
	toolsExclude: [],
	toolsResources: true,
	toolsPrompts: true,
	timeout: null,
	connectTimeout: null,
	supportsParallelToolCalls: false,
	createdAt: "2026-06-06T12:00:00.000Z",
	updatedAt: "2026-06-06T12:00:00.000Z",
};

beforeEach(() => {
	fetchMock.mockResolvedValue(
		new Response(JSON.stringify({ status: "ok" }), {
			status: 200,
			headers: { "content-type": "application/json" },
		}),
	);
});

describe("McpSettings", () => {
	it("renders saved MCP servers with transport and enabled state", () => {
		render(
			<McpSettings
				initialServers={[savedServer]}
				telegramDeploy={{ deployedServerHost: "1.2.3.4" }}
			/>,
		);

		expect(screen.getByText("github")).toBeTruthy();
		expect(screen.getByText(/stdio · enabled/i)).toBeTruthy();
	});

	it("switches the form to HTTP transport fields", () => {
		render(<McpSettings initialServers={[]} />);

		fireEvent.click(screen.getByRole("button", { name: /add server/i }));
		fireEvent.click(screen.getByRole("radio", { name: /http/i }));

		expect(screen.getByLabelText(/^url$/i)).toBeTruthy();
		expect(screen.queryByLabelText(/^command$/i)).toBeNull();
	});

	it("shows masked stored env values when editing a server", () => {
		render(<McpSettings initialServers={[savedServer]} />);

		fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));

		expect(screen.getByText(/stored value ending in 1234/i)).toBeTruthy();
	});

	it("deletes a server and clears the form", async () => {
		fetchMock.mockResolvedValueOnce(
			new Response(JSON.stringify({ status: "deleted", id: "mcp_1" }), {
				status: 200,
				headers: { "content-type": "application/json" },
			}),
		);

		render(<McpSettings initialServers={[savedServer]} />);

		fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
		fireEvent.click(screen.getByRole("button", { name: /delete/i }));

		await flushAsyncWork();

		expect(fetchMock).toHaveBeenCalledWith(
			"/api/settings/mcp-servers/mcp_1",
			expect.objectContaining({ method: "DELETE" }),
		);
		expect(screen.queryByText("github")).toBeNull();
	});

	it("deploys MCP settings and shows success state", async () => {
		fetchMock.mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					status: "deployed",
					serverHost: "1.2.3.4",
					serverCount: 1,
					deployedAt: "2026-06-06T12:00:00.000Z",
				}),
				{
					status: 200,
					headers: { "content-type": "application/json" },
				},
			),
		);

		render(
			<McpSettings
				initialServers={[savedServer]}
				telegramDeploy={{ deployedServerHost: "1.2.3.4" }}
			/>,
		);

		fireEvent.click(
			screen.getByRole("button", { name: /deploy mcp settings/i }),
		);

		await flushAsyncWork();

		expect(fetchMock).toHaveBeenCalledWith(
			"/api/settings/mcp-servers/deploy",
			expect.objectContaining({ method: "POST" }),
		);
		expect(
			screen.getByText(/deployed 1 mcp server to 1\.2\.3\.4/i),
		).toBeTruthy();
	});

	it("shows deploy errors from the API", async () => {
		fetchMock.mockResolvedValueOnce(
			new Response(
				JSON.stringify({ error: "Deploy failed: SSH write failed" }),
				{
					status: 502,
					headers: { "content-type": "application/json" },
				},
			),
		);

		render(
			<McpSettings
				initialServers={[savedServer]}
				telegramDeploy={{ deployedServerHost: "1.2.3.4" }}
			/>,
		);

		fireEvent.click(
			screen.getByRole("button", { name: /deploy mcp settings/i }),
		);

		await flushAsyncWork();

		expect(screen.getByText(/deploy failed: ssh write failed/i)).toBeTruthy();
	});
});

async function flushAsyncWork() {
	await act(async () => {
		await Promise.resolve();
	});
}
