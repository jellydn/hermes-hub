import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";

import { getAuthSession } from "#server/auth";
import { getCurrentTelegramConfig } from "#server/telegram";

export type TelegramDeployInfo = {
	deployedServerHost: string;
};

export const loadTelegramDeploy = createServerFn({ method: "GET" }).handler(
	async () => {
		const session = await getAuthSession(getRequestHeaders());
		if (!session) {
			return null;
		}

		const telegramConfig = await getCurrentTelegramConfig(session.user.id);
		if (!telegramConfig?.deployedServerHost) {
			return null;
		}

		return {
			deployedServerHost: telegramConfig.deployedServerHost,
		} satisfies TelegramDeployInfo;
	},
);
