import type {
	HealthCheckGroup,
	HealthCheckItem,
	HealthCheckItemStatus,
	HealthCheckStatus,
	ServerHealthCheckResult,
} from "../../shared/contracts/server-health-check";
import { parsePercentValue } from "../dashboard/summaries";

export type HealthCheckCommandOutput = {
	uptime: string;
	cpu: string;
	memory: string;
	disk: string;
	dockerAvailable: string;
	dockerDaemon: string;
	hermesContainer: string;
	hermesReachability: string;
	sshPasswordAuth: string;
	sshRootLogin: string;
	firewall: string;
	securityUpdates: string;
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
): ServerHealthCheckResult {
	const groups = buildHealthCheckGroups(output);
	const items = groups.flatMap((group) => group.items);

	return {
		status: aggregateHealthCheckStatus(items),
		checkedAt,
		groups,
	};
}

export function buildHealthCheckGroups(
	output: HealthCheckCommandOutput,
): HealthCheckGroup[] {
	const hermesRunning = isHermesContainerRunning(output.hermesContainer);

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
			items: [
				evaluateDockerAvailability(output.dockerAvailable),
				evaluateDockerDaemon(output.dockerDaemon),
				evaluateHermesContainer(output.hermesContainer),
				evaluateHermesReachability(output.hermesReachability, hermesRunning),
			],
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
		status: resourceStatus(percent),
		detail: `${percent}% used`,
	};
}

function resourceStatus(percent: number): HealthCheckItemStatus {
	if (percent >= 95) {
		return "critical";
	}

	if (percent >= 85) {
		return "warning";
	}

	return "healthy";
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

function isHermesContainerRunning(stdout: string) {
	return stdout.trim().includes("hermes");
}

function evaluateHermesContainer(stdout: string): HealthCheckItem {
	const running = isHermesContainerRunning(stdout);

	return {
		label: "Hermes container",
		status: running ? "healthy" : "critical",
		detail: running
			? "Hermes container is running."
			: "Hermes container is not running.",
	};
}

function evaluateHermesReachability(
	stdout: string,
	hermesRunning: boolean,
): HealthCheckItem {
	if (!hermesRunning) {
		return {
			label: "Hermes reachability",
			status: "warning",
			detail: "Skipped because the Hermes container is not running.",
		};
	}

	const statusCode = stdout.trim();
	if (!/^\d{3}$/.test(statusCode) || statusCode === "000") {
		return {
			label: "Hermes reachability",
			status: "critical",
			detail: "Hermes gateway is not reachable on localhost:8642.",
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

	if (
		value === "yes" ||
		value === "without-password" ||
		value === "prohibit-password"
	) {
		return {
			label: "SSH root login",
			status: "warning",
			detail: `Root login is set to ${value}.`,
		};
	}

	return {
		label: "SSH root login",
		status: "healthy",
		detail: "Root login is disabled.",
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

	if (normalized.includes("inactive") || normalized === "not running") {
		return {
			label: "Firewall",
			status: "warning",
			detail: value,
		};
	}

	if (normalized.includes("active") || normalized === "running") {
		return {
			label: "Firewall",
			status: "healthy",
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
			detail: `${pendingCount} pending update${pendingCount === 1 ? "" : "s"} found.`,
		};
	}

	return {
		label: "Pending security updates",
		status: "healthy",
		detail: "No pending security updates detected.",
	};
}
