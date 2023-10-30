// Copyright (c) Fensak, LLC.
// SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

import { config, Octokit, reng } from "../deps.ts";
import type {
  GitHubPullRequest,
  GitHubPullRequestEvent,
  GitHubPullRequestReviewEvent,
  GitHubUser,
} from "../deps.ts";

import { fensakCfgRepoName } from "../constants/mod.ts";
import { logger } from "../logging/mod.ts";
import { octokitFromInstallation } from "../ghauth/mod.ts";
import {
  completeSmartReviewCheck,
  getDefaultHeadSHA,
  initializeSmartReviewCheck,
  reportNoSubscriptionToUser,
} from "../ghstd/mod.ts";
import { loadConfigFromGitHub } from "../fskconfig/mod.ts";
import { mustGetGitHubOrgWithSubscription } from "../svcdata/mod.ts";
import {
  AuthorType,
  getRequiredApprovalsForAuthor,
  runReview,
} from "../review/mod.ts";
import type { CompiledRuleSource } from "../svcdata/mod.ts";

const enforceSubscriptionPlan = config.get(
  "activeSubscriptionPlanRequired",
);
const permissionsWithWriteAccess = [
  "admin",
  "write",
];

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
  // IMPORTANT
  // If a new case condition is added here, you must update allowedInstallationEvents in handler.ts!
  switch (payload.action) {
    default:
      logger.debug(
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
        logger.warn(
          `[${requestID}] No organization set for pull request event. Discarding.`,
        );
        return false;
      }

      return await runReviewRoutine(
        requestID,
        payload.organization.login,
        payload.repository.name,
        payload.pull_request as GitHubPullRequest,
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
  pullRequest: GitHubPullRequest,
): Promise<boolean> {
  const prNum = pullRequest.number;
  const headSHA = pullRequest.head.sha;
  const ghorg = await mustGetGitHubOrgWithSubscription(owner);
  if (!ghorg.installationID) {
    // We fail loudly in this case because this is a bug in the system as it doesn't make sense that the installation
    // event wasn't handled by the time we start getting pull requests for an Org.
    throw new Error(
      `[${requestID}] No active installation on record for org ${owner} when handling pull request action for ${repoName} (Num: ${prNum}).`,
    );
  }
  const octokit = octokitFromInstallation(ghorg.installationID);

  if (enforceSubscriptionPlan && !ghorg.subscription) {
    logger.warn(
      `[${requestID}] Ignoring pull request action for org ${owner} - no active subscription plan on record.`,
    );
    const cfgHeadSHA = await getDefaultHeadSHA(
      octokit,
      ghorg.name,
      fensakCfgRepoName,
    );
    await reportNoSubscriptionToUser(octokit, owner, cfgHeadSHA);
    return false;
  }

  const cfg = await loadConfigFromGitHub(octokit, ghorg);
  if (!cfg) {
    logger.warn(
      `[${requestID}] Cache miss for Fensak config for ${ghorg.name}, and could not acquire lock for fetching. Retrying later.`,
    );
    return true;
  }

  const repoCfg = cfg.orgConfig.repos[repoName];
  if (!repoCfg) {
    logger.debug(
      `[${requestID}] No rules configured for repository ${repoName}.`,
    );
    return false;
  }

  let ruleFn: CompiledRuleSource | undefined;
  if (repoCfg.ruleFile) {
    ruleFn = cfg.ruleLookup[repoCfg.ruleFile];
    if (!ruleFn) {
      logger.warn(
        `[${requestID}] Compiled rule function could not be found for repository ${repoName}.`,
      );
      return false;
    }
  }

  let requiredRuleFn: CompiledRuleSource | undefined;
  if (repoCfg.requiredRuleFile) {
    requiredRuleFn = cfg.ruleLookup[repoCfg.requiredRuleFile];
    if (!requiredRuleFn) {
      logger.warn(
        `[${requestID}] Compiled required rule function could not be found for repository ${repoName}.`,
      );
      return false;
    }
  }

  const authorType = await determineAuthorType(
    octokit,
    cfg.orgConfig.machineUsers,
    owner,
    repoName,
    pullRequest.user,
  );
  const [requiredApprovals, msgAnnotation] = getRequiredApprovalsForAuthor(
    repoCfg,
    authorType,
  );

  const checkID = await initializeSmartReviewCheck(
    octokit,
    ghorg.name,
    repoName,
    headSHA,
  );

  const getNumberApprovalsFromTrustedUsers = async (): Promise<
    [number, string[], string[]]
  > => {
    return await numberApprovalsFromTrustedUsers(
      octokit,
      cfg.orgConfig.machineUsers,
      ghorg.name,
      repoName,
      prNum,
      requiredApprovals,
    );
  };
  const reportSuccess = async (
    summary: string,
    details: string,
  ): Promise<void> => {
    await completeSmartReviewCheck(
      octokit,
      ghorg.name,
      repoName,
      checkID,
      "success",
      summary,
      details,
    );
  };
  const reportFailure = async (
    summary: string,
    details: string,
  ): Promise<void> => {
    await completeSmartReviewCheck(
      octokit,
      ghorg.name,
      repoName,
      checkID,
      "action_required",
      summary,
      details,
    );
  };

  try {
    const patch = await reng.patchFromGitHubPullRequest(
      octokit,
      {
        owner: ghorg.name,
        name: repoName,
      },
      prNum,
    );
    await runReview(
      repoCfg,
      patch,
      ruleFn,
      requiredRuleFn,
      requiredApprovals,
      msgAnnotation,
      getNumberApprovalsFromTrustedUsers,
      reportSuccess,
      reportFailure,
    );
  } catch (err) {
    logger.error(
      `[${requestID}] Error processing rule for pull request: ${err}`,
    );
    await completeSmartReviewCheck(
      octokit,
      ghorg.name,
      repoName,
      checkID,
      "failure",
      "Internal error",
      "Fensak encountered an internal error and was unable to process this Pull Request. Our team is notified of these errors and will trigger a rebuild automatically or reach out to you if further action is required. In the meantime, you can also try triggering a retry by submitting a review comment.",
    );

    throw err;
  }

  return false;
}

async function numberApprovalsFromTrustedUsers(
  octokit: Octokit,
  machineUsers: string[],
  owner: string,
  repo: string,
  prNum: number,
  requiredApprovals: number,
): Promise<[number, string[], string[]]> {
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
  let numApprovalsFromTrustedUsers = 0;
  const untrustedUserApprovalUsers = [];
  const machineUserApprovalUsers = [];
  for (const a of approvals) {
    if (a.user == null) {
      continue;
    }

    const authorType = await determineAuthorType(
      octokit,
      machineUsers,
      owner,
      repo,
      a.user as GitHubUser,
    );
    switch (authorType) {
      case AuthorType.TrustedUser:
        numApprovalsFromTrustedUsers++;
        break;

      case AuthorType.MachineUser:
        machineUserApprovalUsers.push(a.user.login);
        break;

      default:
        untrustedUserApprovalUsers.push(a.user.login);
        break;
    }

    // Short circuit to save on API calls if we reached the number of required approvals already
    if (numApprovalsFromTrustedUsers >= requiredApprovals) {
      return [
        numApprovalsFromTrustedUsers,
        machineUserApprovalUsers,
        untrustedUserApprovalUsers,
      ];
    }
  }

  return [
    numApprovalsFromTrustedUsers,
    machineUserApprovalUsers,
    untrustedUserApprovalUsers,
  ];
}

async function determineAuthorType(
  octokit: Octokit,
  machineUsers: string[],
  owner: string,
  repo: string,
  user: GitHubUser,
): Promise<AuthorType> {
  if (
    user.type === "Bot" ||
    machineUsers.includes(user.login)
  ) {
    return AuthorType.MachineUser;
  }

  const { data: p } = await octokit.repos.getCollaboratorPermissionLevel({
    owner,
    repo,
    username: user.login,
  });
  if (permissionsWithWriteAccess.includes(p.permission)) {
    return AuthorType.TrustedUser;
  }

  return AuthorType.User;
}
