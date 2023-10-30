// Copyright (c) Fensak, LLC.
// SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

import { reng } from "../deps.ts";

import type { RepoConfig } from "../svcdata/mod.ts";

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
