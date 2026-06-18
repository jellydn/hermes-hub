// @vitest-environment happy-dom

import {
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
		CheckCircle2: MockIcon,
		CloudUpload: MockIcon,
		LoaderCircle: MockIcon,
		TriangleAlert: MockIcon,
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

import { ModelAccessDeployPanel } from "./model-access-deploy-panel";

const fetchMock = vi.fn();

vi.stubGlobal("fetch", fetchMock);

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

beforeEach(() => {
	fetchMock.mockReset();
});

function jsonResponse(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

// Shape of the raw API response when the deploy endpoint returns a host-key error.
// Mirrors `HostKeyErrorResponsePayload` in `shared/contracts/host-key-error.ts`:
// fingerprint and algorithm live under a nested `hostKey` object because
// `parseHostKeyErrorPayload` reads them from there.
const hostKeyErrorBody = {
	code: "host_key_missing" as const,
	error: "Host key not yet trusted.",
	serverId: "server-1",
	serverHost: "1.2.3.4",
	hostKey: {
		observedFingerprint: "SHA256:abc123",
		observedAlgorithm: "ssh-ed25519",
	},
};

describe("ModelAccessDeployPanel", () => {
	it("renders the title and the deploy button when isDeployed is true", () => {
		render(
			<ModelAccessDeployPanel
				title="Model Access Deployment"
				isDeployed
				emptyMessage={<span>Empty</span>}
			>
				<p>Push description</p>
			</ModelAccessDeployPanel>,
		);

		expect(screen.getByText("Model Access Deployment")).toBeTruthy();
		expect(screen.getByText("Push description")).toBeTruthy();
		const button = screen.getByRole("button", { name: /deploy to hermes/i });
		expect(button.hasAttribute("disabled")).toBe(false);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("renders the emptyMessage instead of the button when isDeployed is false", () => {
		render(
			<ModelAccessDeployPanel
				title="Model Access Deployment"
				isDeployed={false}
				emptyMessage={<span>Save a provider first</span>}
			>
				<p>Push description</p>
			</ModelAccessDeployPanel>,
		);

		expect(screen.getByText("Save a provider first")).toBeTruthy();
		expect(screen.queryByRole("button", { name: /deploy/i })).toBeNull();
		expect(screen.queryByText("Push description")).toBeNull();
	});

	it("deploys successfully and shows the success feedback", async () => {
		fetchMock.mockResolvedValueOnce(
			jsonResponse({ status: "deployed", model: "gpt-4o" }),
		);

		render(
			<ModelAccessDeployPanel
				title="Model Access Deployment"
				isDeployed
				emptyMessage={<span>Empty</span>}
			>
				<p>Description</p>
			</ModelAccessDeployPanel>,
		);

		fireEvent.click(
			screen.getByRole("button", { name: /deploy to hermes server/i }),
		);

		await waitFor(() => {
			expect(screen.getByText(/"gpt-4o" deployed successfully/i)).toBeTruthy();
		});

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock).toHaveBeenCalledWith(
			"/api/providers/deploy",
			expect.objectContaining({ method: "POST" }),
		);

		const button = screen.getByRole("button", { name: /deploy to hermes/i });
		expect(button.hasAttribute("disabled")).toBe(false);
	});

	it("disables the button while a deploy is in flight", async () => {
		// Captured eagerly by the Promise executor inside the mock below — the
		// `!:` definite-assignment avoids spurious `never` narrowing after `await`.
		let resolveDeploy!: (response: Response) => void;
		fetchMock.mockImplementationOnce(
			() =>
				new Promise<Response>((resolve) => {
					resolveDeploy = resolve;
				}),
		);

		render(
			<ModelAccessDeployPanel
				title="Model Access Deployment"
				isDeployed
				emptyMessage={<span>Empty</span>}
			>
				<p>Description</p>
			</ModelAccessDeployPanel>,
		);

		fireEvent.click(
			screen.getByRole("button", { name: /deploy to hermes server/i }),
		);

		await waitFor(() => {
			const button = screen.getByRole("button", { name: /deploying/i });
			expect(button.hasAttribute("disabled")).toBe(true);
		});

		resolveDeploy(jsonResponse({ status: "deployed", model: "gpt-4o" }));

		await waitFor(() => {
			expect(screen.getByText(/"gpt-4o" deployed successfully/i)).toBeTruthy();
		});
	});

	it("surfaces a generic deploy error from the API", async () => {
		fetchMock.mockResolvedValueOnce(
			jsonResponse({ error: "No model access config found." }, 400),
		);

		render(
			<ModelAccessDeployPanel
				title="Model Access Deployment"
				isDeployed
				emptyMessage={<span>Empty</span>}
			>
				<p>Description</p>
			</ModelAccessDeployPanel>,
		);

		fireEvent.click(
			screen.getByRole("button", { name: /deploy to hermes server/i }),
		);

		await waitFor(() => {
			expect(screen.getByText(/no model access config found/i)).toBeTruthy();
		});

		const button = screen.getByRole("button", { name: /deploy to hermes/i });
		expect(button.hasAttribute("disabled")).toBe(false);
	});

	it("falls back to a network error message when fetch throws", async () => {
		fetchMock.mockRejectedValueOnce(new TypeError("Network down"));

		render(
			<ModelAccessDeployPanel
				title="Model Access Deployment"
				isDeployed
				emptyMessage={<span>Empty</span>}
			>
				<p>Description</p>
			</ModelAccessDeployPanel>,
		);

		fireEvent.click(
			screen.getByRole("button", { name: /deploy to hermes server/i }),
		);

		await waitFor(() => {
			expect(
				screen.getByText(/network error\. please check your connection/i),
			).toBeTruthy();
		});
	});

	it("shows the host key trust panel when the deploy returns a host key error", async () => {
		fetchMock.mockResolvedValueOnce(jsonResponse(hostKeyErrorBody, 400));

		render(
			<ModelAccessDeployPanel
				title="Model Access Deployment"
				isDeployed
				emptyMessage={<span>Empty</span>}
			>
				<p>Description</p>
			</ModelAccessDeployPanel>,
		);

		fireEvent.click(
			screen.getByRole("button", { name: /deploy to hermes server/i }),
		);

		await waitFor(() => {
			expect(screen.getByText(/host key not yet trusted/i)).toBeTruthy();
		});

		expect(screen.getByText(/SHA256:abc123/)).toBeTruthy();
		expect(screen.getByText(/ssh-ed25519/)).toBeTruthy();
		expect(
			screen.getByRole("button", { name: /trust host key and retry/i }),
		).toBeTruthy();
		expect(screen.getByRole("button", { name: /cancel/i })).toBeTruthy();
	});

	it("dismisses the host key trust panel when the cancel button is clicked", async () => {
		fetchMock.mockResolvedValueOnce(jsonResponse(hostKeyErrorBody, 400));

		render(
			<ModelAccessDeployPanel
				title="Model Access Deployment"
				isDeployed
				emptyMessage={<span>Empty</span>}
			>
				<p>Description</p>
			</ModelAccessDeployPanel>,
		);

		fireEvent.click(
			screen.getByRole("button", { name: /deploy to hermes server/i }),
		);

		await waitFor(() => {
			expect(screen.getByText(/host key not yet trusted/i)).toBeTruthy();
		});

		fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

		await waitFor(() => {
			expect(screen.queryByText(/host key not yet trusted/i)).toBeNull();
		});

		expect(
			screen.getByRole("button", { name: /deploy to hermes server/i }),
		).toBeTruthy();
		expect(
			screen.queryByRole("button", { name: /trust host key and retry/i }),
		).toBeNull();
	});

	it("accepts the host key, dismisses the panel, and then retries the deploy", async () => {
		// 1. Deploy → host key error.
		// 2. Host-key/accept.
		// 3. Deploy retry → success.
		fetchMock
			.mockResolvedValueOnce(jsonResponse(hostKeyErrorBody, 400))
			.mockResolvedValueOnce(jsonResponse({ success: true }))
			.mockResolvedValueOnce(
				jsonResponse({ status: "deployed", model: "gpt-4o" }),
			);

		render(
			<ModelAccessDeployPanel
				title="Model Access Deployment"
				isDeployed
				emptyMessage={<span>Empty</span>}
			>
				<p>Description</p>
			</ModelAccessDeployPanel>,
		);

		fireEvent.click(
			screen.getByRole("button", { name: /deploy to hermes server/i }),
		);

		await waitFor(() => {
			expect(screen.getByText(/host key not yet trusted/i)).toBeTruthy();
		});

		fireEvent.click(
			screen.getByRole("button", { name: /trust host key and retry/i }),
		);

		await waitFor(() => {
			expect(screen.getByText(/"gpt-4o" deployed successfully/i)).toBeTruthy();
		});

		expect(fetchMock).toHaveBeenCalledTimes(3);
		expect(fetchMock).toHaveBeenNthCalledWith(
			1,
			"/api/providers/deploy",
			expect.objectContaining({ method: "POST" }),
		);
		expect(fetchMock).toHaveBeenNthCalledWith(
			2,
			`/api/servers/${encodeURIComponent(hostKeyErrorBody.serverId)}/host-key/accept`,
			expect.objectContaining({
				method: "POST",
				body: JSON.stringify({
					fingerprint: hostKeyErrorBody.hostKey.observedFingerprint,
					algorithm: hostKeyErrorBody.hostKey.observedAlgorithm,
				}),
			}),
		);
		expect(fetchMock).toHaveBeenNthCalledWith(
			3,
			"/api/providers/deploy",
			expect.objectContaining({ method: "POST" }),
		);

		expect(screen.queryByText(/host key not yet trusted/i)).toBeNull();
	});

	it("shows an error when host key acceptance fails and skips the deploy retry", async () => {
		fetchMock
			.mockResolvedValueOnce(jsonResponse(hostKeyErrorBody, 400))
			.mockResolvedValueOnce(
				jsonResponse({ error: "Could not accept host key." }, 500),
			);

		render(
			<ModelAccessDeployPanel
				title="Model Access Deployment"
				isDeployed
				emptyMessage={<span>Empty</span>}
			>
				<p>Description</p>
			</ModelAccessDeployPanel>,
		);

		fireEvent.click(
			screen.getByRole("button", { name: /deploy to hermes server/i }),
		);

		await waitFor(() => {
			expect(screen.getByText(/host key not yet trusted/i)).toBeTruthy();
		});

		fireEvent.click(
			screen.getByRole("button", { name: /trust host key and retry/i }),
		);

		await waitFor(() => {
			expect(screen.getByText(/could not accept host key/i)).toBeTruthy();
		});

		// Acceptance failed → no third fetch (the deploy retry must not run)
		expect(fetchMock).toHaveBeenCalledTimes(2);
		// Panel goes away once acceptance reports ok=false.
		expect(screen.queryByText(/host key not yet trusted/i)).toBeNull();
	});

	it("disables the button when the disabled prop is true", () => {
		render(
			<ModelAccessDeployPanel
				title="Model Access Deployment"
				isDeployed
				disabled
				emptyMessage={<span>Empty</span>}
			>
				<p>Description</p>
			</ModelAccessDeployPanel>,
		);

		const button = screen.getByRole("button", { name: /deploy to hermes/i });
		expect(button.hasAttribute("disabled")).toBe(true);

		fireEvent.click(button);

		// Clicks on a disabled button don't trigger deploy.
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("renders multiple deploy lifecycles back-to-back (success after failure)", async () => {
		fetchMock
			.mockResolvedValueOnce(jsonResponse({ error: "Backend down" }, 502))
			.mockResolvedValueOnce(
				jsonResponse({ status: "deployed", model: "gpt-4o" }),
			);

		render(
			<ModelAccessDeployPanel
				title="Model Access Deployment"
				isDeployed
				emptyMessage={<span>Empty</span>}
			>
				<p>Description</p>
			</ModelAccessDeployPanel>,
		);

		fireEvent.click(
			screen.getByRole("button", { name: /deploy to hermes server/i }),
		);

		await waitFor(() => {
			expect(screen.getByText(/backend down/i)).toBeTruthy();
		});

		fireEvent.click(
			screen.getByRole("button", { name: /deploy to hermes server/i }),
		);

		await waitFor(() => {
			expect(screen.getByText(/"gpt-4o" deployed successfully/i)).toBeTruthy();
		});

		// Second deploy resets prior error.
		expect(screen.queryByText(/backend down/i)).toBeNull();
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});
});
