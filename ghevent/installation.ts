// Copyright (c) Fensak, LLC.
// SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

import { config } from "../deps.ts";
import type { GitHubInstallationEvent } from "../deps.ts";

import {
  deleteGitHubOrg,
  getGitHubOrgRecord,
  GitHubOrg,
  storeGitHubOrg,
} from "../svcdata/mod.ts";

const defaultOrgRepoLimit = config.get("defaultOrgRepoLimit");

/**
 * Route the specific github app management (aka installation) sub event to the relevant core business logic to process
 * it.
 *
 * @return A boolean indicating whether the operation needs to be retried.
 */
export async function onAppMgmt(
  requestID: string,
  payload: GitHubInstallationEvent,
): Promise<boolean> {
  let retry = false;
  switch (payload.action) {
    default:
      console.debug(
        `[${requestID}] Discarding github installation event ${payload.action}`,
      );
      break;

    case "created":
      retry = await orgInstalledApp(requestID, payload);
      if (!retry) {
        console.log(
          `[${requestID}] Successfully stored record for ${payload.installation.account.login} in reaction to app install event.`,
        );
      }
      break;

    case "deleted":
      await orgRemovedApp(payload);
      console.log(
        `[${requestID}] Successfully removed record for ${payload.installation.account.login} in reaction to app delete event.`,
      );
      break;
  }
  return retry;
}

/**
 * On install, create a record to hold the installation ID. This routine makes sure that if there is already a record of
 * the org in the system (due to handling of the marketplace event), it preserves the recorded marketplace plan of the
 * user.
 *
 * @return A boolean indicating whether the operation needs to be retried.
 */
async function orgInstalledApp(
  requestID: string,
  payload: GitHubInstallationEvent,
): Promise<boolean> {
  const newOrg: GitHubOrg = {
    name: payload.installation.account.login,
    installationID: payload.installation.id,
    repoLimit: defaultOrgRepoLimit,
    marketplacePlan: null,
  };

  const maybeOrg = await getGitHubOrgRecord(payload.installation.account.login);
  if (maybeOrg.value) {
    newOrg.marketplacePlan = maybeOrg.value.marketplacePlan;
  }

  const ok = await storeGitHubOrg(newOrg, maybeOrg);
  if (!ok) {
    console.warn(
      `[${requestID}] Could not store installation for ${newOrg.name}: conflicting record. Retrying.`,
    );
    return true;
  }
  return false;
}

async function orgRemovedApp(payload: GitHubInstallationEvent): Promise<void> {
  await deleteGitHubOrg(payload.installation.account.login);
}
