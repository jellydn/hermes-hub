// @vitest-environment happy-dom

import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/react";
import type { ComponentPropsWithoutRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("lucide-react", () => {
	const MockIcon = (props: Record<string, unknown>) => <svg {...props} />;
	return {
		Check: MockIcon,
		CloudUpload: MockIcon,
		LoaderCircle: MockIcon,
		Plus: MockIcon,
		Save: MockIcon,
		Trash2: MockIcon,
	};
});

vi.mock("#/components/ui/button", () => ({
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

const primaryTarget = {
	serverId: "server_1",
	label: "Primary",
	host: "1.2.3.4",
	installUpdatedAt: "2026-06-06T12:00:00.000Z",
};

const backupTarget = {
	serverId: "server_2",
	label: "Backup",
	host: "5.6.7.8",
	installUpdatedAt: "2026-06-05T12:00:00.000Z",
};

const memoryServer = {
	...savedServer,
	id: "mcp_memory",
	name: "memory",
	args: ["-y", "@modelcontextprotocol/server-memory"],
	env: [],
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
	it("renders recommended preset cards before advanced setup", () => {
		render(<McpSettings initialServers={[]} deploymentTargets={[]} />);

		expect(screen.getByText(/recommended mcp servers/i)).toBeTruthy();
		expect(screen.getByText("Memory")).toBeTruthy();
		expect(screen.getByText("Sequential Thinking")).toBeTruthy();
		expect(screen.getByText("Filesystem")).toBeTruthy();
		expect(
			screen.queryByRole("button", { name: /add custom server/i }),
		).toBeNull();
	});

	it("saves the memory preset with the expected POST body", async () => {
		fetchMock.mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					server: memoryServer,
				}),
				{
					status: 200,
					headers: { "content-type": "application/json" },
				},
			),
		);

		render(<McpSettings initialServers={[]} deploymentTargets={[]} />);

		const memoryCard = screen.getByText("Memory").closest("li");
		expect(memoryCard).toBeTruthy();
		fireEvent.click(
			within(memoryCard as HTMLElement).getByRole("button", {
				name: /^configure$/i,
			}),
		);
		fireEvent.click(screen.getByRole("button", { name: /save server/i }));

		await flushAsyncWork();

		expect(fetchMock).toHaveBeenCalledWith(
			"/api/settings/mcp-servers",
			expect.objectContaining({
				method: "POST",
				body: JSON.stringify({
					name: "memory",
					transport: "stdio",
					enabled: true,
					command: "npx",
					args: ["-y", "@modelcontextprotocol/server-memory"],
					url: "",
					env: [],
					headers: [],
					toolsInclude: [],
					toolsExclude: [],
					toolsResources: true,
					toolsPrompts: true,
					timeout: null,
					connectTimeout: null,
					supportsParallelToolCalls: false,
				}),
			}),
		);
		expect(
			screen.getByText(/mcp server saved\. deploy mcp settings/i),
		).toBeTruthy();
	});

	it("saves the filesystem preset with the selected allowed directory", async () => {
		fetchMock.mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					server: {
						...memoryServer,
						id: "mcp_fs",
						name: "filesystem",
						args: [
							"-y",
							"@modelcontextprotocol/server-filesystem",
							"/srv/hermes-data",
						],
					},
				}),
				{
					status: 200,
					headers: { "content-type": "application/json" },
				},
			),
		);

		render(<McpSettings initialServers={[]} deploymentTargets={[]} />);

		const filesystemCard = screen.getByText("Filesystem").closest("li");
		expect(filesystemCard).toBeTruthy();
		fireEvent.click(
			within(filesystemCard as HTMLElement).getByRole("button", {
				name: /^configure$/i,
			}),
		);

		fireEvent.change(screen.getByLabelText(/allowed directory/i), {
			target: { value: "/srv/hermes-data" },
		});
		fireEvent.click(screen.getByRole("button", { name: /save server/i }));

		await flushAsyncWork();

		expect(fetchMock).toHaveBeenCalledWith(
			"/api/settings/mcp-servers",
			expect.objectContaining({
				method: "POST",
				body: JSON.stringify({
					name: "filesystem",
					transport: "stdio",
					enabled: true,
					command: "npx",
					args: [
						"-y",
						"@modelcontextprotocol/server-filesystem",
						"/srv/hermes-data",
					],
					url: "",
					env: [],
					headers: [],
					toolsInclude: [],
					toolsExclude: [],
					toolsResources: true,
					toolsPrompts: true,
					timeout: null,
					connectTimeout: null,
					supportsParallelToolCalls: false,
				}),
			}),
		);
	});

	it("marks a saved preset as saved when initialServers already contains that name", () => {
		render(
			<McpSettings initialServers={[memoryServer]} deploymentTargets={[]} />,
		);

		const memoryCard = screen.getByText("Memory").closest("li");
		expect(memoryCard).toBeTruthy();
		expect(
			within(memoryCard as HTMLElement).getByText(/^saved$/i),
		).toBeTruthy();
		expect(
			within(memoryCard as HTMLElement).getByRole("button", {
				name: /edit saved server/i,
			}),
		).toBeTruthy();
	});

	it("hides the advanced custom form until advanced setup is opened", () => {
		render(<McpSettings initialServers={[]} deploymentTargets={[]} />);

		expect(screen.queryByLabelText(/^server name$/i)).toBeNull();

		fireEvent.click(screen.getByRole("button", { name: /^advanced setup$/i }));
		fireEvent.click(screen.getByRole("button", { name: /add custom server/i }));

		expect(screen.getByLabelText(/^server name$/i)).toBeTruthy();
	});

	it("renders saved MCP servers with transport and enabled state", () => {
		render(
			<McpSettings
				initialServers={[savedServer]}
				deploymentTargets={[primaryTarget]}
			/>,
		);

		expect(screen.getByText("github")).toBeTruthy();
		expect(screen.getByText(/stdio · enabled/i)).toBeTruthy();
	});

	it("switches the advanced form to HTTP transport fields", () => {
		render(<McpSettings initialServers={[]} deploymentTargets={[]} />);

		fireEvent.click(screen.getByRole("button", { name: /^advanced setup$/i }));
		fireEvent.click(screen.getByRole("button", { name: /add custom server/i }));
		fireEvent.click(screen.getByRole("radio", { name: /http/i }));

		expect(screen.getByLabelText(/^url$/i)).toBeTruthy();
		expect(screen.queryByLabelText(/^command$/i)).toBeNull();
	});

	it("shows masked stored env values when editing a server", () => {
		render(
			<McpSettings initialServers={[savedServer]} deploymentTargets={[]} />,
		);

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

		render(
			<McpSettings initialServers={[savedServer]} deploymentTargets={[]} />,
		);

		fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
		fireEvent.click(screen.getByRole("button", { name: /delete/i }));

		await flushAsyncWork();

		expect(fetchMock).toHaveBeenCalledWith(
			"/api/settings/mcp-servers/mcp_1",
			expect.objectContaining({ method: "DELETE" }),
		);
		expect(screen.queryByText("github")).toBeNull();
	});

	it("deploys MCP settings with the selected serverId and shows success state", async () => {
		fetchMock.mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					status: "deployed",
					serverId: "server_2",
					serverHost: "5.6.7.8",
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
				deploymentTargets={[primaryTarget, backupTarget]}
			/>,
		);

		fireEvent.change(screen.getByLabelText(/deploy target/i), {
			target: { value: "server_2" },
		});
		fireEvent.click(
			screen.getByRole("button", { name: /deploy mcp settings/i }),
		);

		await flushAsyncWork();

		expect(fetchMock).toHaveBeenCalledWith(
			"/api/settings/mcp-servers/deploy",
			expect.objectContaining({
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ serverId: "server_2" }),
			}),
		);
		expect(
			screen.getByText((content) =>
				content.startsWith("Deployed 1 MCP server to "),
			),
		).toBeTruthy();
	});

	it("shows install-first messaging when no deployment targets exist", () => {
		render(
			<McpSettings initialServers={[savedServer]} deploymentTargets={[]} />,
		);

		expect(screen.getByText(/install hermes on a server first/i)).toBeTruthy();
		expect(screen.queryByLabelText(/deploy target/i)).toBeNull();
	});

	it("shows deploy errors from the API", async () => {
		fetchMock.mockReset();
		fetchMock.mockResolvedValue(
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
				deploymentTargets={[primaryTarget]}
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
