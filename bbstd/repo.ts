// Copyright (c) Fensak, LLC.
// SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

import { reng } from "../deps.ts";

/**
 * Returns the default branch of the given repo.
 */
export async function getDefaultBranch(
  clt: reng.BitBucket,
  owner: string,
  repoName: string,
): Promise<string> {
  const resp = await clt.apiCall(`/2.0/repositories/${owner}/${repoName}`);
  const data = await resp.json();
  return data.mainbranch.name;
}

/**
 * Returns the git head commit SHA of the default branch of the given repo.
 */
export async function getDefaultHeadSHA(
  clt: reng.BitBucket,
  owner: string,
  repoName: string,
): Promise<string> {
  const defaultBranch = await getDefaultBranch(clt, owner, repoName);
  return await getHeadSHA(clt, owner, repoName, defaultBranch);
}

/**
 * Returns the git head commit SHA of the given branch.
 */
export async function getHeadSHA(
  clt: reng.BitBucket,
  owner: string,
  repoName: string,
  branchName: string,
): Promise<string> {
  const resp = await clt.apiCall(
    `/2.0/repositories/${owner}/${repoName}/refs/branches/${branchName}`,
  );
  const data = await resp.json();
  return data.target.hash;
}

/**
 * Returns the list of files in the repo by performing a list op on the root directory of the repository.
 */
export async function getListOfFiles(
  clt: reng.BitBucket,
  owner: string,
  repoName: string,
  sha: string,
  maxDepth = 20,
  // deno-lint-ignore no-explicit-any
): Promise<any[]> {
  const resp = await clt.apiCall(
    `/2.0/repositories/${owner}/${repoName}/src/${sha}/.?max_depth=${maxDepth}`,
  );
  let data = await resp.json();

  // deno-lint-ignore no-explicit-any
  const predicate = (f: any) => f.type === "commit_file";

  const out = data.values.filter(predicate);
  while (data.next) {
    const resp = await clt.directAPICall(data.next);
    data = await resp.json();
    out.push(...data.values.filter(predicate));
  }
  return out;
}
