import { useState } from "react";

import { TelegramConnectSection } from "./telegram-connect-section";
import { TelegramDeploySection } from "./telegram-deploy-section";
import { TelegramPairingSection } from "./telegram-pairing-section";
import { TelegramSidebar } from "./telegram-sidebar";
import { TelegramTestSection } from "./telegram-test-section";

export type TelegramSettingsSummary = {
	botUsername: string;
	botTokenLast4: string | null;
	isActive: boolean;
	deployedServerHost: string | null;
};

type TelegramSettingsProps = {
	initialConfig: TelegramSettingsSummary | null;
};

export function TelegramSettings({ initialConfig }: TelegramSettingsProps) {
	const [savedConfig, setSavedConfig] =
		useState<TelegramSettingsSummary | null>(initialConfig);

	function handleTelegramConnected(config: TelegramSettingsSummary) {
		setSavedConfig(config);
	}

	function handleTelegramDisconnected() {
		setSavedConfig(null);
	}

	function handleConfigUpdate(config: TelegramSettingsSummary) {
		setSavedConfig(config);
	}

	const isDeployed = Boolean(savedConfig?.deployedServerHost);

	return (
		<section className="space-y-6">
			<div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
				<div className="space-y-6">
					<TelegramConnectSection
						savedConfig={savedConfig}
						onConfigChange={handleTelegramConnected}
						onDisconnect={handleTelegramDisconnected}
					/>

					{savedConfig ? (
						<>
							<TelegramDeploySection
								savedConfig={savedConfig}
								onConfigChange={handleConfigUpdate}
							/>

							<TelegramPairingSection
								key={savedConfig.deployedServerHost ?? "not-deployed"}
								isDeployed={isDeployed}
							/>

							<TelegramTestSection isDeployed={isDeployed} />
						</>
					) : null}
				</div>

				<TelegramSidebar savedConfig={savedConfig} />
			</div>
		</section>
	);
}
