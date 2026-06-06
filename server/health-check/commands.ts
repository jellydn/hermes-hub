import { hermesGatewayPort } from "../constants";
import { SERVER_METRIC_COMMANDS } from "../ssh/metrics-commands";

export const HEALTH_CHECK_COMMANDS = {
	...SERVER_METRIC_COMMANDS,
	dockerAvailable: "command -v docker >/dev/null 2>&1 && echo yes || echo no",
	dockerDaemon: "sudo docker info >/dev/null 2>&1 && echo yes || echo no",
	hermesReachability: `curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://127.0.0.1:${hermesGatewayPort}/v1/models 2>/dev/null || echo 000`,
	sshPasswordAuth:
		"sudo $(command -v sshd || echo /usr/sbin/sshd) -T 2>/dev/null | awk '/^passwordauthentication / {print $2; exit}'",
	sshRootLogin:
		"sudo $(command -v sshd || echo /usr/sbin/sshd) -T 2>/dev/null | awk '/^permitrootlogin / {print $2; exit}'",
	firewall:
		"if command -v ufw >/dev/null 2>&1; then sudo ufw status 2>/dev/null | head -1; elif command -v firewall-cmd >/dev/null 2>&1; then sudo firewall-cmd --state 2>/dev/null; else echo unsupported; fi",
	securityUpdates:
		"if command -v apt-get >/dev/null 2>&1; then apt-get -s upgrade 2>/dev/null | awk '/^Inst/ && /[Ss]ecurity/ {count++} END {print count+0}'; elif command -v dnf >/dev/null 2>&1; then dnf updateinfo list security --available 2>/dev/null | grep -cE '^[A-Z]' || echo 0; else echo unsupported; fi",
} as const;
