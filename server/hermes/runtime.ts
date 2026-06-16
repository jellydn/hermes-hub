// Barrel: re-exports from the runtime/ modules.
// Split from a 398-line file into focused modules by concern (June 2026).

export {
	buildWebUiAgentSourceSyncCommand,
	syncAgentSourceForWebUi,
} from "./runtime/agent-sync";
export {
	assertValidComposeServiceNames,
	buildComposeUpCommand,
	composePull,
	composeUp,
	composeUpAll,
	writeComposeFile,
} from "./runtime/compose";
export {
	hermesContainerName,
	isContainerRunning,
	isWebUiContainerRunning,
	readContainerDiagnostics,
	readWebUiContainerDiagnostics,
	WEB_UI_CONTAINER,
} from "./runtime/container-status";

export {
	isValidDockerTag,
	restartGateway,
	rollbackGateway,
	setProviderInferenceProvider,
	setProviderModel,
	updateGateway,
} from "./runtime/gateway-lifecycle";

export { runPairingCommand } from "./runtime/pairing";
export { assertWebUiReachable } from "./runtime/webui-reachable";
