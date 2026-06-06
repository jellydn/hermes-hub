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
	dockerCompose: string;
	hermesWorkspace: string;
	hermesComposeFile: string;
	hermesReachability: string;
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
	const setupItems = [
		evaluateDockerInstalled(output.dockerAvailable),
		evaluateDockerRunning(output.dockerDaemon),
		evaluateDockerCompose(output.dockerCompose),
		evaluateHermesWorkspace(output.hermesWorkspace),
		evaluateHermesComposeFile(output.hermesComposeFile),
		evaluateHermesContainer(context.hermesRunning),
	];

	if (context.hermesRunning) {
		setupItems.push(evaluateHermesReachability(output.hermesReachability));
	}

	return [
		{
			label: "Server resources",
			items: [
				evaluateUptime(output.uptime),
				evaluateResourceItem("CPU", output.cpu),
				evaluateResourceItem("Memory", output.memory),
				evaluateResourceItem("Disk space", output.disk),
			],
		},
		{
			label: "Hermes setup",
			items: setupItems,
		},
	];
}

function evaluateUptime(stdout: string): HealthCheckItem {
	const detail = stdout.trim();

	if (!detail) {
		return {
			label: "Server uptime",
			status: "critical",
			detail: "Could not read how long this server has been running.",
		};
	}

	return {
		label: "Server uptime",
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
			detail: "Could not read this resource. The check may have timed out.",
		};
	}

	const status = getResourceHealthStatus(percent);

	return {
		label,
		status,
		detail: resourceDetail(label, percent, status),
	};
}

function resourceDetail(
	label: string,
	percent: number,
	status: HealthCheckStatus,
) {
	if (status === "healthy") {
		return `${percent}% in use. This server has enough ${label.toLowerCase()} for Hermes right now.`;
	}

	if (status === "warning") {
		return `${percent}% in use. Hermes may run slower until ${label.toLowerCase()} usage comes down.`;
	}

	return `${percent}% in use. Free up ${label.toLowerCase()} or upgrade the VPS before relying on Hermes here.`;
}

function evaluateDockerInstalled(stdout: string): HealthCheckItem {
	const installed = stdout.trim().toLowerCase() === "yes";

	return {
		label: "Docker installed",
		status: installed ? "healthy" : "critical",
		detail: installed
			? "Docker is installed on this VPS."
			: "Docker is missing. Use Install Hermes on this page to set up the server.",
	};
}

function evaluateDockerRunning(stdout: string): HealthCheckItem {
	const running = stdout.trim().toLowerCase() === "yes";

	return {
		label: "Docker running",
		status: running ? "healthy" : "critical",
		detail: running
			? "Docker is running and ready for Hermes containers."
			: "Docker is installed but not responding. Restart Docker on the VPS or retry the Hermes install.",
	};
}

function evaluateDockerCompose(stdout: string): HealthCheckItem {
	const available = stdout.trim().toLowerCase() === "yes";

	return {
		label: "Docker Compose ready",
		status: available ? "healthy" : "critical",
		detail: available
			? "Docker Compose is available for managing Hermes."
			: "Docker Compose is missing. Re-run Install Hermes to finish the VPS setup.",
	};
}

function evaluateHermesWorkspace(stdout: string): HealthCheckItem {
	const present = stdout.trim().toLowerCase() === "yes";

	return {
		label: "Hermes folder",
		status: present ? "healthy" : "critical",
		detail: present
			? "The ~/hermes workspace folder is present."
			: "The Hermes workspace folder is missing. Start or retry Install Hermes.",
	};
}

function evaluateHermesComposeFile(stdout: string): HealthCheckItem {
	const present = stdout.trim().toLowerCase() === "yes";

	return {
		label: "Hermes configuration",
		status: present ? "healthy" : "critical",
		detail: present
			? "docker-compose.yml is present in ~/hermes."
			: "The Hermes configuration file is missing. Start or retry Install Hermes.",
	};
}

function evaluateHermesContainer(running: boolean): HealthCheckItem {
	return {
		label: "Hermes agent running",
		status: running ? "healthy" : "critical",
		detail: running
			? "The Hermes agent container is running on this VPS."
			: "The Hermes agent is not running. Use Restart Hermes above or retry the install.",
	};
}

function evaluateHermesReachability(stdout: string): HealthCheckItem {
	const statusCode = stdout.trim();
	if (!/^\d{3}$/.test(statusCode) || statusCode === "000") {
		return {
			label: "Hermes agent responding",
			status: "critical",
			detail: `The Hermes agent did not answer on this server (port ${hermesGatewayPort}). Try Restart Hermes.`,
		};
	}

	return {
		label: "Hermes agent responding",
		status: "healthy",
		detail: "The Hermes agent is responding on this VPS.",
	};
}
