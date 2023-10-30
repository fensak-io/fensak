// Copyright (c) Fensak, LLC.
// SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

import { config, reng } from "../deps.ts";

import { logger } from "../logging/mod.ts";
import { mustGetBitBucketWorkspaceWithSubscription } from "../svcdata/mod.ts";
import { loadConfigFromBitBucket } from "../fskconfig/mod.ts";
import {
  bitbucketFromWorkspace,
  completeSmartReviewCheck,
  initializeSmartReviewCheck,
} from "../bbstd/mod.ts";
import {
  AuthorType,
  formatSmartReviewCheckOutputText,
  getRequiredApprovalsForAuthor,
} from "../review/mod.ts";
import type { CompiledRuleSource } from "../svcdata/mod.ts";

const enforceSubscriptionPlan = config.get(
  "activeSubscriptionPlanRequired",
);

/**
 * Route the specific pull request sub event to the relevant core business logic to process it.
 *
 * @return A boolean indicating whether the operation needs to be retried.
 */
export async function onPullRequest(
  requestID: string,
  // deno-lint-ignore no-explicit-any
  payload: any,
): Promise<boolean> {
  const wsName = payload.repository.workspace.slug;
  const repoName = payload.repository.name;
  const prNum = payload.pullrequest.number;
  const headSHA = payload.pullrequest.source.commit.hash;
  const ws = await mustGetBitBucketWorkspaceWithSubscription(wsName);
  if (!ws.securityContext) {
    // We fail loudly in this case because this is a bug in the system as it doesn't make sense that the installation
    // event wasn't handled by the time we start getting pull requests for an Org.
    throw new Error(
      `[${requestID}] No active installation on record for BitBucket workspace ${wsName} when handling pull request action for ${repoName} (Num: ${prNum}).`,
    );
  }
  const clt = bitbucketFromWorkspace(ws);

  if (enforceSubscriptionPlan && !ws.subscription) {
    logger.warn(
      `[${requestID}] Ignoring pull request action for BitBucket workspace ${wsName} - no active subscription plan on record.`,
    );
    //const cfgHeadSHA = await getDefaultHeadSHA(
    //  clt,
    //  wsName,
    //  fensakCfgRepoName,
    //);
    //await reportNoSubscriptionToUser(octokit, owner, cfgHeadSHA);
    return false;
  }

  const cfg = await loadConfigFromBitBucket(clt, ws);
  if (!cfg) {
    logger.warn(
      `[${requestID}] Cache miss for Fensak config for BitBucket workspace ${wsName}, and could not acquire lock for fetching. Retrying later.`,
    );
    return true;
  }

  const repoCfg = cfg.orgConfig.repos[repoName];
  if (!repoCfg) {
    logger.debug(
      `[${requestID}] No rules configured for BitBucket repository ${repoName}.`,
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
    clt,
    cfg.orgConfig.machineUsers,
    wsName,
    repoName,
    payload.actor,
  );
  const [requiredApprovals, msgAnnotation] = getRequiredApprovalsForAuthor(
    repoCfg,
    authorType,
  );

  await initializeSmartReviewCheck(
    clt,
    wsName,
    repoName,
    headSHA,
  );

  try {
    const patch = await reng.patchFromBitBucketPullRequest(
      clt,
      {
        owner: wsName,
        name: repoName,
      },
      prNum,
    );

    // Check the required rule if specified
    let requiredLogs: reng.IRuleLogEntry[] = [];
    if (requiredRuleFn) {
      const required = await reng.runRule(
        requiredRuleFn.compiledRule,
        patch.patchList,
        patch.metadata,
        {
          // TODO: make this configurable by user
          logMode: reng.RuleLogMode.Capture,
        },
      );
      if (!required.approve) {
        // TODO: figure out how to report the details
        const [summary, _details] = formatSmartReviewCheckOutputText(
          false,
          `The change set failed the required rule [${repoCfg.requiredRuleFile}](${requiredRuleFn.fileURL}).`,
          required.logs,
          [],
        );
        await completeSmartReviewCheck(
          clt,
          wsName,
          repoName,
          headSHA,
          "FAILED",
          summary,
        );
        return false;
      }

      // Skip the auto-approval rule and pass the check if no approvals are required, since the result of the
      // auto-approval rule has no effect.
      if (requiredApprovals == 0) {
        // TODO: figure out how to report the details
        const [summary, _details] = formatSmartReviewCheckOutputText(
          true,
          "The change set passed the required rule and no approvals are required.",
          required.logs,
          [],
        );
        await completeSmartReviewCheck(
          clt,
          wsName,
          repoName,
          headSHA,
          "SUCCESSFUL",
          summary,
        );
        return false;
      }

      requiredLogs = required.logs;
    }

    // Check the auto-approve rule
    let automergeLogs: reng.IRuleLogEntry[] = [];
    if (ruleFn) {
      const automerge = await reng.runRule(
        ruleFn.compiledRule,
        patch.patchList,
        patch.metadata,
        {
          // TODO: make this configurable by user
          logMode: reng.RuleLogMode.Capture,
        },
      );
      if (automerge.approve) {
        // TODO: figure out how to report the details
        const [summary, _details] = formatSmartReviewCheckOutputText(
          automerge.approve,
          `The change set passed the auto-approval rule [${repoCfg.ruleFile}](${ruleFn.fileURL}).`,
          requiredLogs,
          automerge.logs,
        );
        await completeSmartReviewCheck(
          clt,
          wsName,
          repoName,
          headSHA,
          "SUCCESSFUL",
          summary,
        );
        return false;
      }
      automergeLogs = automerge.logs;
    }

    // Failed auto-approval check, so fall back to checking for required approvals.
    const [numApprovals, machineUserApprovalUsers, untrustedUserApprovalUsers] =
      await numberApprovalsFromTrustedUsers(
        clt,
        cfg.orgConfig.machineUsers,
        wsName,
        repoName,
        prNum,
        requiredApprovals,
      );
    if (numApprovals >= requiredApprovals) {
      // TODO: figure out how to report the details
      const [summary, _details] = formatSmartReviewCheckOutputText(
        true,
        `The change set has the required number of approvals (at least ${requiredApprovals}).${msgAnnotation}`,
        requiredLogs,
        automergeLogs,
      );
      await completeSmartReviewCheck(
        clt,
        wsName,
        repoName,
        headSHA,
        "SUCCESSFUL",
        summary,
      );
      return false;
    }

    // At this point, the PR didn't pass the auto-approve rule nor does it have enough approvals, so reject it.
    const reasonLines = [];
    if (ruleFn) {
      reasonLines.push(
        `The change set did not pass the auto-approval rule [${repoCfg.ruleFile}](${ruleFn.fileURL}) and it does not have the required number of approvals (${numApprovals} < ${requiredApprovals}).${msgAnnotation}`,
      );
    } else {
      reasonLines.push(
        `The change set does not have the required number of approvals (${numApprovals} < ${requiredApprovals}).${msgAnnotation}`,
      );
    }
    if (untrustedUserApprovalUsers.length > 0) {
      reasonLines.push("");
      reasonLines.push(
        "The following users approved the PR, but do not have write access to the repository:",
      );
      for (const u of untrustedUserApprovalUsers) {
        reasonLines.push(`- \`${u}\``);
      }
    }
    if (machineUserApprovalUsers.length > 0) {
      reasonLines.push("");
      reasonLines.push(
        "The following users approved the PR, but are machine users:",
      );
      for (const u of machineUserApprovalUsers) {
        reasonLines.push(`- \`${u}\``);
      }
    }
    const reason = reasonLines.join("\n");
    // TODO: figure out how to report the details
    const [summary, _details] = formatSmartReviewCheckOutputText(
      false,
      reason,
      requiredLogs,
      automergeLogs,
    );
    await completeSmartReviewCheck(
      clt,
      wsName,
      repoName,
      headSHA,
      "FAILED",
      summary,
    );
  } catch (err) {
    logger.error(
      `[${requestID}] Error processing rule for pull request: ${err}`,
    );

    // TODO: figure out how to report the details.
    // "Fensak encountered an internal error and was unable to process this Pull Request. Our team is notified of these errors and will trigger a rebuild automatically or reach out to you if further action is required. In the meantime, you can also try triggering a retry by submitting a review comment.",
    await completeSmartReviewCheck(
      clt,
      wsName,
      repoName,
      headSHA,
      "FAILED",
      "Internal error",
    );

    throw err;
  }

  return false;
}

async function numberApprovalsFromTrustedUsers(
  clt: reng.BitBucket,
  machineUsers: string[],
  wsName: string,
  repo: string,
  prNum: number,
  requiredApprovals: number,
): Promise<[number, string[], string[]]> {
  const resp = await clt.apiCall(
    `/2.0/repositories/${wsName}/${repo}/pullrequests/${prNum}`,
  );
  const pullReq = await resp.json();

  const approvals = [];
  for (const r of pullReq.participants) {
    if (r.approved) {
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
      clt,
      machineUsers,
      wsName,
      repo,
      a.user,
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
  clt: reng.BitBucket,
  machineUsers: string[],
  wsName: string,
  repo: string,
  // deno-lint-ignore no-explicit-any
  user: any,
): Promise<AuthorType> {
  if (machineUsers.includes(user.uuid)) {
    return AuthorType.MachineUser;
  }

  const resp = await clt.apiCall(
    `/2.0/repositories/${wsName}/${repo}/permissions-config/users/${user.uuid}`,
  );
  const data = await resp.json();
  switch (data.permission) {
    default:
      return AuthorType.User;

    case "admin":
    case "write":
      return AuthorType.TrustedUser;
  }
}
