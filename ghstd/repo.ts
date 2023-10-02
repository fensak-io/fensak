// Copyright (c) Fensak, LLC.
// SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

import { base64, Octokit } from "../deps.ts";

/**
 * Returns the git head commit SHA of the default branch of the given repo.
 */
export async function getDefaultHeadSHA(
  octokit: Octokit,
  owner: string,
  repoName: string,
): Promise<string> {
  const { data: repo } = await octokit.repos.get({
    owner: owner,
    repo: repoName,
  });
  const defaultBranch = repo.default_branch;
  return await getHeadSHA(octokit, owner, repoName, defaultBranch);
}

/**
 * Returns the git head commit SHA of the given branch.
 */
export async function getHeadSHA(
  octokit: Octokit,
  owner: string,
  repoName: string,
  branchName: string,
): Promise<string> {
  const { data: ref } = await octokit.git.getRef({
    owner: owner,
    repo: repoName,
    ref: `heads/${branchName}`,
  });
  return ref.object.sha;
}

/**
 * Creates a new branch from the default branch git head commit SHA of the given repo.
 */
export async function createBranchFromDefault(
  octokit: Octokit,
  owner: string,
  repoName: string,
  branchName: string,
): Promise<void> {
  const headSHA = await getDefaultHeadSHA(
    octokit,
    owner,
    repoName,
  );
  await octokit.git.createRef({
    owner: owner,
    repo: repoName,
    ref: `refs/heads/${branchName}`,
    sha: headSHA,
  });
}

/**
 * Deletes a branch by name in the given repo.
 */
export async function deleteBranch(
  octokit: Octokit,
  owner: string,
  repoName: string,
  branchName: string,
): Promise<void> {
  await octokit.git.deleteRef({
    owner: owner,
    repo: repoName,
    ref: `heads/${branchName}`,
  });
}

/**
 * Commits a change to the given file with the given contents to the provided repo's given branch.
 */
export async function commitFileUpdateToBranch(
  octokit: Octokit,
  owner: string,
  repoName: string,
  branchName: string,
  filePath: string,
  content: string,
): Promise<void> {
  const { data: f } = await octokit.repos.getContent({
    owner: owner,
    repo: repoName,
    path: filePath,
    branch: branchName,
  });
  if (Array.isArray(f)) {
    throw new Error(
      `Expected ${filePath} in ${owner}/${repoName} to be a file`,
    );
  }

  const contentEncoded = base64.encode(content);
  await octokit.repos.createOrUpdateFileContents({
    owner: owner,
    repo: repoName,
    path: filePath,
    sha: f.sha,
    branch: branchName,
    message: `Update ${filePath}`,
    content: contentEncoded,
  });
}
