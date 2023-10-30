// Copyright (c) Fensak, LLC.
// SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

import { config, reng } from "../deps.ts";

import { logger } from "../logging/mod.ts";
import { mustGetBitBucketWorkspaceWithSubscription } from "../svcdata/mod.ts";
import { loadConfigFromBitBucket } from "../fskconfig/mod.ts";
import {
  bitbucketFromWorkspace,
  completeSmartReviewCheck,
  getPermissionTable,
  initializeSmartReviewCheck,
} from "../bbstd/mod.ts";
import {
  AuthorType,
  getRequiredApprovalsForAuthor,
  runReview,
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
  const prNum = payload.pullrequest.id;
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

  const permissionTable = await getPermissionTable(clt, wsName, repoName);

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

  const authorType = determineAuthorType(
    cfg.orgConfig.machineUsers,
    permissionTable,
    payload.actor.uuid,
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

  const getNumberApprovalsFromTrustedUsers = async (): Promise<
    [number, string[], string[]]
  > => {
    return await numberApprovalsFromTrustedUsers(
      clt,
      cfg.orgConfig.machineUsers,
      wsName,
      repoName,
      permissionTable,
      prNum,
      requiredApprovals,
    );
  };
  const reportSuccess = async (
    summary: string,
    details: string,
  ): Promise<void> => {
    await completeSmartReviewCheck(
      clt,
      wsName,
      repoName,
      prNum,
      headSHA,
      "SUCCESSFUL",
      summary,
      details,
    );
  };
  const reportFailure = async (
    summary: string,
    details: string,
  ): Promise<void> => {
    await completeSmartReviewCheck(
      clt,
      wsName,
      repoName,
      prNum,
      headSHA,
      "FAILED",
      summary,
      details,
    );
  };

  try {
    const patch = await reng.patchFromBitBucketPullRequest(
      clt,
      {
        owner: wsName,
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
      clt,
      wsName,
      repoName,
      prNum,
      headSHA,
      "FAILED",
      "Internal error",
      "Fensak encountered an internal error and was unable to process this Pull Request. Our team is notified of these errors and will trigger a rebuild automatically or reach out to you if further action is required. In the meantime, you can also try triggering a retry by submitting a review comment.",
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
  permissionTable: Record<string, "admin" | "write" | "read">,
  prNum: number,
  requiredApprovals: number,
): Promise<[number, string[], string[]]> {
  const resp = await clt.apiCall(
    `/2.0/repositories/${wsName}/${repo}/pullrequests/${prNum}`,
  );
  const pullReq = await resp.json();

  const approvals = [];
  for (const r of pullReq.participants) {
    if (r.approved && r.user.uuid !== pullReq.author.uuid) {
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

    const authorType = determineAuthorType(
      machineUsers,
      permissionTable,
      a.user.uuid,
    );
    switch (authorType) {
      case AuthorType.TrustedUser:
        numApprovalsFromTrustedUsers++;
        break;

      case AuthorType.MachineUser:
        machineUserApprovalUsers.push(a.user.display_name);
        break;

      default:
        untrustedUserApprovalUsers.push(a.user.display_name);
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

function determineAuthorType(
  machineUsers: string[],
  permissionTable: Record<string, "admin" | "write" | "read">,
  userUUID: string,
): AuthorType {
  if (machineUsers.includes(userUUID)) {
    return AuthorType.MachineUser;
  }

  switch (permissionTable[userUUID]) {
    default:
      return AuthorType.User;

    case "admin":
    case "write":
      return AuthorType.TrustedUser;
  }
}
