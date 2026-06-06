import { hermesGatewayPort } from "../constants";
import { SERVER_METRIC_COMMANDS } from "../ssh/metrics-commands";

export const HEALTH_CHECK_COMMANDS = {
	...SERVER_METRIC_COMMANDS,
	dockerAvailable: "command -v docker >/dev/null 2>&1 && echo yes || echo no",
	dockerDaemon: "sudo docker info >/dev/null 2>&1 && echo yes || echo no",
	dockerCompose:
		"sudo docker compose version >/dev/null 2>&1 && echo yes || echo no",
	hermesWorkspace: "test -d ~/hermes && echo yes || echo no",
	hermesComposeFile:
		"test -f ~/hermes/docker-compose.yml && echo yes || echo no",
	hermesReachability: `curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://127.0.0.1:${hermesGatewayPort}/v1/models 2>/dev/null || echo 000`,
} as const;
