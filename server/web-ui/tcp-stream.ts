import type { EventEmitter } from "node:events";

export type TcpForwardStream = EventEmitter & {
	write(chunk: Buffer | string): boolean;
	end(): void;
};
