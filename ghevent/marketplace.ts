// Copyright (c) Fensak, LLC.
// SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

import { config } from "../deps.ts";
import type { GitHubMarketplacePurchaseEvent } from "../deps.ts";

import { logger } from "../logging/mod.ts";
import {
  getGitHubOrgRecord,
  GitHubOrg,
  storeGitHubOrg,
} from "../svcdata/mod.ts";

const defaultOrgRepoLimit = config.get("defaultOrgRepoLimit");
const allowedOrgs: string[] | null = config.get("github.allowedOrgs");

/**
 * Route the specific github marketplace sub event to the relevant core business logic to process it.
 *
 * @return A boolean indicating whether the operation needs to be retried.
 */
export async function onMarketplacePurchase(
  requestID: string,
  payload: GitHubMarketplacePurchaseEvent,
): Promise<boolean> {
  const owner = payload.marketplace_purchase.account.login;
  let retry = false;
  switch (payload.action) {
    default:
      logger.debug(
        `[${requestID}] Discarding github marketplace event ${payload.action}`,
      );
      break;

    case "purchased":
      retry = await orgPurchasedApp(requestID, payload);
      if (!retry) {
        logger.info(
          `[${requestID}] Successfully stored record for ${owner} in reaction to app install event.`,
        );
      }
      break;

    case "cancelled":
      retry = await orgCancelledApp(requestID, payload);
      if (!retry) {
        logger.info(
          `[${requestID}] Successfully removed record for ${owner} in reaction to app delete event.`,
        );
      }
      break;
  }
  return retry;
}

/**
 * On purchase, update or create a record to hold the marketplace plan. This routine makes sure that if there is already
 * a record of the org in the system (due to handling of the installation event), it preserves the installation ID.
 *
 * @return A boolean indicating whether the operation needs to be retried.
 */
async function orgPurchasedApp(
  requestID: string,
  payload: GitHubMarketplacePurchaseEvent,
): Promise<boolean> {
  const owner = payload.marketplace_purchase.account.login;
  if (
    allowedOrgs != null && !allowedOrgs.includes(owner)
  ) {
    logger.warn(
      `[${requestID}] ${owner} installed the Fensak App, but is not an allowed Org on this instance of Fensak.`,
    );
    return false;
  }

  const newOrg: GitHubOrg = {
    name: owner,
    installationID: null,
    repoLimit: defaultOrgRepoLimit,
    marketplacePlan: payload.marketplace_purchase.plan.name,
  };

  const maybeOrg = await getGitHubOrgRecord(owner);
  if (maybeOrg.value) {
    newOrg.installationID = maybeOrg.value.installationID;
    newOrg.repoLimit = maybeOrg.value.repoLimit;
  }

  const ok = await storeGitHubOrg(newOrg, maybeOrg);
  if (!ok) {
    logger.warn(
      `[${requestID}] Could not store marketplace plan for ${owner}: conflicting record. Retrying.`,
    );
    return true;
  }
  return false;
}

/**
 * On cancel, remove the marketplace plan from the internal record so that downstream logic can enforce marketplace
 * requirements.
 *
 * @return A boolean indicating whether the operation needs to be retried.
 */
async function orgCancelledApp(
  requestID: string,
  payload: GitHubMarketplacePurchaseEvent,
): Promise<boolean> {
  const owner = payload.marketplace_purchase.account.login;
  const maybeOrg = await getGitHubOrgRecord(owner);
  if (!maybeOrg.value) {
    // Already uninstalled app, so no action required
    return false;
  }

  // Org still has app installed, so remove the marketplace plan from the internal record.
  const updateOrg = { ...maybeOrg.value };
  updateOrg.marketplacePlan = null;
  const ok = await storeGitHubOrg(updateOrg, maybeOrg);
  if (!ok) {
    logger.warn(
      `[${requestID}] Could not remove marketplace plan for ${owner}: conflicting record. Retrying.`,
    );
    return true;
  }
  return false;
}
