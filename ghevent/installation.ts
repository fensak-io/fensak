// Copyright (c) Fensak, LLC.
// SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

import { config } from "../deps.ts";
import type { GitHubInstallationEvent } from "../deps.ts";

import { logger } from "../logging/mod.ts";
import {
  deleteGitHubOrg,
  getGitHubOrgRecord,
  getSubscription,
  GitHubOrg,
  removeInstallationForGitHubOrg,
  storeGitHubOrg,
} from "../svcdata/mod.ts";

const allowedOrgs: string[] | null = config.get("github.allowedOrgs");

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
      logger.debug(
        `[${requestID}] Discarding github installation event ${payload.action}`,
      );
      break;

    case "created":
      retry = await orgInstalledApp(requestID, payload);
      if (!retry) {
        logger.info(
          `[${requestID}] Successfully stored record for ${payload.installation.account.login} in reaction to app install event.`,
        );
      }
      break;

    case "deleted":
      await orgRemovedApp(payload);
      logger.info(
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
  const orgName = payload.installation.account.login;
  if (
    allowedOrgs != null && !allowedOrgs.includes(orgName)
  ) {
    logger.warn(
      `[${requestID}] ${orgName} purchased the Fensak App on the marketplace, but is not an allowed Org on this instance of Fensak.`,
    );
    return false;
  }

  const newOrg: GitHubOrg = {
    name: orgName,
    installationID: payload.installation.id,
    subscriptionID: null,
  };

  const maybeOrg = await getGitHubOrgRecord(orgName);
  if (maybeOrg.value) {
    newOrg.subscriptionID = maybeOrg.value.subscriptionID;
  }

  const ok = await storeGitHubOrg(newOrg, maybeOrg);
  if (!ok) {
    logger.warn(
      `[${requestID}] Could not store installation for ${newOrg.name}: conflicting record. Retrying.`,
    );
    return true;
  }
  return false;
}

async function orgRemovedApp(payload: GitHubInstallationEvent): Promise<void> {
  const orgName = payload.installation.account.login;
  const maybeOrg = await getGitHubOrgRecord(orgName);
  if (!maybeOrg.value) {
    return;
  }

  if (!maybeOrg.value.subscriptionID) {
    // No subscription associated, so safe to delete.
    await deleteGitHubOrg(orgName, maybeOrg);
    return;
  }

  const maybeSubscription = await getSubscription(
    maybeOrg.value.subscriptionID,
  );
  if (!maybeSubscription.value) {
    // Had a subscription associated, but is no longer active so safe to delete.
    await deleteGitHubOrg(orgName, maybeOrg);
    return;
  }

  // At this point, this org has an active subscription associated with it, so we can't delete it.
  // Instead, we need to remove the installationID and the associated config data.
  await removeInstallationForGitHubOrg(maybeOrg);
}
