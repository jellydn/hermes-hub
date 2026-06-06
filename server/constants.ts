export const hermesImageRepository = "nousresearch/hermes-agent";
export const hermesImageDigest =
	"sha256:e07bc53f12aeda54c766b3dde031a33bc21c14479b93542d984e66b9a8e2009b";
export const defaultHermesImage = `${hermesImageRepository}@${hermesImageDigest}`;
export const hermesWebUiImageRepository = "ghcr.io/nesquena/hermes-webui";
export const hermesWebUiImageDigest =
	"sha256:cd9269a5e59ce400e8917c854b92a60cd1f34a71a1ca2858f31c168917d2a6e5";
export const hermesWebUiImage = `${hermesWebUiImageRepository}@${hermesWebUiImageDigest}`;
export const defaultHermesWebUiPort = 8787;
/** Bind-mount root when deploys run `sudo docker compose` (see hermes-webui docker.md #3006). */
export const managedComposeVolumeHome = "/root";
