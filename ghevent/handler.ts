import { GitHubPullRequestEvent } from "../deps.ts";

import type { GitHubEventPayload } from "../svcdata/mod.ts";

import { onPullRequest } from "./pullrequest.ts";

export async function handleGitHubEvent(
  msg: GitHubEventPayload,
): Promise<void> {
  console.log(`Processing ${msg.eventName} event ${msg.requestID}`);

  switch (msg.eventName) {
    default:
      console.debug(`Discarding github event ${msg.eventName}`);
      return;

    case "pull_request":
      await onPullRequest(
        msg.requestID,
        msg.payload as GitHubPullRequestEvent,
      );
      return;
  }
}
