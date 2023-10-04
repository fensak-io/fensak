// Copyright (c) Fensak, LLC.
// SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

import {
  GitHubInstallationEvent,
  GitHubMarketplacePurchaseEvent,
  GitHubPullRequestEvent,
  GitHubPullRequestReviewEvent,
} from "../deps.ts";

import { logger } from "../logging/mod.ts";
import type { GitHubEventPayload } from "../svcdata/mod.ts";

import { onPullRequest } from "./pullrequest.ts";
import { onAppMgmt } from "./installation.ts";
import { onMarketplacePurchase } from "./marketplace.ts";

/**
 * Handles the given GitHub event.
 *
 * @return A boolean indicating whether the operation needs to be retried.
 */
export async function handleGitHubEvent(
  msg: GitHubEventPayload,
): Promise<boolean> {
  logger.info(`[${msg.requestID}] Processing ${msg.eventName} event`);

  let retry = false;
  switch (msg.eventName) {
    default:
      logger.debug(
        `[${msg.requestID}] Discarding github event ${msg.eventName}`,
      );
      return false;

    case "installation":
      retry = await onAppMgmt(
        msg.requestID,
        msg.payload as GitHubInstallationEvent,
      );
      break;

    case "marketplace_purchase":
      retry = await onMarketplacePurchase(
        msg.requestID,
        msg.payload as GitHubMarketplacePurchaseEvent,
      );
      break;

    case "pull_request":
      retry = await onPullRequest(
        msg.requestID,
        msg.payload as GitHubPullRequestEvent,
      );
      break;

    case "pull_request_review":
      retry = await onPullRequest(
        msg.requestID,
        msg.payload as GitHubPullRequestReviewEvent,
      );
      break;
  }

  logger.info(`[${msg.requestID}] Processed ${msg.eventName} event`);
  return retry;
}
