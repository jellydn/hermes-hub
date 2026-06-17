import type { Context } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { logger, getClientIp } = vi.hoisted(() => ({
	logger: {
		error: vi.fn(),
		warn: vi.fn(),
		info: vi.fn(),
		debug: vi.fn(),
	},
	getClientIp: vi.fn(() => "10.0.0.1"),
}));

vi.mock("./logger", () => ({
	logger,
}));

vi.mock("./get-client-ip", () => ({
	getClientIp,
}));

import { logHandlerFailure } from "./handler-error-log";

function makeContext(method: string) {
	return { req: { raw: { method } } } as unknown as Context;
}

describe("logHandlerFailure", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		getClientIp.mockReturnValue("10.0.0.1");
	});

	it("emits the schema-required fields on the structured pino line", () => {
		const error = new Error("(SSH) Channel open failure: Connection refused");
		logHandlerFailure({
			context: makeContext("GET"),
			event: "web_ui_proxy_failed",
			userId: "user-123",
			extras: {
				serverId: "server-abc",
				webUiPort: 8787,
				upstreamPath: "/",
				upstreamUnreachable: true,
			},
			error,
		});

		expect(logger.error).toHaveBeenCalledTimes(1);
		const [fields, message] = logger.error.mock.calls[0] ?? [];
		expect(message).toBe("web_ui_proxy_failed");
		expect(fields).toMatchObject({
			event: "web_ui_proxy_failed",
			userId: "user-123",
			ipAddress: "10.0.0.1",
			method: "GET",
			serverId: "server-abc",
			webUiPort: 8787,
			upstreamPath: "/",
			upstreamUnreachable: true,
			err: error,
		});
	});

	it("handles null userId and omits extras key when no extras", () => {
		const error = new Error("ECONNREFUSED");
		logHandlerFailure({
			context: makeContext("POST"),
			event: "telegram_deploy_failed",
			userId: null,
			error,
		});

		const [fields] = logger.error.mock.calls[0] ?? [];
		expect(fields).toMatchObject({
			event: "telegram_deploy_failed",
			userId: null,
			method: "POST",
			err: error,
		});
		// No extras borrowed from sibling tests.
		expect(fields).not.toHaveProperty("webUiPort");
		expect(fields).not.toHaveProperty("serverId");
	});

	it("preserves caller-provided snake_case event names without normalization", () => {
		// Documents the no-transform contract: typos surface as log-side
		// bugs, not helper-side bugs.
		logHandlerFailure({
			context: makeContext("GET"),
			event: "server_health_check_failed",
			userId: null,
			error: new Error("boom"),
		});

		const [fields] = logger.error.mock.calls[0] ?? [];
		expect(fields?.event).toBe("server_health_check_failed");
	});

	it.each([
		["camelCase", "webUiProxy-failed"],
		["pure camelCase, no hyphen", "webUiProxyFailed"],
		["missing _failed suffix", "web_ui_proxy"],
		["uppercase subject", "WEB_UI_PROXY_FAILED"],
		["digit-first subject", "1_endpoint_failed"],
	])("emits a warn line when the event name is non-conforming (%s)", (_label, badEvent) => {
		// Convention guardrail: a bad event name (camelCase, missing
		// suffix, uppercase, digit-first) breaks operator greppability, so
		// the helper must surface it as a separate warn line while still
		// emitting the actual error log. The failure path itself must NOT
		// throw.
		logHandlerFailure({
			context: makeContext("GET"),
			event: badEvent,
			userId: null,
			error: new Error("boom"),
		});

		expect(logger.warn).toHaveBeenCalledTimes(1);
		const [warnFields, warnMessage] = logger.warn.mock.calls[0] ?? [];
		expect(warnMessage).toContain("snake_case + _failed");
		expect(warnFields).toMatchObject({ event: badEvent });
		// Real error still emits, even on an invalid event name.
		expect(logger.error).toHaveBeenCalledTimes(1);
	});

	it("does NOT warn when the event name matches the schema", () => {
		logHandlerFailure({
			context: makeContext("GET"),
			event: "web_ui_proxy_failed",
			userId: null,
			error: new Error("boom"),
		});

		expect(logger.warn).not.toHaveBeenCalled();
		expect(logger.error).toHaveBeenCalledTimes(1);
	});

	it.each([
		["internal digit after first letter", "v1_endpoint_failed"],
		["minimal one-letter subject + suffix", "a_failed"],
	])("does NOT warn for valid-shape event names (%s)", (_label, validEvent) => {
		// Boundary check: digits are allowed internally (`[a-z][a-z0-9_]*_failed$`)
		// and the minimum case is one letter + suffix. Without these positives,
		// a future tightening of the regex could start over-firing on legitimate names.
		logHandlerFailure({
			context: makeContext("GET"),
			event: validEvent,
			userId: null,
			error: new Error("boom"),
		});

		expect(logger.warn).not.toHaveBeenCalled();
		expect(logger.error).toHaveBeenCalledTimes(1);
	});
});
