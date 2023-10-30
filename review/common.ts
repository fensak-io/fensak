// Copyright (c) Fensak, LLC.
// SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

import { reng } from "../deps.ts";

import type { CompiledRuleSource, RepoConfig } from "../svcdata/mod.ts";

export enum AuthorType {
  TrustedUser = 0,
  MachineUser = 1,
  User = 2,
}

export function getRequiredApprovalsForAuthor(
  repoCfg: RepoConfig,
  authorType: AuthorType,
): [number, string] {
  switch (authorType) {
    case AuthorType.TrustedUser: {
      const msgAnnotation =
        "\n**NOTE**: PR was detected to be opened by a trusted user.";
      if (repoCfg.requiredApprovalsForTrustedUsers !== undefined) {
        return [repoCfg.requiredApprovalsForTrustedUsers, msgAnnotation];
      } else if (repoCfg.requiredApprovals !== undefined) {
        return [repoCfg.requiredApprovals, msgAnnotation];
      }
      return [1, msgAnnotation];
    }

    case AuthorType.MachineUser: {
      const msgAnnotation =
        "\n**NOTE**: PR was detected to be opened by a machine user.";
      if (repoCfg.requiredApprovalsForMachineUsers !== undefined) {
        return [repoCfg.requiredApprovalsForMachineUsers, msgAnnotation];
      } else if (repoCfg.requiredApprovals !== undefined) {
        return [repoCfg.requiredApprovals, msgAnnotation];
      }
      return [1, msgAnnotation];
    }

    default:
      if (repoCfg.requiredApprovals !== undefined) {
        return [repoCfg.requiredApprovals, ""];
      }
      return [1, ""];
  }
}

export function formatSmartReviewCheckOutputText(
  pass: boolean,
  reason: string,
  requiredRuleLogEntries: reng.IRuleLogEntry[],
  automergeLogEntries: reng.IRuleLogEntry[],
): [string, string] {
  const outputLines = [];

  let summary = "";
  if (pass) {
    summary = "This Pull Request passed the review.";
  } else {
    summary = "Further action is required on this Pull Request.";
  }

  outputLines.push(reason);
  outputLines.push("");

  if (requiredRuleLogEntries.length > 0) {
    outputLines.push("## Required rule function logs");
    outputLines.push("```");
    for (const l of requiredRuleLogEntries) {
      outputLines.push(`[${l.level}] ${l.msg}`);
    }
    outputLines.push("```");
    outputLines.push("");
  }

  if (automergeLogEntries.length > 0) {
    outputLines.push("## Auto-approval rule function logs");
    outputLines.push("```");
    for (const l of automergeLogEntries) {
      outputLines.push(`[${l.level}] ${l.msg}`);
    }
    outputLines.push("```");
    outputLines.push("");
  }

  return [summary, outputLines.join("\n")];
}

/**
 * Implements the core review routine logic. The review logic is as follows:
 * - If there is a required rule:
 *     - Check if the patch passes the required rule.
 *     - If fail, reject the patch.
 *     - If pass, continue.
 * - If there is a ruleFn (auto-approval rule):
 *     - Check if the patch passes the rule.
 *     - If fail, continue.
 *     - If pass, pass the check.
 * - Get the approval state on the PR.
 * - Compare the approval count against the required approval counts.
 *     - If enough, pass the check.
 *     - Otherwise, fail the check.
 */
export async function runReview(
  repoCfg: RepoConfig,
  patch: reng.PullRequestPatches,
  ruleFn: CompiledRuleSource | undefined,
  requiredRuleFn: CompiledRuleSource | undefined,
  requiredApprovals: number,
  msgAnnotation: string,
  getNumberApprovalsFromTrustedUsers: () => Promise<
    [number, string[], string[]]
  >,
  reportSuccess: (summary: string, details: string) => Promise<void>,
  reportFailure: (summary: string, details: string) => Promise<void>,
) {
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
      const [summary, details] = formatSmartReviewCheckOutputText(
        false,
        `The change set failed the required rule [${repoCfg.requiredRuleFile}](${requiredRuleFn.fileURL}).`,
        required.logs,
        [],
      );
      await reportFailure(
        summary,
        details,
      );
      return;
    }

    // Skip the auto-approval rule and pass the check if no approvals are required, since the result of the
    // auto-approval rule has no effect.
    if (requiredApprovals == 0) {
      const [summary, details] = formatSmartReviewCheckOutputText(
        true,
        "The change set passed the required rule and no approvals are required.",
        required.logs,
        [],
      );
      await reportSuccess(
        summary,
        details,
      );
      return;
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
      const [summary, details] = formatSmartReviewCheckOutputText(
        automerge.approve,
        `The change set passed the auto-approval rule [${repoCfg.ruleFile}](${ruleFn.fileURL}).`,
        requiredLogs,
        automerge.logs,
      );
      await reportSuccess(
        summary,
        details,
      );
      return;
    }
    automergeLogs = automerge.logs;
  }

  // Failed auto-approval check, so fall back to checking for required approvals.
  const [numApprovals, machineUserApprovalUsers, untrustedUserApprovalUsers] =
    await getNumberApprovalsFromTrustedUsers();
  if (numApprovals >= requiredApprovals) {
    const [summary, details] = formatSmartReviewCheckOutputText(
      true,
      `The change set has the required number of approvals (at least ${requiredApprovals}).\n\n${msgAnnotation}`,
      requiredLogs,
      automergeLogs,
    );
    await reportSuccess(
      summary,
      details,
    );
    return;
  }

  // At this point, the PR didn't pass the auto-approve rule nor does it have enough approvals, so reject it.
  const reasonLines = [];
  if (ruleFn) {
    reasonLines.push(
      `The change set did not pass the auto-approval rule [${repoCfg.ruleFile}](${ruleFn.fileURL}) and it does not have the required number of approvals (${numApprovals} < ${requiredApprovals}).\n\n${msgAnnotation}`,
    );
  } else {
    reasonLines.push(
      `The change set does not have the required number of approvals (${numApprovals} < ${requiredApprovals}).\n\n${msgAnnotation}`,
    );
  }
  if (untrustedUserApprovalUsers.length > 0) {
    reasonLines.push("");
    reasonLines.push(
      "The following users approved the PR, but do not have write access to the repository:",
    );
    for (const u of untrustedUserApprovalUsers) {
      reasonLines.push(`* \`${u}\``);
    }
  }
  if (machineUserApprovalUsers.length > 0) {
    reasonLines.push("");
    reasonLines.push(
      "The following users approved the PR, but are machine users:",
    );
    for (const u of machineUserApprovalUsers) {
      reasonLines.push(`* \`${u}\``);
    }
  }
  const reason = reasonLines.join("\n");
  const [summary, details] = formatSmartReviewCheckOutputText(
    false,
    reason,
    requiredLogs,
    automergeLogs,
  );
  await reportFailure(
    summary,
    details,
  );
}
