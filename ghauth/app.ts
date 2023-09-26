import { base64, config, Octokit, octokitCreateAppAuth } from "../deps.ts";

const privateKeyBytes = base64.decode(config.get("github.app.privateKey"));
const privateKey = new TextDecoder().decode(privateKeyBytes);
const authCfg = {
  appId: config.get("github.app.appID"),
  privateKey: privateKey,
};

/**
 * Create a new Octokit rest client that is authenticated as the installation identified by the given ID for the
 * configured Fensak GitHub App.
 */
export function octokitFromInstallation(
  installationId: number,
): Octokit {
  const authCfgCopy = {
    installationId,
    ...authCfg,
  };
  return new Octokit({
    authStrategy: octokitCreateAppAuth,
    auth: authCfgCopy,
  });
}
