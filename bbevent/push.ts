// Copyright (c) Fensak, LLC.
// SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

import { config } from "../deps.ts";

import { fensakCfgRepoName } from "../constants/mod.ts";
import { logger } from "../logging/mod.ts";
import { bitbucketFromWorkspace, getDefaultBranch } from "../bbstd/mod.ts";
//import { reportNoSubscriptionToUser } from "../ghstd/mod.ts";
import { loadConfigFromBitBucket } from "../fskconfig/mod.ts";
import { mustGetBitBucketWorkspaceWithSubscription } from "../svcdata/mod.ts";

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
  // deno-lint-ignore no-explicit-any
  payload: any,
): Promise<boolean> {
  const repoName = payload.repository.name;
  if (repoName != fensakCfgRepoName) {
    logger.debug(
      `[${requestID}] BitBucket push event is not for '.fensak' repository (was for ${repoName}). Discarding.`,
    );
    return false;
  }

  const wsName = payload.repository.workspace.slug;
  const ws = await mustGetBitBucketWorkspaceWithSubscription(wsName);
  if (!ws.securityContext) {
    // We fail loudly in this case because this is a bug in the system as it doesn't make sense that the installation
    // event wasn't handled by the time we start getting push for a Workspace.
    throw new Error(
      `[${requestID}] No active security context on record for BitBucket workspace ${wsName} when handling push to '.fensak'.`,
    );
  }

  const clt = bitbucketFromWorkspace(ws);
  const defaultBranch = await getDefaultBranch(clt, wsName, repoName);

  // deno-lint-ignore no-explicit-any
  let defaultBranchUpdate: any = null;
  for (const ch of payload.push.changes) {
    if (ch.new && ch.new.name === defaultBranch) {
      defaultBranchUpdate = ch;
      break;
    }
  }
  if (defaultBranchUpdate === null) {
    logger.debug(
      `[${requestID}] BitBucket push event is not for default branch of '.fensak' repository. Discarding.`,
    );
    return false;
  }

  if (enforceSubscriptionPlan && !ws.subscription) {
    logger.warn(
      `[${requestID}] Ignoring push to '.fensak' for BitBucket Workspace ${wsName} - no active subscription plan on record.`,
    );
    // TODO
    // await reportNoSubscriptionToUser(octokit, owner, eventSHA);
    return false;
  }

  // loadConfigFromBitBucket will store the config in the database so we don't need to do anything with the return
  // result.
  const maybeCfg = await loadConfigFromBitBucket(clt, ws);

  // We request to retry on lock failure in case the config is being loaded from an older commit.
  // loadConfigFromBitBucket only returns null on lock failure so we use that as the retry indicator.
  return maybeCfg == null;
}
