// Copyright (c) Fensak, LLC.
// SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

import { config, Octokit } from "../deps.ts";
import type {
  GitHubPullRequestEvent,
  GitHubPullRequestReviewEvent,
} from "../deps.ts";

import { octokitFromInstallation } from "../ghauth/mod.ts";
import { loadConfigFromGitHub } from "../fskconfig/mod.ts";
import { patchFromGitHubPullRequest, SourcePlatform } from "../patch/mod.ts";
import { RuleLogMode, runRule } from "../udr/mod.ts";
import { mustGetGitHubOrg } from "../svcdata/mod.ts";

import {
  completeCheck,
  formatCheckOutputText,
  initializeCheck,
} from "./checks.ts";

const enforceMarketplacePlan = config.get(
  "github.activeMarketplacePlanRequired",
);

/**
 * Route the specific pull request sub event to the relevant core business logic to process it.
 * Note that we only process synchronize, opened, and review events. The idea is that Fensak only needs to reevaluate
 * the rules when the code changes, or when there is a change in approval.
 *
 * @return A boolean indicating whether the operation needs to be retried.
 */
export async function onPullRequest(
  requestID: string,
  payload: GitHubPullRequestEvent | GitHubPullRequestReviewEvent,
): Promise<boolean> {
  switch (payload.action) {
    default:
      console.debug(
        `[${requestID}] Discarding github pull request event ${payload.action}`,
      );
      return false;

    // Pull request events
    case "opened":
    case "synchronize":
      /* falls through */

    // Review events
    case "submitted":
    case "edited":
    case "dismissed":
      // Validations to make sure this event requires processing.
      if (!payload.organization) {
        console.warn(
          `[${requestID}] No organization set for pull request event. Discarding.`,
        );
        return false;
      }

      return await runReviewRoutine(
        requestID,
        payload.organization.login,
        payload.repository.name,
        payload.pull_request.number,
        payload.pull_request.head.sha,
      );
  }
}

/**
 * Handler function for the pull request opened and synchronize events.
 * This routine implements the core review logic for the PR, ensuring that it either:
 * - Passes the auto approval rule function.
 * - Has the required number of approvals.
 *
 * @return A boolean indicating whether the operation needs to be retried.
 */
async function runReviewRoutine(
  requestID: string,
  owner: string,
  repoName: string,
  prNum: number,
  headSHA: string,
): Promise<boolean> {
  const ghorg = await mustGetGitHubOrg(owner);
  if (enforceMarketplacePlan && !ghorg.marketplacePlan) {
    console.warn(
      `[${requestID}] Ignoring pull request action for org ${owner} - no active marketplace plan on record.`,
    );
    return false;
  }
  if (!ghorg.installationID) {
    // We fail loudly in this case because this is a bug in the system as it doesn't make sense that the installation
    // event wasn't handled by the time we start getting pull requests for an Org.
    throw new Error(
      `[${requestID}] No active installation on record for org ${owner} when handling pull request action for ${repoName} (Num: ${prNum}).`,
    );
  }

  const octokit = octokitFromInstallation(ghorg.installationID);

  const cfg = await loadConfigFromGitHub(octokit, ghorg);
  if (!cfg) {
    console.warn(
      `[${requestID}] Cache miss for Fensak config for ${ghorg.name}, and could not acquire lock for fetching. Retrying later.`,
    );
    return true;
  }

  const repoCfg = cfg.orgConfig.repos[repoName];
  if (!repoCfg) {
    console.debug(
      `[${requestID}] No rules configured for repository ${repoName}.`,
    );
    return false;
  }

  const ruleFn = cfg.ruleLookup[repoCfg.ruleFile];
  if (!ruleFn) {
    console.warn(
      `[${requestID}] Compiled rule function could not be found for repository ${repoName}.`,
    );
    return false;
  }
  const ruleFileURL = ruleFn.fileURL;
  const requiredApprovals = repoCfg.requiredApprovals || 1;

  const checkID = await initializeCheck(
    octokit,
    ghorg.name,
    repoName,
    headSHA,
  );

  try {
    const patch = await patchFromGitHubPullRequest(
      octokit,
      {
        owner: ghorg.name,
        name: repoName,
      },
      prNum,
    );

    // Check the auto-approve rule
    const fetchMap: Record<string, Record<string, URL>> = {};
    fetchMap[SourcePlatform.GitHub] = patch.patchFetchMap;
    const automerge = await runRule(
      ruleFn.compiledRule,
      patch.patchList,
      {
        fileFetchMap: fetchMap,
        // TODO: make this configurable by user
        logMode: RuleLogMode.Capture,
      },
    );
    if (automerge.approve) {
      const [summary, details] = formatCheckOutputText(
        automerge.approve,
        `The change set passed the auto-approval rule [${repoCfg.ruleFile}](${ruleFileURL}).`,
        automerge.logs,
      );
      await completeCheck(
        octokit,
        ghorg.name,
        repoName,
        checkID,
        "success",
        summary,
        details,
      );
      return false;
    }

    // Failed auto-approval check, so fall back to checking for required approvals.
    const [numApprovals, nonWriterApprovalUsers] =
      await numberApprovalsFromWriters(
        octokit,
        ghorg.name,
        repoName,
        prNum,
        requiredApprovals,
      );
    if (numApprovals >= requiredApprovals) {
      const [summary, details] = formatCheckOutputText(
        automerge.approve,
        `The change set has the required number of approvals (at least ${requiredApprovals}).`,
        automerge.logs,
      );
      await completeCheck(
        octokit,
        ghorg.name,
        repoName,
        checkID,
        "success",
        summary,
        details,
      );
      return false;
    }

    // At this point, the PR didn't pass the auto-approve rule nor does it have enough approvals, so reject it.
    const reasonLines = [];
    reasonLines.push(
      `The change set did not pass the auto-approval rule [${repoCfg.ruleFile}](${ruleFileURL}) and it does not have the required number of approvals (${numApprovals} < ${requiredApprovals}).`,
    );
    if (nonWriterApprovalUsers.length > 0) {
      reasonLines.push("");
      reasonLines.push(
        "The following users approved the PR, but do not have write access to the repository:",
      );
      for (const u of nonWriterApprovalUsers) {
        reasonLines.push(`- \`${u}\``);
      }
    }
    const reason = reasonLines.join("\n");
    const [summary, details] = formatCheckOutputText(
      automerge.approve,
      reason,
      automerge.logs,
    );
    await completeCheck(
      octokit,
      ghorg.name,
      repoName,
      checkID,
      "action_required",
      summary,
      details,
    );
  } catch (err) {
    console.error(
      `[${requestID}] Error processing rule for pull request: ${err}`,
    );
    await completeCheck(
      octokit,
      ghorg.name,
      repoName,
      checkID,
      "failed",
      "Internal error",
      "Fensak encountered an internal error and was unable to process this Pull Request. Our team is notified of these errors and will trigger a rebuild automatically or reach out to you if further action is required. In the meantime, you can also try triggering a retry by submitting a review comment.",
    );

    throw err;
  }

  return false;
}

async function numberApprovalsFromWriters(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNum: number,
  requiredApprovals: number,
): Promise<[number, string[]]> {
  const { data: reviews } = await octokit.pulls.listReviews({
    owner,
    repo,
    pull_number: prNum,
  });

  const approvals = [];
  for (const r of reviews) {
    if (r.state === "APPROVED") {
      approvals.push(r);
    }
  }

  // Ideally we can directly get the number of approvals by checking the author_association, but if the user preference
  // is set to private, then the association is always NONE, so it is an unreliable signal. As such, we have to make API
  // calls and risk hitting the API rate limit.
  //
  // See https://github.com/orgs/community/discussions/18690
  let numApprovalsFromWriters = 0;
  const nonWriterApprovalUsers = [];
  for (const a of approvals) {
    if (a.user == null) {
      continue;
    }

    const { data: p } = await octokit.repos.getCollaboratorPermissionLevel({
      owner,
      repo,
      username: a.user.login,
    });
    const permissionsWithWriteAccess = [
      "admin",
      "write",
    ];
    if (permissionsWithWriteAccess.includes(p.permission)) {
      numApprovalsFromWriters++;
    } else {
      nonWriterApprovalUsers.push(a.user.login);
    }

    // Short circuit to save on API calls if we reached the number of required approvals already
    if (numApprovalsFromWriters >= requiredApprovals) {
      return [numApprovalsFromWriters, nonWriterApprovalUsers];
    }
  }

  return [numApprovalsFromWriters, nonWriterApprovalUsers];
}
