// Copyright (c) Fensak, LLC.
// SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

import { Octokit } from "../deps.ts";

import {
  fensakCfgRepoName,
  loaderCheckName,
  loaderCheckTitle,
} from "../constants/mod.ts";

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
    conclusion = "failed";
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
