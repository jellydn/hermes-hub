import { hermesContainerName } from "../constants";

export const HEALTH_CHECK_COMMANDS = {
	uptime: "uptime -p 2>/dev/null || uptime",
	cpu: 'LANG=C top -bn1 | awk \'/^%Cpu|^Cpu/ {for (i=1; i<=NF; i++) gsub(/[^0-9.]/, "", $i); printf "%.0f", $2 + $4; exit}\'',
	memory: "free | awk '/Mem:/ {printf \"%.0f\", ($3/$2)*100}'",
	disk: 'df -P / | awk \'NR==2 {gsub("%", "", $5); printf "%s", $5}\'',
	dockerAvailable: "command -v docker >/dev/null 2>&1 && echo yes || echo no",
	dockerDaemon: "sudo docker info >/dev/null 2>&1 && echo yes || echo no",
	hermesContainer: `sudo docker ps --filter name=^/${hermesContainerName}$ --filter status=running --format '{{.Names}}'`,
	hermesReachability:
		'curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://127.0.0.1:8642/v1/models 2>/dev/null || echo 000',
	sshPasswordAuth:
		"sshd -T 2>/dev/null | awk '/^passwordauthentication / {print $2; exit}'",
	sshRootLogin:
		"sshd -T 2>/dev/null | awk '/^permitrootlogin / {print $2; exit}'",
	firewall:
		"if command -v ufw >/dev/null 2>&1; then ufw status 2>/dev/null | head -1; elif command -v firewall-cmd >/dev/null 2>&1; then firewall-cmd --state 2>/dev/null; else echo unsupported; fi",
	securityUpdates:
		"if command -v apt-get >/dev/null 2>&1; then apt-get -s upgrade 2>/dev/null | grep -c ^Inst || echo 0; elif command -v dnf >/dev/null 2>&1; then dnf updateinfo list security --available 2>/dev/null | grep -cE '^[A-Z]' || echo 0; else echo unsupported; fi",
} as const;
