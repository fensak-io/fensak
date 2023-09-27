import {
  GitHubPullRequestEvent,
  GitHubPullRequestReviewEvent,
} from "../deps.ts";

import type { GitHubEventPayload } from "../svcdata/mod.ts";

import { onPullRequest } from "./pullrequest.ts";

export async function handleGitHubEvent(
  msg: GitHubEventPayload,
): Promise<void> {
  console.log(`[${msg.requestID}] Processing ${msg.eventName} event`);

  switch (msg.eventName) {
    default:
      console.debug(
        `[${msg.requestID}] Discarding github event ${msg.eventName}`,
      );
      return;

    case "pull_request":
      await onPullRequest(
        msg.requestID,
        msg.payload as GitHubPullRequestEvent,
      );
      break;

    case "pull_request_review":
      await onPullRequest(
        msg.requestID,
        msg.payload as GitHubPullRequestReviewEvent,
      );
      break;
  }

  console.log(`[${msg.requestID}] Processed ${msg.eventName} event`);
}
