import {
  GitHubInstallationEvent,
  GitHubPullRequestEvent,
  GitHubPullRequestReviewEvent,
} from "../deps.ts";

import type { GitHubEventPayload } from "../svcdata/mod.ts";

import { onPullRequest } from "./pullrequest.ts";
import { onAppMgmt } from "./installation.ts";

/**
 * Handles the given GitHub event.
 *
 * @return A boolean indicating whether the operation needs to be retried.
 */
export async function handleGitHubEvent(
  msg: GitHubEventPayload,
): Promise<boolean> {
  console.log(`[${msg.requestID}] Processing ${msg.eventName} event`);

  let retry = false;
  switch (msg.eventName) {
    default:
      console.debug(
        `[${msg.requestID}] Discarding github event ${msg.eventName}`,
      );
      return false;

    case "installation":
      await onAppMgmt(
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
  }

  console.log(`[${msg.requestID}] Processed ${msg.eventName} event`);
  return retry;
}
