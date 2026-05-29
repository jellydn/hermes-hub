import { beforeEach, describe, expect, it, vi } from "vitest";

const redirect = vi.fn((options: unknown) => options);

vi.mock("@tanstack/react-router", () => ({
	redirect,
}));

describe("requireSession", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("redirects to /login when there is no active session", async () => {
		const { requireSession } = await import("./session");

		await expect(
			requireSession("/dashboard", async () => null as never),
		).rejects.toEqual({
			to: "/login",
			search: { redirect: "/dashboard" },
		});
		expect(redirect).toHaveBeenCalledWith({
			to: "/login",
			search: { redirect: "/dashboard" },
		});
	});

	it("returns the session when one exists", async () => {
		const session = {
			session: { id: "session_123" },
			user: { id: "user_123" },
		};
		const { requireSession } = await import("./session");

		await expect(
			requireSession(undefined, async () => session as never),
		).resolves.toEqual(session);
	});
});
