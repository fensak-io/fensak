// Copyright (c) Fensak, LLC.
// SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

import { config } from "../deps.ts";
import type { GitHubPushEvent } from "../deps.ts";

import { fensakCfgRepoName } from "../constants/mod.ts";
import { logger } from "../logging/mod.ts";
import { octokitFromInstallation } from "../ghauth/mod.ts";
import { loadConfigFromGitHub } from "../fskconfig/mod.ts";
import { mustGetGitHubOrgWithSubscription } from "../svcdata/mod.ts";

const enforceSubscriptionPlan = config.get(
  "activeSubscriptionPlanRequired",
);

/**
 * Route the specific push sub event to the relevant core business logic to process it.
 * Note that we only process the push event on the `.fensak` repo so that we can check and stage the code changes to the
 * config/rules before any rules happen, allowing the user to react to problems they might have in the active config.
 *
 * @return A boolean indicating whether the operation needs to be retried.
 */
export async function onPush(
  requestID: string,
  payload: GitHubPushEvent,
): Promise<boolean> {
  const repoName = payload.repository.name;
  if (repoName != fensakCfgRepoName) {
    logger.debug(
      `[${requestID}] Push event is not for '.fensak' repository. Discarding.`,
    );
    return false;
  }

  const defaultBranch = payload.repository.default_branch;
  const refName = payload.ref;
  if (refName != `refs/heads/${defaultBranch}`) {
    logger.debug(
      `[${requestID}] Push event is not for default branch of '.fensak' repository. Discarding.`,
    );
    return false;
  }

  return await handleDotFensakUpdate(
    requestID,
    payload.repository.owner.login,
  );
}

/**
 * Handles updates to the `.fensak` repository by loading the config.
 */
async function handleDotFensakUpdate(
  requestID: string,
  owner: string,
): Promise<boolean> {
  const ghorg = await mustGetGitHubOrgWithSubscription(owner);
  if (!ghorg.installationID) {
    // We fail loudly in this case because this is a bug in the system as it doesn't make sense that the installation
    // event wasn't handled by the time we start getting pull requests for an Org.
    throw new Error(
      `[${requestID}] No active installation on record for org ${owner} when handling push to '.fensak'.`,
    );
  }
  if (enforceSubscriptionPlan && !ghorg.subscription) {
    logger.warn(
      `[${requestID}] Ignoring pull request action for org ${owner} - no active subscription plan on record.`,
    );
    return false;
  }

  const octokit = octokitFromInstallation(ghorg.installationID);
  // loadConfigFromGitHub will store the config in the database so we don't need to do anything with the return result.
  const maybeCfg = await loadConfigFromGitHub(octokit, ghorg);

  // We request to retry on lock failure in case the config is being loaded from an older commit. loadConfigFromGitHub
  // only returns null on lock failure so we use that as the retry indicator.
  return maybeCfg == null;
}
