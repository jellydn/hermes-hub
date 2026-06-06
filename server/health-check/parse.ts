import type {
	HealthCheckGroup,
	HealthCheckItem,
	HealthCheckStatus,
	ServerHealthCheckResult,
} from "../../shared/contracts/server-health-check";
import { hermesGatewayPort } from "../constants";
import {
	getResourceHealthStatus,
	parsePercentValue,
} from "../dashboard/summaries";

export type HealthCheckCommandOutput = {
	uptime: string;
	cpu: string;
	memory: string;
	disk: string;
	dockerAvailable: string;
	dockerDaemon: string;
	hermesReachability: string;
	sshPasswordAuth: string;
	sshRootLogin: string;
	firewall: string;
	securityUpdates: string;
};

export type HealthCheckParseContext = {
	hermesRunning: boolean;
};

export function aggregateHealthCheckStatus(
	items: HealthCheckItem[],
): HealthCheckStatus {
	if (items.some((item) => item.status === "critical")) {
		return "critical";
	}

	if (items.some((item) => item.status === "warning")) {
		return "warning";
	}

	return "healthy";
}

export function buildHealthCheckResult(
	output: HealthCheckCommandOutput,
	checkedAt: string,
	context: HealthCheckParseContext,
): ServerHealthCheckResult {
	const groups = buildHealthCheckGroups(output, context);
	const items = groups.flatMap((group) => group.items);

	return {
		status: aggregateHealthCheckStatus(items),
		checkedAt,
		groups,
	};
}

export function buildHealthCheckGroups(
	output: HealthCheckCommandOutput,
	context: HealthCheckParseContext,
): HealthCheckGroup[] {
	const runtimeItems = [
		evaluateDockerAvailability(output.dockerAvailable),
		evaluateDockerDaemon(output.dockerDaemon),
		evaluateHermesContainer(context.hermesRunning),
	];

	if (context.hermesRunning) {
		runtimeItems.push(evaluateHermesReachability(output.hermesReachability));
	}

	return [
		{
			label: "System",
			items: [
				evaluateUptime(output.uptime),
				evaluateResourceItem("CPU usage", output.cpu),
				evaluateResourceItem("Memory usage", output.memory),
				evaluateResourceItem("Root disk usage", output.disk),
			],
		},
		{
			label: "Runtime",
			items: runtimeItems,
		},
		{
			label: "Security posture",
			items: [
				evaluateSshPasswordAuth(output.sshPasswordAuth),
				evaluateSshRootLogin(output.sshRootLogin),
				evaluateFirewall(output.firewall),
				evaluateSecurityUpdates(output.securityUpdates),
			],
		},
	];
}

function evaluateUptime(stdout: string): HealthCheckItem {
	const detail = stdout.trim();

	if (!detail) {
		return {
			label: "Uptime",
			status: "critical",
			detail: "Unable to read uptime.",
		};
	}

	return {
		label: "Uptime",
		status: "healthy",
		detail,
	};
}

function evaluateResourceItem(label: string, stdout: string): HealthCheckItem {
	const percent = parsePercentValue(stdout);

	if (percent === null) {
		return {
			label,
			status: "critical",
			detail: "Unable to read metric output.",
		};
	}

	return {
		label,
		status: getResourceHealthStatus(percent),
		detail: `${percent}% used`,
	};
}

function evaluateDockerAvailability(stdout: string): HealthCheckItem {
	const available = stdout.trim().toLowerCase() === "yes";

	return {
		label: "Docker availability",
		status: available ? "healthy" : "critical",
		detail: available
			? "Docker CLI is installed."
			: "Docker CLI is not installed on this VPS.",
	};
}

function evaluateDockerDaemon(stdout: string): HealthCheckItem {
	const responsive = stdout.trim().toLowerCase() === "yes";

	return {
		label: "Docker daemon",
		status: responsive ? "healthy" : "critical",
		detail: responsive
			? "Docker daemon is responding."
			: "Docker daemon is not responding.",
	};
}

function evaluateHermesContainer(running: boolean): HealthCheckItem {
	return {
		label: "Hermes container",
		status: running ? "healthy" : "critical",
		detail: running
			? "Hermes container is running."
			: "Hermes container is not running.",
	};
}

function evaluateHermesReachability(stdout: string): HealthCheckItem {
	const statusCode = stdout.trim();
	if (!/^\d{3}$/.test(statusCode) || statusCode === "000") {
		return {
			label: "Hermes reachability",
			status: "critical",
			detail: `Hermes gateway is not reachable on localhost:${hermesGatewayPort}.`,
		};
	}

	return {
		label: "Hermes reachability",
		status: "healthy",
		detail: `Hermes gateway responded with HTTP ${statusCode}.`,
	};
}

function evaluateSshPasswordAuth(stdout: string): HealthCheckItem {
	const value = stdout.trim().toLowerCase();

	if (!value) {
		return {
			label: "SSH password authentication",
			status: "warning",
			detail: "Could not determine the SSH password authentication setting.",
		};
	}

	if (value === "yes") {
		return {
			label: "SSH password authentication",
			status: "warning",
			detail: "Password authentication is enabled.",
		};
	}

	return {
		label: "SSH password authentication",
		status: "healthy",
		detail: "Password authentication is disabled.",
	};
}

function evaluateSshRootLogin(stdout: string): HealthCheckItem {
	const value = stdout.trim().toLowerCase();

	if (!value) {
		return {
			label: "SSH root login",
			status: "warning",
			detail: "Could not determine the SSH root login setting.",
		};
	}

	if (value === "yes") {
		return {
			label: "SSH root login",
			status: "warning",
			detail: "Root login is enabled with password authentication.",
		};
	}

	if (value === "without-password" || value === "prohibit-password") {
		return {
			label: "SSH root login",
			status: "healthy",
			detail: "Root login is allowed with SSH keys only.",
		};
	}

	if (value === "no" || value === "forced-commands-only") {
		return {
			label: "SSH root login",
			status: "healthy",
			detail: "Root login is disabled.",
		};
	}

	return {
		label: "SSH root login",
		status: "warning",
		detail: `Root login is set to ${value}.`,
	};
}

function evaluateFirewall(stdout: string): HealthCheckItem {
	const value = stdout.trim();

	if (!value || value.toLowerCase() === "unsupported") {
		return {
			label: "Firewall",
			status: "healthy",
			detail: "No supported firewall manager detected.",
		};
	}

	const normalized = value.toLowerCase();

	if (normalized.startsWith("status:")) {
		const state = normalized.slice("status:".length).trim();
		if (state === "active") {
			return {
				label: "Firewall",
				status: "healthy",
				detail: value,
			};
		}

		if (state === "inactive") {
			return {
				label: "Firewall",
				status: "warning",
				detail: value,
			};
		}
	}

	if (normalized === "running") {
		return {
			label: "Firewall",
			status: "healthy",
			detail: value,
		};
	}

	if (normalized === "not running") {
		return {
			label: "Firewall",
			status: "warning",
			detail: value,
		};
	}

	return {
		label: "Firewall",
		status: "warning",
		detail: value || "Firewall status is unknown.",
	};
}

function evaluateSecurityUpdates(stdout: string): HealthCheckItem {
	const value = stdout.trim().toLowerCase();

	if (value === "unsupported") {
		return {
			label: "Pending security updates",
			status: "healthy",
			detail: "Security update scan is not supported on this OS.",
		};
	}

	const pendingCount = Number.parseInt(value, 10);
	if (Number.isNaN(pendingCount)) {
		return {
			label: "Pending security updates",
			status: "warning",
			detail: "Unable to determine pending security updates.",
		};
	}

	if (pendingCount > 0) {
		return {
			label: "Pending security updates",
			status: "warning",
			detail: `${pendingCount} pending security update${pendingCount === 1 ? "" : "s"} found.`,
		};
	}

	return {
		label: "Pending security updates",
		status: "healthy",
		detail: "No pending security updates detected.",
	};
}
