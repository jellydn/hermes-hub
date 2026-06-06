import { beforeEach, describe, expect, it, vi } from "vitest";

import {
	exchangeCodexAuthorizationCode,
	pollCodexDeviceAuthorization,
	requestCodexDeviceCode,
} from "./device-flow";

const fetchMock = vi.fn();

beforeEach(() => {
	vi.clearAllMocks();
});

describe("requestCodexDeviceCode", () => {
	it("returns device-code metadata from OpenAI", async () => {
		fetchMock.mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					device_auth_id: "auth_123",
					user_code: "ABCD-1234",
					interval: 5,
				}),
				{ status: 200 },
			),
		);

		const result = await requestCodexDeviceCode(fetchMock);

		expect(result.deviceAuthId).toBe("auth_123");
		expect(result.userCode).toBe("ABCD-1234");
		expect(result.verificationUrl).toContain("/codex/device");
		expect(result.pollIntervalSeconds).toBeGreaterThanOrEqual(3);
	});

	it("throws when the device-code request fails", async () => {
		fetchMock.mockResolvedValueOnce(new Response("", { status: 500 }));

		await expect(requestCodexDeviceCode(fetchMock)).rejects.toMatchObject({
			code: "request_failed",
		});
	});
});

describe("pollCodexDeviceAuthorization", () => {
	it("stays pending while ChatGPT authorization is outstanding", async () => {
		fetchMock.mockResolvedValueOnce(new Response("", { status: 403 }));

		await expect(
			pollCodexDeviceAuthorization(
				{ deviceAuthId: "auth_123", userCode: "ABCD-1234" },
				fetchMock,
			),
		).rejects.toMatchObject({ code: "poll_pending" });
	});

	it("returns authorization code data when approval succeeds", async () => {
		fetchMock.mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					authorization_code: "auth-code",
					code_verifier: "verifier",
				}),
				{ status: 200 },
			),
		);

		const result = await pollCodexDeviceAuthorization(
			{ deviceAuthId: "auth_123", userCode: "ABCD-1234" },
			fetchMock,
		);

		expect(result).toEqual({
			authorization_code: "auth-code",
			code_verifier: "verifier",
		});
	});
});

describe("exchangeCodexAuthorizationCode", () => {
	it("exchanges the authorization code for OAuth tokens", async () => {
		fetchMock.mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					access_token: "access-token",
					refresh_token: "refresh-token",
				}),
				{ status: 200 },
			),
		);

		const tokens = await exchangeCodexAuthorizationCode(
			{
				authorizationCode: "auth-code",
				codeVerifier: "verifier",
			},
			fetchMock,
		);

		expect(tokens.access_token).toBe("access-token");
		expect(tokens.refresh_token).toBe("refresh-token");
	});

	it("throws when token exchange fails", async () => {
		fetchMock.mockResolvedValueOnce(new Response("", { status: 400 }));

		await expect(
			exchangeCodexAuthorizationCode(
				{
					authorizationCode: "auth-code",
					codeVerifier: "verifier",
				},
				fetchMock,
			),
		).rejects.toMatchObject({ code: "exchange_failed" });
	});
});
