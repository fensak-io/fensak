// Copyright (c) Fensak, LLC.
// SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

import { logger } from "../logging/mod.ts";
import { fensakCfgRepoName } from "../constants/mod.ts";
import type { BitBucketEventPayload } from "../svcdata/mod.ts";

import { appInstalled, appUninstalled } from "./installation.ts";
import { onPush } from "./push.ts";
import { onPullRequest } from "./pullrequest.ts";

/**
 * Handles the given BitBucket event.
 *
 * @return A boolean indicating whether the operation needs to be retried.
 */
export async function handleBitBucketEvent(
  msg: BitBucketEventPayload,
): Promise<boolean> {
  logger.info(`[${msg.requestID}] Processing bitbucket ${msg.eventName} event`);

  let retry = false;
  switch (msg.eventName) {
    default:
      logger.debug(
        `[${msg.requestID}] Discarding bitbucket event ${msg.eventName}`,
      );
      return false;

    case "installed":
      retry = await appInstalled(msg.requestID, msg.payload);
      break;

    case "uninstalled":
      retry = await appUninstalled(msg.requestID, msg.payload);
      break;

    case "repo:push":
      retry = await onPush(msg.requestID, msg.payload);
      break;

    case "pullrequest:approved":
    case "pullrequest:unapproved":
    case "pullrequest:rejected":
    case "pullrequest:changes_request_created":
    case "pullrequest:created":
      retry = await onPullRequest(msg.requestID, msg.payload);
      break;
  }

  logger.info(`[${msg.requestID}] Processed bitbucket ${msg.eventName} event`);
  return retry;
}

/**
 * Filter out events that can be filtered just by looking at the webhook data. This is useful for rejecting events at
 * the web request layer before enqueuing in the work queue, to save on request units for the underlying queue system.
 *
 * @return A boolean indicating whether the event should be rejected (true for reject, false for keep).
 */
export function fastRejectEvent(
  eventName: string,
  // deno-lint-ignore no-explicit-any
  payload: any,
): boolean {
  switch (eventName) {
    case "repo:push": {
      // Reject if not a push event to a branch of the .fensak repository.
      const repoName = payload.repository.name;
      if (repoName != fensakCfgRepoName) {
        return true;
      }
      // If any change in pushed through this event has a branch update, then accept the event.
      for (const ch of payload.push.changes) {
        if (ch.new && ch.new.type === "branch") {
          return false;
        }
      }
      // Reaching here means none of the changes pertain to updating a branch, so reject.
      return true;
    }
  }

  // At this point, event hasn't been rejected, so allow it.
  return false;
}
