export const hermesImageRepository = "nousresearch/hermes-agent";
const hermesImageDigest =
	"sha256:0df64d3f063ed22f9a0287d0f7a4c314ed9a504cbdefe55d6803b0d40761dcb9";
export const defaultHermesImage = `${hermesImageRepository}@${hermesImageDigest}`;
/** Docker Hub API base for the Hermes agent image (default registry, no `docker.io/` prefix). */
export const hermesDockerHubRepo = "nousresearch/hermes-agent";
/** Upstream GitHub repository that publishes Hermes agent releases + changelogs. */
export const hermesGitHubRepo = "NousResearch/hermes-agent";
const hermesWebUiImageRepository = "ghcr.io/nesquena/hermes-webui";
const hermesWebUiImageDigest =
	"sha256:b5cb5a62eaa8b3b3abe501d934345c3ae8c022f0cefaf608fd34c2ff44160ae6";
export const hermesWebUiImage = `${hermesWebUiImageRepository}@${hermesWebUiImageDigest}`;
export const hermesContainerName = "hermes";
export const hermesGatewayPort = 8642;
/** Agent source path inside the Hermes gateway container. */
export const hermesAgentSourcePathInContainer = "/opt/hermes";
export const defaultHermesWebUiPort = 8787;
/** Runtime user inside the pinned hermes-webui image. */
export const hermesWebUiContainerUid = 10000;
export const hermesWebUiContainerGid = 10000;
/** State directory path inside the hermes-webui container. */
export const hermesWebUiStateDir = "/home/hermeswebui/.hermes/webui";
/** Mounted Hermes Agent source path inside the hermes-webui container. */
export const hermesWebUiAgentDir = "/home/hermeswebui/.hermes/hermes-agent";
export const hermesWebUiDefaultWorkspace = "/workspace";
/** Trust X-Forwarded-Host/Proto from HermesHub's authenticated reverse proxy. */
export const hermesWebUiTrustForwardedHost = "1";
export const hermesWebUiTrustForwardedProto = "1";
/** Bind-mount root when deploys run `sudo docker compose` (see hermes-webui docker.md #3006). */
export const managedComposeVolumeHome = "/root";
/** Host path for the copied Hermes Agent source mounted into hermes-webui. */
export const hermesWebUiAgentHostDir = `${managedComposeVolumeHome}/.hermes/hermes-agent`;
