// @vitest-environment happy-dom

import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import type { ComponentPropsWithoutRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("lucide-react", () => {
	const MockIcon = (props: Record<string, unknown>) => <svg {...props} />;
	return {
		CloudUpload: MockIcon,
		LoaderCircle: MockIcon,
		Save: MockIcon,
		Trash2: MockIcon,
		Edit3: MockIcon,
		Plus: MockIcon,
		BookOpen: MockIcon,
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

import { AgentSkills } from "./agent-skills";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const primaryTarget = {
	serverId: "server_1",
	label: "Primary",
	host: "1.2.3.4",
	installUpdatedAt: "2026-06-06T12:00:00.000Z",
};

const mockSkills = [
	{
		id: "skill_1",
		name: "web-search",
		sourceType: "hub" as const,
		installRef: "nous/web-search",
		content: null,
		enabled: true,
		createdAt: "2026-06-06T12:00:00.000Z",
		updatedAt: "2026-06-06T12:00:00.000Z",
	},
	{
		id: "skill_2",
		name: "code-exec",
		sourceType: "custom" as const,
		installRef: null,
		content: "Execute code.",
		enabled: false,
		createdAt: "2026-06-06T12:00:00.000Z",
		updatedAt: "2026-06-06T12:00:00.000Z",
	},
];

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

beforeEach(() => {
	fetchMock.mockImplementation((url) => {
		if (url.includes("/api/settings/agent-skills/remote-list")) {
			return Promise.resolve(
				new Response(
					JSON.stringify({
						raw: "Name         Source   Enabled\nweb-search   hub      true",
						skills: ["web-search"],
						count: 1,
					}),
					{
						status: 200,
						headers: { "content-type": "application/json" },
					},
				),
			);
		}
		if (url.includes("/api/settings/agent-skills/deploy")) {
			return Promise.resolve(
				new Response(
					JSON.stringify({
						deployedAt: "2026-06-07T12:00:00.000Z",
						skillCount: 1,
					}),
					{
						status: 200,
						headers: { "content-type": "application/json" },
					},
				),
			);
		}
		// Default response
		return Promise.resolve(
			new Response(JSON.stringify({ success: true }), {
				status: 200,
				headers: { "content-type": "application/json" },
			}),
		);
	});
	vi.stubGlobal("confirm", () => true);
});

describe("AgentSkills UI Component", () => {
	it("renders list of agent skills and sidebar state", async () => {
		render(
			<AgentSkills
				initialSkills={mockSkills}
				deploymentTargets={[primaryTarget]}
			/>,
		);

		expect(screen.getByText("web-search")).toBeTruthy();
		expect(screen.getByText("code-exec")).toBeTruthy();
		expect(screen.getByText("2 skills saved")).toBeTruthy();
		expect(
			screen.getByText(
				"1 enabled, 1 disabled. Changes apply on the VPS after deploy.",
			),
		).toBeTruthy();

		// Wait for initial remote inventory fetch
		await waitFor(() => {
			expect(screen.getByText("1 remote skill")).toBeTruthy();
		});
	});

	it("toggles enabled state when checkbox is clicked", async () => {
		const updatedSkill = { ...mockSkills[0], enabled: false };
		fetchMock.mockImplementation((url) => {
			if (url.includes("/api/settings/agent-skills/remote-list")) {
				return Promise.resolve(
					new Response(
						JSON.stringify({
							raw: "Name         Source   Enabled\nweb-search   hub      true",
							skills: ["web-search"],
							count: 1,
						}),
						{ status: 200 },
					),
				);
			}
			return Promise.resolve(
				new Response(JSON.stringify({ skill: updatedSkill }), {
					status: 200,
					headers: { "content-type": "application/json" },
				}),
			);
		});

		render(
			<AgentSkills
				initialSkills={[mockSkills[0]]}
				deploymentTargets={[primaryTarget]}
			/>,
		);

		const checkbox = screen.getByRole("checkbox");
		expect(checkbox.getAttribute("checked")).toBe(""); // true

		await act(async () => {
			fireEvent.click(checkbox);
		});

		expect(fetchMock).toHaveBeenCalledWith(
			"/api/settings/agent-skills/skill_1",
			expect.objectContaining({
				method: "PUT",
				body: JSON.stringify({ enabled: false }),
			}),
		);
	});

	it("creates a new hub skill successfully", async () => {
		const newSkill = {
			id: "skill_3",
			name: "new-hub-skill",
			sourceType: "hub" as const,
			installRef: "ref-new",
			content: null,
			enabled: true,
			createdAt: "2026-06-07T12:00:00.000Z",
			updatedAt: "2026-06-07T12:00:00.000Z",
		};

		fetchMock.mockImplementation((url) => {
			if (url.includes("/api/settings/agent-skills/remote-list")) {
				return Promise.resolve(
					new Response(JSON.stringify({ raw: "", skills: [], count: 0 }), {
						status: 200,
					}),
				);
			}
			return Promise.resolve(
				new Response(JSON.stringify({ skill: newSkill }), {
					status: 200,
					headers: { "content-type": "application/json" },
				}),
			);
		});

		render(
			<AgentSkills initialSkills={[]} deploymentTargets={[primaryTarget]} />,
		);

		const addButton = screen.getByText("Add Skill");
		await act(async () => {
			fireEvent.click(addButton);
		});

		const nameInput = screen.getByLabelText("Skill name");
		const refInput = screen.getByLabelText("Hub ID / Ref");

		await act(async () => {
			fireEvent.change(nameInput, { target: { value: "new-hub-skill" } });
			fireEvent.change(refInput, { target: { value: "ref-new" } });
		});

		const saveButton = screen.getByText("Save Skill");
		await act(async () => {
			fireEvent.click(saveButton);
		});

		expect(fetchMock).toHaveBeenCalledWith(
			"/api/settings/agent-skills",
			expect.objectContaining({
				method: "POST",
				body: JSON.stringify({
					name: "new-hub-skill",
					sourceType: "hub",
					enabled: true,
					installRef: "ref-new",
				}),
			}),
		);

		expect(screen.getByText("new-hub-skill")).toBeTruthy();
	});

	it("creates a new custom skill successfully", async () => {
		const newSkill = {
			id: "skill_4",
			name: "custom-skill",
			sourceType: "custom" as const,
			installRef: null,
			content: "Custom Markdown",
			enabled: true,
			createdAt: "2026-06-07T12:00:00.000Z",
			updatedAt: "2026-06-07T12:00:00.000Z",
		};

		fetchMock.mockImplementation((url) => {
			if (url.includes("/api/settings/agent-skills/remote-list")) {
				return Promise.resolve(
					new Response(JSON.stringify({ raw: "", skills: [], count: 0 }), {
						status: 200,
					}),
				);
			}
			return Promise.resolve(
				new Response(JSON.stringify({ skill: newSkill }), {
					status: 200,
					headers: { "content-type": "application/json" },
				}),
			);
		});

		render(
			<AgentSkills initialSkills={[]} deploymentTargets={[primaryTarget]} />,
		);

		const addButton = screen.getByText("Add Skill");
		await act(async () => {
			fireEvent.click(addButton);
		});

		// Choose custom source type
		const customRadioLabel = screen.getByText("Custom SKILL.md");
		await act(async () => {
			fireEvent.click(customRadioLabel);
		});

		const nameInput = screen.getByLabelText("Skill name");
		const contentInput = screen.getByLabelText("SKILL.md markdown content");

		await act(async () => {
			fireEvent.change(nameInput, { target: { value: "custom-skill" } });
			fireEvent.change(contentInput, { target: { value: "Custom Markdown" } });
		});

		const saveButton = screen.getByText("Save Skill");
		await act(async () => {
			fireEvent.click(saveButton);
		});

		expect(fetchMock).toHaveBeenCalledWith(
			"/api/settings/agent-skills",
			expect.objectContaining({
				method: "POST",
				body: JSON.stringify({
					name: "custom-skill",
					sourceType: "custom",
					enabled: true,
					content: "Custom Markdown",
				}),
			}),
		);
	});

	it("deletes a skill successfully", async () => {
		fetchMock.mockImplementation((url) => {
			if (url.includes("/api/settings/agent-skills/remote-list")) {
				return Promise.resolve(
					new Response(JSON.stringify({ raw: "", skills: [], count: 0 }), {
						status: 200,
					}),
				);
			}
			return Promise.resolve(
				new Response(JSON.stringify({ success: true }), {
					status: 200,
					headers: { "content-type": "application/json" },
				}),
			);
		});

		render(
			<AgentSkills
				initialSkills={[mockSkills[0]]}
				deploymentTargets={[primaryTarget]}
			/>,
		);

		expect(screen.getByText("web-search")).toBeTruthy();

		const deleteButton = screen.getByText("Delete");
		await act(async () => {
			fireEvent.click(deleteButton);
		});

		expect(fetchMock).toHaveBeenCalledWith(
			"/api/settings/agent-skills/skill_1",
			expect.objectContaining({
				method: "DELETE",
			}),
		);

		expect(screen.queryByText("web-search")).toBeNull();
	});

	it("deploys skills and shows success message", async () => {
		fetchMock.mockImplementation((url) => {
			if (url.includes("/api/settings/agent-skills/remote-list")) {
				return Promise.resolve(
					new Response(JSON.stringify({ raw: "", skills: [], count: 0 }), {
						status: 200,
					}),
				);
			}
			return Promise.resolve(
				new Response(
					JSON.stringify({
						deployedAt: "2026-06-07T12:00:00.000Z",
						skillCount: 1,
					}),
					{
						status: 200,
						headers: { "content-type": "application/json" },
					},
				),
			);
		});

		render(
			<AgentSkills
				initialSkills={[mockSkills[0]]}
				deploymentTargets={[primaryTarget]}
			/>,
		);

		const deployButton = screen.getByText("Deploy Agent Skills");
		await act(async () => {
			fireEvent.click(deployButton);
		});

		await waitFor(() => {
			expect(screen.getByText(/deployed 1 skill to 1\.2\.3\.4/i)).toBeTruthy();
		});
	});

	it("fetches remote inventory for the selected target and displays count/raw output", async () => {
		fetchMock.mockImplementation((url) => {
			if (url.includes("/api/settings/agent-skills/remote-list")) {
				return Promise.resolve(
					new Response(
						JSON.stringify({
							raw: "Name         Source   Enabled\nweb-search   hub      true\nfile-reader  hub      true",
							skills: ["web-search", "file-reader"],
							count: 2,
						}),
						{ status: 200 },
					),
				);
			}
			return Promise.resolve(new Response(JSON.stringify({})));
		});

		render(
			<AgentSkills
				initialSkills={mockSkills}
				deploymentTargets={[primaryTarget]}
			/>,
		);

		// Wait for remote inventory loading
		await waitFor(() => {
			expect(screen.getByText("2 remote skills")).toBeTruthy();
		});

		const textarea = screen.getByLabelText(
			"Raw CLI Output",
		) as HTMLTextAreaElement;
		expect(textarea.value).toContain("web-search   hub      true");
		expect(textarea.value).toContain("file-reader  hub      true");
		expect(textarea.readOnly).toBe(true);

		expect(
			screen.getByText(/Only HermesHub-managed skills are changed by Deploy/i),
		).toBeTruthy();
	});

	it("changing deployment target refreshes remote inventory", async () => {
		const secondaryTarget = {
			serverId: "server_2",
			label: "Secondary",
			host: "5.6.7.8",
			installUpdatedAt: "2026-06-06T12:00:00.000Z",
		};

		fetchMock.mockImplementation((url, init) => {
			if (url.includes("/api/settings/agent-skills/remote-list")) {
				const body = JSON.parse((init as RequestInit).body as string);
				const skills =
					body.serverId === "server_1"
						? ["web-search"]
						: ["web-search", "code-exec"];
				return Promise.resolve(
					new Response(
						JSON.stringify({
							raw: `Skills on ${body.serverId}:\n${skills.join("\n")}`,
							skills,
							count: skills.length,
						}),
						{ status: 200 },
					),
				);
			}
			return Promise.resolve(new Response(JSON.stringify({})));
		});

		render(
			<AgentSkills
				initialSkills={mockSkills}
				deploymentTargets={[primaryTarget, secondaryTarget]}
			/>,
		);

		await waitFor(() => {
			expect(screen.getByText("1 remote skill")).toBeTruthy();
		});

		const textarea = screen.getByLabelText(
			"Raw CLI Output",
		) as HTMLTextAreaElement;
		expect(textarea.value).toContain("Skills on server_1");

		const select = screen.getByRole("combobox", { name: /deploy target/i });
		await act(async () => {
			fireEvent.change(select, { target: { value: "server_2" } });
		});

		await waitFor(() => {
			expect(screen.getByText("2 remote skills")).toBeTruthy();
		});
		const updatedTextarea = screen.getByLabelText(
			"Raw CLI Output",
		) as HTMLTextAreaElement;
		expect(updatedTextarea.value).toContain("Skills on server_2");
	});
});
