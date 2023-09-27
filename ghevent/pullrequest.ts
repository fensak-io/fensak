import type {
  GitHubPullRequestEvent,
  GitHubPullRequestOpenedEvent,
  GitHubPullRequestSynchronizeEvent,
} from "../deps.ts";

import { octokitFromInstallation } from "../ghauth/mod.ts";
import { loadConfigFromGitHub } from "../fskconfig/mod.ts";
import { patchFromGitHubPullRequest } from "../patch/mod.ts";
import { runRule } from "../udr/mod.ts";
import { getGitHubOrg } from "../svcdata/mod.ts";

import { completeCheck, initializeCheck } from "./checks.ts";

export async function onPullRequest(
  requestID: string,
  payload: GitHubPullRequestEvent,
): Promise<void> {
  switch (payload.action) {
    default:
      console.debug(
        `[${requestID}] Discarding github pull request event ${payload.action}`,
      );
      return;

    case "synchronize":
      await onPullRequestSynchronize(
        requestID,
        payload as GitHubPullRequestSynchronizeEvent,
      );
      return;

    case "opened":
      await onPullRequestSynchronize(
        requestID,
        payload as GitHubPullRequestOpenedEvent,
      );
  }
}

async function onPullRequestSynchronize(
  requestID: string,
  payload: GitHubPullRequestSynchronizeEvent | GitHubPullRequestOpenedEvent,
): Promise<void> {
  if (!payload.organization) {
    console.warn(
      `[${requestID}] No organization set for pull request event. Discarding.`,
    );
    return;
  }
  if (
    payload.pull_request.head.repo &&
    payload.pull_request.head.repo.name !== payload.repository.name
  ) {
    console.warn(
      `[${requestID}] Pull request opened from fork. Discarding.`,
    );
    return;
  }

  const ghorg = await getGitHubOrg(payload.organization.login);
  const octokit = octokitFromInstallation(ghorg.installationID);
  const cfg = await loadConfigFromGitHub(octokit, ghorg.name);
  const repoCfg = cfg.orgConfig.repos[payload.repository.name];
  if (!repoCfg) {
    console.debug(
      `[${requestID}] No rules configured for repository ${payload.repository.name}.`,
    );
    return;
  }
  const ruleFn = cfg.ruleLookup[repoCfg.ruleFile];
  if (!ruleFn) {
    console.warn(
      `[${requestID}] Compiled rule function could not be found for repository ${payload.repository.name}.`,
    );
    return;
  }

  const checkID = await initializeCheck(
    octokit,
    ghorg.name,
    payload.repository.name,
    payload.pull_request.head.sha,
  );

  try {
    const patch = await patchFromGitHubPullRequest(
      octokit,
      {
        owner: ghorg.name,
        name: payload.repository.name,
      },
      payload.number,
    );

    // TODO
    // - include logs from rule run in checks.
    // - include reason for passing check (automerge rule passed).
    const automerge = await runRule(ruleFn.compiledRule, patch.patchList);
    if (automerge.approve) {
      await completeCheck(
        octokit,
        ghorg.name,
        payload.repository.name,
        checkID,
        "success",
      );
      return;
    }

    // TODO
    // - implement routine for requiring reviewers.
    // - when accepting, include reason for passing check (automerge failed, but required reviewers met).
    // - when rejecting, include a message about why.
    await completeCheck(
      octokit,
      ghorg.name,
      payload.repository.name,
      checkID,
      "action_required",
    );
  } catch (err) {
    console.error(
      `[${requestID}] Error processing rule for pull request: ${err}`,
    );
    // TODO:
    // include a generic error message to notify user that this is a fatal error on our side.
    await completeCheck(
      octokit,
      ghorg.name,
      payload.repository.name,
      checkID,
      "failed",
    );

    throw err;
  }
}
