import type { Context } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { decryptApiServerKey } from "../crypto";
import { decryptApiServerKeyOrRespond } from "./decrypt-api-server-key-or-respond";
import { logger } from "./logger";

vi.mock("../crypto", () => ({
	decryptApiServerKey: vi.fn(),
}));

vi.mock("./logger", () => ({
	logger: {
		warn: vi.fn(),
		info: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
	},
}));

function createMockContext(): Context {
	// Match Hono's real `context.json(value, status)` shape so the
	// helper-produced 502 is a real Response with status + JSON body.
	const json = vi.fn(
		(value: unknown, status = 200) =>
			new Response(JSON.stringify(value), {
				status,
				headers: { "content-type": "application/json" },
			}),
	);
	return { json } as unknown as Context;
}

describe("decryptApiServerKeyOrRespond", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("maps empty / null / undefined payload to { ok: true, value: '' } without touching crypto or logger", () => {
		const ctx = createMockContext();
		const spy = ctx as unknown as { json: ReturnType<typeof vi.fn> };

		expect(decryptApiServerKeyOrRespond("", ctx)).toEqual({
			ok: true,
			value: "",
		});
		expect(decryptApiServerKeyOrRespond(null, ctx)).toEqual({
			ok: true,
			value: "",
		});
		expect(decryptApiServerKeyOrRespond(undefined, ctx)).toEqual({
			ok: true,
			value: "",
		});

		// Critical: empty payload must NOT 502 or trigger the warn path —
		// that's the upstream-validation concern, not this helper.
		expect(decryptApiServerKey).not.toHaveBeenCalled();
		expect(logger.warn).not.toHaveBeenCalled();
		expect(spy.json).not.toHaveBeenCalled();
	});

	it("returns the decrypted value on success and does not log", () => {
		vi.mocked(decryptApiServerKey).mockReturnValue("secret-key-xyz");
		const ctx = createMockContext();
		const spy = ctx as unknown as { json: ReturnType<typeof vi.fn> };

		const result = decryptApiServerKeyOrRespond("iv.tag.cipher", ctx);

		expect(result).toEqual({ ok: true, value: "secret-key-xyz" });
		expect(decryptApiServerKey).toHaveBeenCalledWith("iv.tag.cipher");
		expect(logger.warn).not.toHaveBeenCalled();
		expect(spy.json).not.toHaveBeenCalled();
	});

	it("returns a 502 response carrying the actionable decrypt error AND logs a structured warn", async () => {
		vi.mocked(decryptApiServerKey).mockImplementation(() => {
			throw new Error(
				"API server key is in legacy plaintext format and cannot be decrypted",
			);
		});
		const ctx = createMockContext();

		const result = decryptApiServerKeyOrRespond("plaintext-no-dots", ctx);

		expect(result.ok).toBe(false);
		if (result.ok) {
			throw new Error("expected !ok");
		}

		// The response is a real Response with status 502 carrying the
		// operator-facing actionable message verbatim.
		const response = result.response;
		expect(response).toBeInstanceOf(Response);
		expect(response.status).toBe(502);
		const body = (await response.json()) as { error: string };
		expect(body.error).toBe(
			"API server key is in legacy plaintext format and cannot be decrypted",
		);

		// The structured warn MUST carry the actionable message verbatim
		// so operators can find the failure in the logs by the same
		// string they see in the response body and in CONTEXT.md.
		expect(logger.warn).toHaveBeenCalledWith(
			{
				error:
					"API server key is in legacy plaintext format and cannot be decrypted",
			},
			"decryptApiServerKey failed in HTTP handler",
		);
	});

	it("falls back to a generic message when the thrown value is not an Error", () => {
		vi.mocked(decryptApiServerKey).mockImplementation(() => {
			// Emulate throwing a non-Error value (string, number, etc.)
			throw "string-error";
		});
		const ctx = createMockContext();

		const result = decryptApiServerKeyOrRespond("any", ctx);

		expect(result.ok).toBe(false);
		if (result.ok) {
			throw new Error("expected !ok");
		}
		expect(result.response.status).toBe(502);

		expect(logger.warn).toHaveBeenCalledWith(
			{ error: "Unable to decrypt API server key" },
			"decryptApiServerKey failed in HTTP handler",
		);
	});
});
