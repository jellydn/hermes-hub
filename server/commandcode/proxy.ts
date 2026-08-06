import { randomUUID } from "node:crypto";
import type { Context } from "hono";

export const COMMAND_CODE_GENERATE_URL =
	"https://api.commandcode.ai/alpha/generate";
const COMMAND_CODE_MODELS_URL = "https://api.commandcode.ai/provider/v1/models";
const COMMAND_CODE_PROXY_PATH = "/api/commandcode-proxy/v1";
const GENERATION_TIMEOUT_MS = 120_000;
const MODELS_TIMEOUT_MS = 10_000;

type JsonRecord = Record<string, unknown>;

export type CommandCodeGenerateBody = {
	config: {
		workingDir: string;
		date: string;
		environment: string;
		structure: unknown[];
		isGitRepo: boolean;
		currentBranch: string;
		mainBranch: string;
		gitStatus: string;
		recentCommits: unknown[];
	};
	memory: null;
	taste: null;
	skills: null;
	params: {
		model: string;
		messages: unknown[];
		tools: unknown[];
		system: string;
		max_tokens: number;
		temperature: number;
		stream: true;
	};
	threadId: string;
};

type CompletionMetadata = {
	id?: string;
	created?: number;
	model: string;
};

type OpenAIUsage = {
	prompt_tokens: number;
	completion_tokens: number;
	total_tokens: number;
};

export class CommandCodeStreamError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "CommandCodeStreamError";
	}
}

function isRecord(value: unknown): value is JsonRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown) {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function recordOrEmpty(value: unknown): JsonRecord {
	if (isRecord(value)) {
		return value;
	}

	if (typeof value === "string") {
		try {
			const parsed: unknown = JSON.parse(value);
			return isRecord(parsed) ? parsed : {};
		} catch {
			return {};
		}
	}

	return {};
}

function promptPartToText(value: unknown, depth = 0): string {
	if (depth > 10) {
		return "";
	}
	if (typeof value === "string") {
		return value;
	}
	if (Array.isArray(value)) {
		return value
			.map((part) => promptPartToText(part, depth + 1))
			.filter(Boolean)
			.join("\n");
	}
	if (!isRecord(value)) {
		return "";
	}
	if (typeof value.text === "string" && value.text) {
		return value.text;
	}
	return promptPartToText(value.content, depth + 1);
}

function systemPromptToText(value: unknown): string {
	if (value === undefined || value === null) {
		return "";
	}
	if (typeof value === "string") {
		return value;
	}
	if (Array.isArray(value)) {
		return value
			.map((part) => promptPartToText(part))
			.filter(Boolean)
			.join("\n\n");
	}
	return promptPartToText(value);
}

function getToolCalls(message: JsonRecord) {
	if (!Array.isArray(message.tool_calls)) {
		return [];
	}

	return message.tool_calls.filter(isRecord);
}

function getToolCallId(toolCall: JsonRecord) {
	return typeof toolCall.id === "string" ? toolCall.id : "";
}

function getToolCallName(toolCall: JsonRecord) {
	const fn = isRecord(toolCall.function) ? toolCall.function : null;
	return fn && typeof fn.name === "string" ? fn.name : "";
}

function getToolCallInput(toolCall: JsonRecord) {
	const fn = isRecord(toolCall.function) ? toolCall.function : null;
	return recordOrEmpty(fn?.arguments);
}

function assistantContentParts(content: unknown) {
	if (typeof content === "string") {
		return content ? [{ type: "text", text: content }] : [];
	}
	if (!Array.isArray(content)) {
		return [];
	}

	return content.flatMap((part) => {
		if (!isRecord(part)) {
			return [];
		}
		if (part.type === "text") {
			return [
				{
					type: "text",
					text: typeof part.text === "string" ? part.text : "",
				},
			];
		}
		if (part.type === "reasoning" || part.type === "thinking") {
			const text =
				typeof part.text === "string"
					? part.text
					: typeof part.thinking === "string"
						? part.thinking
						: "";
			return [{ type: "reasoning", text }];
		}
		return [];
	});
}

function toolResultText(content: unknown) {
	if (typeof content === "string") {
		return content;
	}
	if (!Array.isArray(content)) {
		return "";
	}

	return content
		.filter(isRecord)
		.filter((part) => part.type === "text")
		.map((part) => (typeof part.text === "string" ? part.text : ""))
		.join("\n");
}

function messagesToCommandCode(messages: unknown[]) {
	const toolResultIds = new Set<string>();
	const toolNames = new Map<string, string>();

	for (const value of messages) {
		if (!isRecord(value)) {
			continue;
		}
		if (value.role === "tool" && typeof value.tool_call_id === "string") {
			toolResultIds.add(value.tool_call_id);
		}
		if (value.role === "assistant") {
			for (const toolCall of getToolCalls(value)) {
				const id = getToolCallId(toolCall);
				if (id) {
					toolNames.set(id, getToolCallName(toolCall));
				}
			}
		}
	}

	return messages.flatMap((value) => {
		if (!isRecord(value)) {
			return [];
		}

		if (value.role === "user") {
			return [{ role: "user", content: value.content ?? "" }];
		}

		if (value.role === "assistant") {
			const content = [
				...assistantContentParts(value.content),
				...getToolCalls(value).flatMap((toolCall) => {
					const id = getToolCallId(toolCall);
					if (!id || !toolResultIds.has(id)) {
						return [];
					}
					return [
						{
							type: "tool-call",
							toolCallId: id,
							toolName: getToolCallName(toolCall),
							input: getToolCallInput(toolCall),
						},
					];
				}),
			];

			return content.length > 0 ? [{ role: "assistant", content }] : [];
		}

		if (value.role === "tool" && typeof value.tool_call_id === "string") {
			const toolCallId = value.tool_call_id;
			if (!toolNames.has(toolCallId)) {
				return [];
			}
			const isError = value.is_error === true || value.isError === true;
			const messageToolName =
				typeof value.name === "string" ? value.name : null;

			return [
				{
					role: "tool",
					content: [
						{
							type: "tool-result",
							toolCallId,
							toolName: messageToolName ?? toolNames.get(toolCallId) ?? "",
							output: {
								type: isError ? "error-text" : "text",
								value: toolResultText(value.content),
							},
						},
					],
				},
			];
		}

		return [];
	});
}

function toolsToCommandCode(value: unknown) {
	if (!Array.isArray(value)) {
		return [];
	}

	return value.flatMap((tool) => {
		if (
			!isRecord(tool) ||
			tool.type !== "function" ||
			!isRecord(tool.function)
		) {
			return [];
		}

		const fn = tool.function;
		if (typeof fn.name !== "string" || !fn.name) {
			return [];
		}

		return [
			{
				type: "function",
				name: fn.name,
				...(typeof fn.description === "string"
					? { description: fn.description }
					: {}),
				input_schema: fn.parameters ?? {},
			},
		];
	});
}

export function transformOpenAIToCommandCode(
	openaiBody: unknown,
): CommandCodeGenerateBody {
	if (!isRecord(openaiBody)) {
		throw new TypeError("Request body must be a JSON object.");
	}
	if (typeof openaiBody.model !== "string" || !openaiBody.model.trim()) {
		throw new TypeError("model is required.");
	}
	if (!Array.isArray(openaiBody.messages)) {
		throw new TypeError("messages must be an array.");
	}

	const system = openaiBody.messages
		.filter(isRecord)
		.filter(
			(message) => message.role === "system" || message.role === "developer",
		)
		.map((message) => systemPromptToText(message.content))
		.filter(Boolean)
		.join("\n\n");
	const conversationMessages = openaiBody.messages.filter(
		(message) =>
			!isRecord(message) ||
			(message.role !== "system" && message.role !== "developer"),
	);
	const requestedMaxTokens =
		finiteNumber(openaiBody.max_tokens) ??
		finiteNumber(openaiBody.max_completion_tokens);
	const maxTokens = requestedMaxTokens
		? Math.min(64_000, Math.max(1, Math.floor(requestedMaxTokens)))
		: 64_000;

	return {
		config: {
			workingDir: "/",
			date: new Date().toISOString().slice(0, 10),
			environment: `${process.platform}-${process.arch}, Node.js ${process.version}`,
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
			model: openaiBody.model.trim(),
			messages: messagesToCommandCode(conversationMessages),
			tools: toolsToCommandCode(openaiBody.tools),
			system,
			max_tokens: maxTokens,
			temperature: finiteNumber(openaiBody.temperature) ?? 0.3,
			// Command Code only exposes generation as an event stream. The proxy
			// assembles these events when the OpenAI caller requests JSON instead.
			stream: true,
		},
		threadId: randomUUID(),
	};
}

export function getCommandCodeRequestHeaders(authorization: string) {
	return {
		Authorization: authorization,
		"Content-Type": "application/json",
		"x-command-code-version": "0.29.0",
		"x-cli-environment": "production",
		"x-project-slug": "hermes-hub",
		"x-taste-learning": "true",
		"x-co-flag": "false",
	};
}

export function getCommandCodeProxyBaseUrl() {
	const publicUrl = process.env.BETTER_AUTH_URL?.trim();
	if (!publicUrl) {
		throw new Error(
			"BETTER_AUTH_URL is required to deploy the Command Code Coding Plan proxy.",
		);
	}

	const proxyUrl = new URL(COMMAND_CODE_PROXY_PATH, publicUrl);
	if (proxyUrl.protocol !== "http:" && proxyUrl.protocol !== "https:") {
		throw new Error("BETTER_AUTH_URL must use HTTP or HTTPS.");
	}
	const nodeEnv =
		typeof globalThis !== "undefined" && globalThis.process?.env?.NODE_ENV;
	if (
		nodeEnv === "production" &&
		(proxyUrl.protocol !== "https:" ||
			["localhost", "127.0.0.1", "::1"].includes(proxyUrl.hostname))
	) {
		throw new Error(
			"BETTER_AUTH_URL must be a public HTTPS URL for the Command Code proxy in production.",
		);
	}

	return proxyUrl.toString().replace(/\/$/, "");
}

export function parseCommandCodeEventLine(line: string) {
	let value = line.trim();
	if (!value || value.startsWith(":") || value.startsWith("event:")) {
		return;
	}
	if (value.startsWith("data:")) {
		value = value.slice(5).trim();
	}
	if (!value || value === "[DONE]") {
		return;
	}

	try {
		const parsed: unknown = JSON.parse(value);
		return isRecord(parsed) ? parsed : undefined;
	} catch {
		return;
	}
}

async function* readCommandCodeEvents(body: ReadableStream<Uint8Array>) {
	const reader = body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	let reachedEnd = false;

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) {
				reachedEnd = true;
				break;
			}

			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split("\n");
			buffer = lines.pop() ?? "";
			for (const line of lines) {
				const event = parseCommandCodeEventLine(line);
				if (event) {
					yield event;
				}
			}
		}

		buffer += decoder.decode();
		const event = parseCommandCodeEventLine(buffer);
		if (event) {
			yield event;
		}
	} finally {
		if (!reachedEnd) {
			await reader.cancel().catch(() => undefined);
		}
		reader.releaseLock();
	}
}

export function mapCommandCodeFinishReason(reason: unknown) {
	if (reason === "tool-calls") {
		return "tool_calls";
	}
	if (
		reason === "length" ||
		reason === "max_tokens" ||
		reason === "max-tokens" ||
		reason === "max_output_tokens"
	) {
		return "length";
	}
	return "stop";
}

function getEventText(event: JsonRecord) {
	return typeof event.text === "string" ? event.text : "";
}

function getToolCallArguments(event: JsonRecord) {
	return recordOrEmpty(event.input ?? event.args ?? event.arguments);
}

function getErrorMessage(event: JsonRecord) {
	if (isRecord(event.error) && typeof event.error.message === "string") {
		return event.error.message;
	}
	if (typeof event.error === "string") {
		return event.error;
	}
	return "Command Code generation failed.";
}

function getUsage(event: JsonRecord): OpenAIUsage {
	const totalUsage = isRecord(event.totalUsage) ? event.totalUsage : {};
	const inputDetails = isRecord(totalUsage.inputTokenDetails)
		? totalUsage.inputTokenDetails
		: {};
	const detailedInput =
		(finiteNumber(inputDetails.noCacheTokens) ?? 0) +
		(finiteNumber(inputDetails.cacheReadTokens) ?? 0) +
		(finiteNumber(inputDetails.cacheWriteTokens) ?? 0);
	const promptTokens =
		finiteNumber(totalUsage.inputTokens) ?? Math.max(0, detailedInput);
	const completionTokens = finiteNumber(totalUsage.outputTokens) ?? 0;

	return {
		prompt_tokens: promptTokens,
		completion_tokens: completionTokens,
		total_tokens: promptTokens + completionTokens,
	};
}

function resolveCompletionMetadata(metadata: CompletionMetadata) {
	return {
		id: metadata.id ?? `chatcmpl-${randomUUID()}`,
		created: metadata.created ?? Math.floor(Date.now() / 1000),
		model: metadata.model,
	};
}

function completionChunk(
	metadata: Required<CompletionMetadata>,
	delta: JsonRecord,
	finishReason: string | null,
	usage?: OpenAIUsage,
) {
	return {
		id: metadata.id,
		object: "chat.completion.chunk",
		created: metadata.created,
		model: metadata.model,
		choices: [{ index: 0, delta, finish_reason: finishReason }],
		...(usage ? { usage } : {}),
	};
}

function formatSseData(value: unknown) {
	return `data: ${JSON.stringify(value)}\n\n`;
}

function formatSseError(message: string) {
	return formatSseData({
		error: {
			message,
			type: "commandcode_error",
			code: "upstream_error",
		},
	});
}

export function transformCommandCodeStreamToOpenAI(
	body: ReadableStream<Uint8Array>,
	metadataInput: CompletionMetadata,
	onCancel?: () => void,
) {
	const metadata = resolveCompletionMetadata(metadataInput);
	const encoder = new TextEncoder();
	let toolCallIndex = 0;
	let emittedRole = false;
	let canceled = false;
	function withAssistantRole(delta: JsonRecord) {
		if (emittedRole) {
			return delta;
		}
		emittedRole = true;
		return { role: "assistant", ...delta };
	}

	return new ReadableStream<Uint8Array>({
		async start(controller) {
			let finished = false;
			try {
				for await (const event of readCommandCodeEvents(body)) {
					if (canceled) {
						break;
					}
					if (event.type === "text-delta") {
						controller.enqueue(
							encoder.encode(
								formatSseData(
									completionChunk(
										metadata,
										withAssistantRole({ content: getEventText(event) }),
										null,
									),
								),
							),
						);
						continue;
					}

					if (event.type === "tool-call") {
						const toolCallId =
							typeof event.toolCallId === "string" ? event.toolCallId : "";
						const toolName =
							typeof event.toolName === "string" ? event.toolName : "";
						controller.enqueue(
							encoder.encode(
								formatSseData(
									completionChunk(
										metadata,
										withAssistantRole({
											tool_calls: [
												{
													index: toolCallIndex,
													id: toolCallId,
													type: "function",
													function: {
														name: toolName,
														arguments: JSON.stringify(
															getToolCallArguments(event),
														),
													},
												},
											],
										}),
										null,
									),
								),
							),
						);
						toolCallIndex += 1;
						continue;
					}

					if (event.type === "finish") {
						controller.enqueue(
							encoder.encode(
								formatSseData(
									completionChunk(
										metadata,
										{},
										mapCommandCodeFinishReason(event.finishReason),
										getUsage(event),
									),
								),
							),
						);
						controller.enqueue(encoder.encode("data: [DONE]\n\n"));
						finished = true;
						break;
					}

					if (event.type === "error") {
						controller.enqueue(
							encoder.encode(formatSseError(getErrorMessage(event))),
						);
						controller.enqueue(encoder.encode("data: [DONE]\n\n"));
						finished = true;
						break;
					}
				}

				if (!finished && !canceled) {
					controller.enqueue(
						encoder.encode(
							formatSseError("Command Code stream ended before completion."),
						),
					);
					controller.enqueue(encoder.encode("data: [DONE]\n\n"));
				}
			} catch (error) {
				if (!canceled) {
					const message =
						error instanceof Error
							? error.message
							: "Command Code stream failed.";
					controller.enqueue(encoder.encode(formatSseError(message)));
					controller.enqueue(encoder.encode("data: [DONE]\n\n"));
				}
			} finally {
				if (!canceled) {
					controller.close();
				}
			}
		},
		cancel() {
			canceled = true;
			onCancel?.();
		},
	});
}

export async function collectCommandCodeCompletion(
	body: ReadableStream<Uint8Array>,
	metadataInput: CompletionMetadata,
) {
	const metadata = resolveCompletionMetadata(metadataInput);
	let content = "";
	const toolCalls: unknown[] = [];

	for await (const event of readCommandCodeEvents(body)) {
		if (event.type === "text-delta") {
			content += getEventText(event);
			continue;
		}
		if (event.type === "tool-call") {
			toolCalls.push({
				id: typeof event.toolCallId === "string" ? event.toolCallId : "",
				type: "function",
				function: {
					name: typeof event.toolName === "string" ? event.toolName : "",
					arguments: JSON.stringify(getToolCallArguments(event)),
				},
			});
			continue;
		}
		if (event.type === "error") {
			throw new CommandCodeStreamError(getErrorMessage(event));
		}
		if (event.type === "finish") {
			return {
				id: metadata.id,
				object: "chat.completion",
				created: metadata.created,
				model: metadata.model,
				choices: [
					{
						index: 0,
						message: {
							role: "assistant",
							content: content || null,
							...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
						},
						finish_reason: mapCommandCodeFinishReason(event.finishReason),
					},
				],
				usage: getUsage(event),
			};
		}
	}

	throw new CommandCodeStreamError(
		"Command Code stream ended before completion.",
	);
}

function getBearerAuthorization(context: Context) {
	const authorization = context.req.header("authorization")?.trim() ?? "";
	const match = /^Bearer\s+(.+)$/i.exec(authorization);
	return match?.[1]?.trim() ? `Bearer ${match[1].trim()}` : null;
}

function isStreamingRequest(body: unknown) {
	return isRecord(body) && body.stream === true;
}

function upstreamErrorResponse(response: Response, body: ArrayBuffer) {
	return new Response(body, {
		status: response.status,
		statusText: response.statusText,
		headers: {
			"content-type":
				response.headers.get("content-type") ?? "application/json",
		},
	});
}

export async function handleCommandCodeProxy(context: Context) {
	const authorization = getBearerAuthorization(context);
	if (!authorization) {
		return context.json({ error: "Bearer API key is required." }, 401);
	}

	let openaiBody: unknown;
	try {
		openaiBody = await context.req.json();
	} catch {
		return context.json({ error: "Invalid JSON body." }, 400);
	}

	let commandCodeBody: CommandCodeGenerateBody;
	try {
		commandCodeBody = transformOpenAIToCommandCode(openaiBody);
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Invalid request body.";
		return context.json({ error: message }, 400);
	}

	let upstream: Response;
	const upstreamAbort = new AbortController();
	try {
		upstream = await fetch(COMMAND_CODE_GENERATE_URL, {
			method: "POST",
			headers: getCommandCodeRequestHeaders(authorization),
			body: JSON.stringify(commandCodeBody),
			signal: AbortSignal.any([
				upstreamAbort.signal,
				AbortSignal.timeout(GENERATION_TIMEOUT_MS),
			]),
		});
	} catch (error) {
		const timedOut = error instanceof Error && error.name === "TimeoutError";
		return context.json(
			{
				error: timedOut
					? "Command Code request timed out."
					: "Command Code request failed.",
			},
			timedOut ? 504 : 502,
		);
	}

	if (!upstream.ok) {
		return upstreamErrorResponse(upstream, await upstream.arrayBuffer());
	}
	if (!upstream.body) {
		return context.json(
			{ error: "Command Code returned an empty response." },
			502,
		);
	}

	const metadata = { model: commandCodeBody.params.model };
	if (isStreamingRequest(openaiBody)) {
		return new Response(
			transformCommandCodeStreamToOpenAI(upstream.body, metadata, () =>
				upstreamAbort.abort(),
			),
			{
				headers: {
					"Cache-Control": "no-cache",
					"Content-Type": "text/event-stream; charset=utf-8",
					"X-Accel-Buffering": "no",
				},
			},
		);
	}

	try {
		return context.json(
			await collectCommandCodeCompletion(upstream.body, metadata),
		);
	} catch (error) {
		const message =
			error instanceof Error
				? error.message
				: "Command Code generation failed.";
		return context.json({ error: { message, type: "commandcode_error" } }, 502);
	}
}

export async function handleCommandCodeProxyModels(context: Context) {
	let upstream: Response;
	try {
		upstream = await fetch(COMMAND_CODE_MODELS_URL, {
			method: "GET",
			signal: AbortSignal.timeout(MODELS_TIMEOUT_MS),
		});
	} catch (error) {
		const timedOut = error instanceof Error && error.name === "TimeoutError";
		return context.json(
			{
				error: timedOut
					? "Command Code request timed out."
					: "Command Code request failed.",
			},
			timedOut ? 504 : 502,
		);
	}

	return new Response(await upstream.arrayBuffer(), {
		status: upstream.status,
		statusText: upstream.statusText,
		headers: {
			"content-type":
				upstream.headers.get("content-type") ?? "application/json",
		},
	});
}
