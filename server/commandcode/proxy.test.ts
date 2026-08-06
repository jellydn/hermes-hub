import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
	COMMAND_CODE_GENERATE_URL,
	collectCommandCodeCompletion,
	getCommandCodeProxyBaseUrl,
	handleCommandCodeProxy,
	handleCommandCodeProxyModels,
	mapCommandCodeFinishReason,
	transformCommandCodeStreamToOpenAI,
	transformOpenAIToCommandCode,
} from "./proxy";

const fetchMock = vi.fn();

function streamFromChunks(chunks: string[]) {
	const encoder = new TextEncoder();
	return new ReadableStream<Uint8Array>({
		start(controller) {
			for (const chunk of chunks) {
				controller.enqueue(encoder.encode(chunk));
			}
			controller.close();
		},
	});
}

function ndjsonResponse(lines: unknown[]) {
	return new Response(
		streamFromChunks(lines.map((line) => `${JSON.stringify(line)}\n`)),
		{ status: 200 },
	);
}

function parseSse(text: string) {
	return text
		.split("\n\n")
		.map((line) => line.trim())
		.filter(Boolean)
		.map((line) => line.replace(/^data:\s*/, ""))
		.map((value) => (value === "[DONE]" ? value : JSON.parse(value)));
}

describe("Command Code request transformation", () => {
	it("converts OpenAI system, conversation, tool-call, result, and tool shapes", () => {
		const result = transformOpenAIToCommandCode({
			model: "deepseek/deepseek-v4-flash",
			messages: [
				{ role: "system", content: "You are Hermes." },
				{
					role: "developer",
					content: [{ type: "text", text: "Be concise." }],
				},
				{ role: "user", content: "Read the file." },
				{
					role: "assistant",
					content: "I'll inspect it.",
					tool_calls: [
						{
							id: "call_paired",
							type: "function",
							function: {
								name: "read_file",
								arguments: '{"path":"/tmp/a"}',
							},
						},
						{
							id: "call_unpaired",
							type: "function",
							function: { name: "ignored", arguments: "{}" },
						},
					],
				},
				{
					role: "tool",
					tool_call_id: "call_paired",
					content: "contents",
				},
			],
			tools: [
				{
					type: "function",
					function: {
						name: "read_file",
						description: "Read a file",
						parameters: {
							type: "object",
							properties: { path: { type: "string" } },
							required: ["path"],
						},
					},
				},
			],
			max_tokens: 90000,
			temperature: 0,
			stream: false,
		});

		expect(result).toMatchObject({
			config: {
				workingDir: "/",
				date: new Date().toISOString().slice(0, 10),
				structure: [],
				isGitRepo: false,
				currentBranch: "",
				mainBranch: "",
				gitStatus: "",
				recentCommits: [],
			},
			memory: null,
			taste: null,
			skills: null,
			params: {
				model: "deepseek/deepseek-v4-flash",
				system: "You are Hermes.\n\nBe concise.",
				max_tokens: 64000,
				temperature: 0,
				stream: true,
				messages: [
					{ role: "user", content: "Read the file." },
					{
						role: "assistant",
						content: [
							{ type: "text", text: "I'll inspect it." },
							{
								type: "tool-call",
								toolCallId: "call_paired",
								toolName: "read_file",
								input: { path: "/tmp/a" },
							},
						],
					},
					{
						role: "tool",
						content: [
							{
								type: "tool-result",
								toolCallId: "call_paired",
								toolName: "read_file",
								output: { type: "text", value: "contents" },
							},
						],
					},
				],
				tools: [
					{
						type: "function",
						name: "read_file",
						description: "Read a file",
						input_schema: {
							type: "object",
							properties: { path: { type: "string" } },
							required: ["path"],
						},
					},
				],
			},
		});
		expect(result.config.environment).toContain(
			`${process.platform}-${process.arch}`,
		);
		expect(result.threadId).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
		);
	});

	it("rejects requests without the required OpenAI fields", () => {
		expect(() => transformOpenAIToCommandCode(null)).toThrow(
			"Request body must be a JSON object.",
		);
		expect(() =>
			transformOpenAIToCommandCode({ model: "", messages: [] }),
		).toThrow("model is required.");
		expect(() =>
			transformOpenAIToCommandCode({ model: "model", messages: null }),
		).toThrow("messages must be an array.");
	});
});

describe("Command Code proxy URL", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("builds the proxy base URL from BETTER_AUTH_URL", () => {
		vi.stubEnv("BETTER_AUTH_URL", "https://hub.example.com/login");

		expect(getCommandCodeProxyBaseUrl()).toBe(
			"https://hub.example.com/api/commandcode-proxy/v1",
		);
	});

	it("rejects an insecure proxy URL in production", () => {
		vi.stubEnv("BETTER_AUTH_URL", "http://hub.example.com");
		vi.stubEnv("NODE_ENV", "production");

		expect(() => getCommandCodeProxyBaseUrl()).toThrow(
			"BETTER_AUTH_URL must be a public HTTPS URL",
		);
	});
});

describe("Command Code response transformation", () => {
	it("converts split NDJSON and SSE-prefixed events into OpenAI SSE chunks", async () => {
		const body = streamFromChunks([
			'{"type":"text-delta","text":"Hel',
			'"}\n',
			'data: {"type":"reasoning-delta","text":"hidden"}\n',
			'{"type":"tool-call","toolCallId":"call_1","toolName":"read_file","input":"{\\"path\\":\\"/tmp/x\\"}"}\n',
			'{"type":"finish","finishReason":"tool-calls","totalUsage":{"inputTokens":10,"outputTokens":2}}',
		]);

		const result = await new Response(
			transformCommandCodeStreamToOpenAI(body, {
				id: "chatcmpl-fixed",
				created: 123,
				model: "test-model",
			}),
		).text();
		const events = parseSse(result);

		expect(events).toHaveLength(4);
		expect(events[0]).toMatchObject({
			id: "chatcmpl-fixed",
			object: "chat.completion.chunk",
			created: 123,
			model: "test-model",
			choices: [
				{
					delta: { role: "assistant", content: "Hel" },
					finish_reason: null,
				},
			],
		});
		expect(events[1]).toMatchObject({
			id: "chatcmpl-fixed",
			choices: [
				{
					delta: {
						tool_calls: [
							{
								index: 0,
								id: "call_1",
								type: "function",
								function: {
									name: "read_file",
									arguments: '{"path":"/tmp/x"}',
								},
							},
						],
					},
					finish_reason: null,
				},
			],
		});
		expect(events[2]).toMatchObject({
			id: "chatcmpl-fixed",
			choices: [{ delta: {}, finish_reason: "tool_calls" }],
			usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 },
		});
		expect(events[3]).toBe("[DONE]");
		expect(result).not.toContain("hidden");
	});

	it("emits an OpenAI error event and terminal marker for upstream stream errors", async () => {
		const body = streamFromChunks([
			'{"type":"error","error":{"message":"quota exceeded"}}\n',
		]);
		const result = await new Response(
			transformCommandCodeStreamToOpenAI(body, { model: "test-model" }),
		).text();

		expect(parseSse(result)).toEqual([
			{
				error: {
					message: "quota exceeded",
					type: "commandcode_error",
					code: "upstream_error",
				},
			},
			"[DONE]",
		]);
	});

	it("aborts upstream generation when the OpenAI consumer disconnects", async () => {
		let upstreamController: ReadableStreamDefaultController<Uint8Array>;
		const upstream = new ReadableStream<Uint8Array>({
			start(controller) {
				upstreamController = controller;
			},
		});
		const abortUpstream = vi.fn(() => {
			upstreamController.error(new Error("aborted"));
		});
		const transformed = transformCommandCodeStreamToOpenAI(
			upstream,
			{ model: "test-model" },
			abortUpstream,
		);

		await transformed.cancel();

		expect(abortUpstream).toHaveBeenCalledTimes(1);
	});

	it("assembles a non-streaming OpenAI completion", async () => {
		const completion = await collectCommandCodeCompletion(
			ndjsonResponse([
				{ type: "text-delta", text: "Hello" },
				{
					type: "finish",
					finishReason: "stop",
					totalUsage: {
						inputTokens: 3,
						outputTokens: 1,
					},
				},
			]).body as ReadableStream<Uint8Array>,
			{ id: "chatcmpl-fixed", created: 123, model: "test-model" },
		);

		expect(completion).toMatchObject({
			id: "chatcmpl-fixed",
			object: "chat.completion",
			choices: [
				{
					message: { role: "assistant", content: "Hello" },
					finish_reason: "stop",
				},
			],
			usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 },
		});
	});

	it.each([
		["tool-calls", "tool_calls"],
		["length", "length"],
		["max_tokens", "length"],
		["max-tokens", "length"],
		["max_output_tokens", "length"],
		["stop", "stop"],
		["unknown", "stop"],
	])("maps finish reason %s to %s", (input, expected) => {
		expect(mapCommandCodeFinishReason(input)).toBe(expected);
	});
});

describe("Command Code proxy handlers", () => {
	const app = new Hono();
	app.post("/v1/chat/completions", handleCommandCodeProxy);
	app.get("/v1/models", handleCommandCodeProxyModels);

	beforeEach(() => {
		fetchMock.mockReset();
		vi.stubGlobal("fetch", fetchMock);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("forwards generation to the CLI endpoint and streams OpenAI SSE", async () => {
		fetchMock.mockResolvedValueOnce(
			ndjsonResponse([
				{ type: "text-delta", text: "Hi" },
				{ type: "finish", finishReason: "stop" },
			]),
		);

		const response = await app.request("http://localhost/v1/chat/completions", {
			method: "POST",
			headers: {
				Authorization: "Bearer user_secret",
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				model: "deepseek/deepseek-v4-flash",
				messages: [{ role: "user", content: "Hello" }],
				stream: true,
			}),
		});

		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toContain("text/event-stream");
		expect(await response.text()).toContain("data: [DONE]");
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe(COMMAND_CODE_GENERATE_URL);
		expect(init).toMatchObject({
			method: "POST",
			headers: expect.objectContaining({
				Authorization: "Bearer user_secret",
				"x-command-code-version": "0.29.0",
				"x-cli-environment": "production",
				"x-project-slug": "hermes-hub",
				"x-taste-learning": "true",
				"x-co-flag": "false",
			}),
		});
		const upstreamBody = JSON.parse(String(init.body));
		expect(upstreamBody).toMatchObject({
			params: {
				model: "deepseek/deepseek-v4-flash",
				messages: [{ role: "user", content: "Hello" }],
				stream: true,
			},
		});
	});

	it("returns a single JSON completion when OpenAI streaming is disabled", async () => {
		fetchMock.mockResolvedValueOnce(
			ndjsonResponse([
				{ type: "text-delta", text: "Hi" },
				{ type: "finish", finishReason: "stop" },
			]),
		);

		const response = await app.request("http://localhost/v1/chat/completions", {
			method: "POST",
			headers: {
				Authorization: "Bearer user_secret",
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				model: "test-model",
				messages: [{ role: "user", content: "Hello" }],
				stream: false,
			}),
		});

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			object: "chat.completion",
			choices: [{ message: { role: "assistant", content: "Hi" } }],
		});
	});

	it("preserves upstream HTTP errors", async () => {
		fetchMock.mockResolvedValueOnce(
			new Response(JSON.stringify({ error: { code: "upgrade_required" } }), {
				status: 403,
				headers: { "content-type": "application/json" },
			}),
		);

		const response = await app.request("http://localhost/v1/chat/completions", {
			method: "POST",
			headers: {
				Authorization: "Bearer user_secret",
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ model: "test-model", messages: [] }),
		});

		expect(response.status).toBe(403);
		expect(await response.json()).toEqual({
			error: { code: "upgrade_required" },
		});
	});

	it("requires a bearer key for generation", async () => {
		const response = await app.request("http://localhost/v1/chat/completions", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ model: "test-model", messages: [] }),
		});

		expect(response.status).toBe(401);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("proxies model discovery without forwarding authorization", async () => {
		fetchMock.mockResolvedValueOnce(
			new Response(JSON.stringify({ data: [{ id: "model" }] }), {
				status: 200,
				headers: { "content-type": "application/json" },
			}),
		);

		const response = await app.request("http://localhost/v1/models", {
			headers: { Authorization: "Bearer should-not-forward" },
		});

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ data: [{ id: "model" }] });
		expect(fetchMock).toHaveBeenCalledWith(
			"https://api.commandcode.ai/provider/v1/models",
			expect.objectContaining({ method: "GET" }),
		);
		const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(init.headers).toBeUndefined();
	});
});
