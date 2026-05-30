export function buildGhcrLoginCommand(): string {
	const username = process.env.GHCR_USERNAME;
	const token = process.env.GHCR_TOKEN;
	if (!username || !token) {
		return "";
	}
	return `printf '%s' '${token}' | sudo docker login ghcr.io -u '${username}' --password-stdin`;
}

export function prependGhcrLogin(command: string): string {
	const login = buildGhcrLoginCommand();
	if (!login) {
		return command;
	}
	return `${login} && ${command}`;
}
