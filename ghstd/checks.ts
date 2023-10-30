// Copyright (c) Fensak, LLC.
// SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

import { Octokit } from "../deps.ts";

import {
  fensakCfgRepoName,
  loaderCheckName,
  loaderCheckTitle,
  smartReviewCheckName,
  smartReviewCheckTitle,
} from "../constants/mod.ts";

export async function reportNoSubscriptionToUser(
  octokit: Octokit,
  owner: string,
  eventSHA: string,
): Promise<void> {
  await octokit.checks.create({
    owner: owner,
    repo: fensakCfgRepoName,
    name: loaderCheckName,
    head_sha: eventSHA,
    status: "completed",
    conclusion: "failure",
    output: {
      title: loaderCheckTitle,
      summary: "Failed to load Fensak configuration",
      text: "this Organization does not have an active Fensak subscription",
    },
  });
}

export async function initializeLoadFensakCfgCheck(
  clt: Octokit,
  owner: string,
  headSHA: string,
): Promise<number> {
  const { data: check } = await clt.checks.create({
    owner: owner,
    repo: fensakCfgRepoName,
    name: loaderCheckName,
    head_sha: headSHA,
    status: "in_progress",
  });
  return check.id;
}

export async function completeLoadFensakCfgCheck(
  clt: Octokit,
  owner: string,
  checkID: number,
  errMsg: string | null,
): Promise<void> {
  let conclusion = "success";
  let output = {
    title: loaderCheckTitle,
    summary: "Successfully loaded Fensak configuration",
    text: "",
  };
  if (errMsg != null) {
    conclusion = "failure";
    output = {
      title: loaderCheckTitle,
      summary: "Failed to load Fensak configuration",
      text: errMsg,
    };
  }

  await clt.checks.update({
    owner: owner,
    repo: fensakCfgRepoName,
    name: loaderCheckName,
    check_run_id: checkID,
    status: "completed",
    conclusion: conclusion,
    output: output,
  });
}

export async function initializeSmartReviewCheck(
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

export async function completeSmartReviewCheck(
  clt: Octokit,
  owner: string,
  repo: string,
  checkID: number,
  conclusion: "success" | "action_required" | "failure",
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
