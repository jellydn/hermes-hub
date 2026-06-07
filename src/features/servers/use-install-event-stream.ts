import { useRef, useState } from "react";

import {
	type InstallEvent,
	type InstallStatus,
	mergeInstallSnapshot,
} from "@/features/servers/install-snapshot";
import { useMountEffect } from "@/lib/use-mount-effect";

type InstallSnapshot = {
	events: InstallEvent[];
	status: InstallStatus;
	error: string | null;
};

type InstallConnectionState = "connecting" | "open" | "reconnecting" | "closed";

const initialSnapshot: InstallSnapshot = {
	events: [],
	status: "pending",
	error: null,
};

export function useInstallEventStream(serverId: string) {
	const [snapshot, setSnapshot] = useState(initialSnapshot);
	const [connectionState, setConnectionState] =
		useState<InstallConnectionState>("connecting");
	const [isRetrying, setIsRetrying] = useState(false);
	const [retryError, setRetryError] = useState<string | null>(null);
	const streamRef = useRef<EventSource | null>(null);
	const statusRef = useRef<InstallStatus>(initialSnapshot.status);
	const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
		null,
	);
	const reconnectAttemptRef = useRef(0);

	statusRef.current = snapshot.status;

	function clearReconnectTimeout() {
		if (reconnectTimeoutRef.current) {
			clearTimeout(reconnectTimeoutRef.current);
			reconnectTimeoutRef.current = null;
		}
	}

	function closeStream() {
		streamRef.current?.close();
		streamRef.current = null;
	}

	function scheduleReconnect() {
		if (reconnectTimeoutRef.current || isTerminalStatus(statusRef.current)) {
			return;
		}

		const delay = Math.min(1000 * 2 ** reconnectAttemptRef.current, 30_000);
		reconnectAttemptRef.current += 1;
		setConnectionState("reconnecting");

		reconnectTimeoutRef.current = setTimeout(() => {
			reconnectTimeoutRef.current = null;
			openStream();
		}, delay);
	}

	function openStream() {
		closeStream();
		setConnectionState("connecting");

		const stream = new EventSource(`/api/servers/${serverId}/install/events`);
		streamRef.current = stream;

		stream.addEventListener("install-progress", (messageEvent) => {
			const nextEvent = parseInstallEvent(messageEvent);
			if (!nextEvent) {
				return;
			}

			statusRef.current = nextEvent.status;
			reconnectAttemptRef.current = 0;
			clearReconnectTimeout();

			setConnectionState("open");
			setRetryError(null);
			setSnapshot((current) => mergeInstallSnapshot(current, nextEvent));

			if (isTerminalStatus(nextEvent.status)) {
				stream.close();
				if (streamRef.current === stream) {
					streamRef.current = null;
				}
				setConnectionState("closed");
			}
		});

		stream.onerror = () => {
			if (isTerminalStatus(statusRef.current)) {
				stream.close();
				if (streamRef.current === stream) {
					streamRef.current = null;
				}
				setConnectionState("closed");
				return;
			}

			stream.close();
			if (streamRef.current === stream) {
				streamRef.current = null;
			}
			scheduleReconnect();
		};
	}

	useMountEffect(() => {
		openStream();

		return () => {
			clearReconnectTimeout();
			closeStream();
		};
	});

	async function retryInstall() {
		setIsRetrying(true);
		setRetryError(null);
		setSnapshot(initialSnapshot);

		clearReconnectTimeout();
		closeStream();

		try {
			const response = await fetch(`/api/servers/${serverId}/install`, {
				method: "POST",
			});
			const payload = (await response.json().catch(() => null)) as {
				error?: string;
			} | null;

			if (!response.ok) {
				const message = payload?.error ?? "Unable to retry install.";
				setRetryError(message);
				setSnapshot({ events: [], status: "failed", error: message });
				setConnectionState("closed");
				return;
			}

			openStream();
		} finally {
			setIsRetrying(false);
		}
	}

	return {
		connectionState,
		isRetrying,
		retryError,
		retryInstall,
		snapshot,
	};
}

function parseInstallEvent(messageEvent: MessageEvent<string>) {
	try {
		return JSON.parse(messageEvent.data) as InstallEvent;
	} catch {
		return null;
	}
}

function isTerminalStatus(status: InstallStatus) {
	return status === "succeeded" || status === "failed";
}
