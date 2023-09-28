import { config } from "../deps.ts";
import type { GitHubInstallationEvent } from "../deps.ts";

import { deleteGitHubOrg, storeGitHubOrg } from "../svcdata/mod.ts";

const defaultOrgRepoLimit = config.get("defaultOrgRepoLimit");

/**
 * Route the specific github app management (aka installation) sub event to the relevant core business logic to process
 * it.
 */
export async function onAppMgmt(
  requestID: string,
  payload: GitHubInstallationEvent,
): Promise<void> {
  switch (payload.action) {
    default:
      console.debug(
        `[${requestID}] Discarding github installation event ${payload.action}`,
      );
      return;

    case "created":
      await orgInstalledApp(payload);
      console.log(
        `[${requestID}] Successfully stored record for ${payload.installation.account.login} in reaction to app install event.`,
      );
      return;

    case "deleted":
      await orgRemovedApp(payload);
      console.log(
        `[${requestID}] Successfully removed record for ${payload.installation.account.login} in reaction to app delete event.`,
      );
      return;
  }
}

async function orgInstalledApp(
  payload: GitHubInstallationEvent,
): Promise<void> {
  await storeGitHubOrg({
    name: payload.installation.account.login,
    installationID: payload.installation.id,
    repoLimit: defaultOrgRepoLimit,
  });
}

async function orgRemovedApp(payload: GitHubInstallationEvent): Promise<void> {
  await deleteGitHubOrg(payload.installation.account.login);
}
