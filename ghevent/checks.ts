// Copyright (c) Fensak, LLC.
// SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

import { Octokit, reng } from "../deps.ts";

import {
  smartReviewCheckName,
  smartReviewCheckTitle,
} from "../constants/mod.ts";

export async function initializeCheck(
  clt: Octokit,
  owner: string,
  repo: string,
  headSHA: string,
): Promise<number> {
  const { data: check } = await clt.checks.create({
    owner: owner,
    repo: repo,
    name: smartReviewCheckName,
    head_sha: headSHA,
    status: "in_progress",
  });
  return check.id;
}

export async function completeCheck(
  clt: Octokit,
  owner: string,
  repo: string,
  checkID: number,
  conclusion: "success" | "action_required" | "failed",
  summary: string,
  details: string,
): Promise<void> {
  await clt.checks.update({
    owner: owner,
    repo: repo,
    name: smartReviewCheckName,
    check_run_id: checkID,
    status: "completed",
    conclusion: conclusion,
    output: {
      title: smartReviewCheckTitle,
      summary: summary,
      text: details,
    },
  });
}

export function formatCheckOutputText(
  pass: boolean,
  reason: string,
  logEntries: reng.IRuleLogEntry[],
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

  if (logEntries.length > 0) {
    outputLines.push("## Rule function logs");
    outputLines.push("```");
    for (const l of logEntries) {
      outputLines.push(`[${l.level}] ${l.msg}`);
    }
    outputLines.push("```");
    outputLines.push("");
  }

  return [summary, outputLines.join("\n")];
}
