export const hermesImageRepository = "nousresearch/hermes-agent";
export const hermesImageVersion = "latest";
export const defaultHermesImage = `${hermesImageRepository}:${hermesImageVersion}`;
export const hermesWebUiImage = "ghcr.io/nesquena/hermes-webui:latest";
export const defaultHermesWebUiPort = 8787;
/** Bind-mount root when deploys run `sudo docker compose` (see hermes-webui docker.md #3006). */
export const managedComposeVolumeHome = "/root";
