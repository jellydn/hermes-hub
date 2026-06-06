export const SERVER_METRIC_COMMANDS = {
	uptime: "uptime -p 2>/dev/null || uptime",
	cpu: 'LANG=C top -bn1 | awk \'/^%Cpu|^Cpu/ {for (i=1; i<=NF; i++) gsub(/[^0-9.]/, "", $i); printf "%.0f", $2 + $4; exit}\'',
	memory: "free | awk '/Mem:/ {printf \"%.0f\", ($3/$2)*100}'",
	disk: 'df -P / | awk \'NR==2 {gsub("%", "", $5); printf "%s", $5}\'',
} as const;
