import type { EventEmitter } from "node:events";

import type { OwnedServerSshContext } from "../request-guards";
import type { ServerWebUiRecord } from "./records";

export type TcpForwardStream = EventEmitter & {
	write(chunk: Buffer | string): boolean;
	end(): void;
};

export type EnabledWebUiContext = OwnedServerSshContext & {
	webUi: ServerWebUiRecord;
};

export const HOP_BY_HOP_REQUEST_HEADERS = new Set([
	"connection",
	"keep-alive",
	"proxy-authenticate",
	"proxy-authorization",
	"te",
	"trailer",
	"transfer-encoding",
	"upgrade",
	"host",
]);

export const HOP_BY_HOP_RESPONSE_HEADERS = new Set([
	"connection",
	"keep-alive",
	"proxy-authenticate",
	"proxy-authorization",
	"te",
	"trailer",
	"transfer-encoding",
	"upgrade",
]);

export class WebUiProxyError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "WebUiProxyError";
	}
}
