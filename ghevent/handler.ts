// Copyright (c) Fensak, LLC.
// SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

import {
  GitHubInstallationEvent,
  GitHubPullRequestEvent,
  GitHubPullRequestReviewEvent,
  GitHubPushEvent,
  GitHubWebhookEvent,
  GitHubWebhookEventName,
} from "../deps.ts";

import { fensakCfgRepoName } from "../constants/mod.ts";
import { logger } from "../logging/mod.ts";
import type { GitHubEventPayload } from "../svcdata/mod.ts";

import { onPullRequest } from "./pullrequest.ts";
import { onAppMgmt } from "./installation.ts";
import { onPush } from "./push.ts";

const allowedEvents = [
  "installation",
  "pull_request",
  "pull_request_review",
  "push",
];
const allowedInstallationEvents = [
  "created",
  "deleted",
];
const allowedPullRequestEvents = [
  "opened",
  "synchronize",
  "submitted",
  "edited",
  "dismissed",
];

/**
 * Handles the given GitHub event.
 *
 * @return A boolean indicating whether the operation needs to be retried.
 */
export async function handleGitHubEvent(
  msg: GitHubEventPayload,
): Promise<boolean> {
  logger.info(`[${msg.requestID}] Processing github ${msg.eventName} event`);

  // IMPORTANT
  // If you add a new case condition here, add it to allowedEvents!
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

    case "push":
      retry = await onPush(
        msg.requestID,
        msg.payload as GitHubPushEvent,
      );
      break;
  }

  logger.info(`[${msg.requestID}] Processed github ${msg.eventName} event`);
  return retry;
}

/**
 * Filter out events that can be filtered just by looking at the webhook data. This is useful for rejecting events at
 * the web request layer before enqueuing in the work queue, to save on request units for the underlying queue system.
 *
 * @return A boolean indicating whether the event should be rejected (true for reject, false for keep).
 */
export function fastRejectEvent(
  eventName: GitHubWebhookEventName,
  payload: GitHubWebhookEvent,
): boolean {
  // Reject if event name is not in the allowed events list.
  if (!allowedEvents.includes(eventName)) {
    return true;
  }

  switch (eventName) {
    case "installation": {
      // Reject if not allowed subevent for installation
      const payloadTyped = payload as GitHubInstallationEvent;
      if (!allowedInstallationEvents.includes(payloadTyped.action)) {
        return true;
      }
      break;
    }

    case "pull_request": {
      // Reject if not allowed subevent for pull request
      const payloadTyped = payload as GitHubPullRequestEvent;
      if (!allowedPullRequestEvents.includes(payloadTyped.action)) {
        return true;
      }
      break;
    }

    case "pull_request_review": {
      // Reject if not allowed subevent for pull request
      const payloadTyped = payload as GitHubPullRequestReviewEvent;
      if (!allowedPullRequestEvents.includes(payloadTyped.action)) {
        return true;
      }
      break;
    }

    case "push": {
      // Reject if not a push event to the default branch of the .fensak repository.
      const payloadTyped = payload as GitHubPushEvent;
      const repoName = payloadTyped.repository.name;
      const defaultBranch = payloadTyped.repository.default_branch;
      const refName = payloadTyped.ref;
      if (
        repoName != fensakCfgRepoName ||
        refName != `refs/heads/${defaultBranch}`
      ) {
        return true;
      }
    }
  }

  // At this point, event hasn't been rejected, so allow it.
  return false;
}
