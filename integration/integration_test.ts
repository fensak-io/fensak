// Copyright (c) Fensak, LLC.
// SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

import { assertEquals } from "../test_deps.ts";
import {
  base64,
  crypto,
  GitHubComponents,
  Octokit,
  octokitCreateAppAuth,
} from "../deps.ts";

import {
  commitFileUpdateToBranch,
  createBranchFromDefault,
  deleteBranch,
  getHeadSHA,
} from "../ghstd/mod.ts";

/**
 * start global constants
 */
type GitHubCheckRun = GitHubComponents["schemas"]["check-run"];

const testOrg = "fensak-test";

const testCommitterPrivateKeyRaw = Deno.env.get(
  "FENSAK_TEST_COMMITTER_GITHUB_APP_PRIVATE_KEY",
);
if (!testCommitterPrivateKeyRaw) {
  throw new Error(
    "FENSAK_TEST_COMMITTER_GITHUB_APP_PRIVATE_KEY is required for integration testing",
  );
}
const testCommitterPrivateKeyBytes = base64.decode(testCommitterPrivateKeyRaw);
const testCommitterPrivateKey = new TextDecoder().decode(
  testCommitterPrivateKeyBytes,
);

const testCommitterAppIDRaw = Deno.env.get(
  "FENSAK_TEST_COMMITTER_GITHUB_APP_ID",
);
if (!testCommitterAppIDRaw) {
  throw new Error(
    "FENSAK_TEST_COMMITTER_GITHUB_APP_ID is required for integration testing",
  );
}
const testCommitterAppID = parseInt(testCommitterAppIDRaw);

const testCommitterInstIDRaw = Deno.env.get(
  "FENSAK_TEST_COMMITTER_GITHUB_APP_INSTID",
);
if (!testCommitterInstIDRaw) {
  throw new Error(
    "FENSAK_TEST_COMMITTER_GITHUB_INSTID is required for integration testing",
  );
}
const testCommitterInstID = parseInt(testCommitterInstIDRaw);

const stagingAppIDRaw = Deno.env.get(
  "FENSAK_STAGING_GITHUB_APP_ID",
);
if (!stagingAppIDRaw) {
  throw new Error(
    "FENSAK_STAGING_GITHUB_APP_ID is required for integration testing",
  );
}
const stagingAppID = parseInt(stagingAppIDRaw);

const testCommitterAuthCfg = {
  appId: testCommitterAppID,
  privateKey: testCommitterPrivateKey,
  installationId: testCommitterInstID,
};
const testCommitterOctokit = new Octokit({
  authStrategy: octokitCreateAppAuth,
  auth: testCommitterAuthCfg,
});

/**
 * end global constants
 */

Deno.test("auto-approve happy path for README update", async (t) => {
  const repoName = "test-fensak-automated-readme-only";
  const branchName = `test/update-readme-${getRandomString(6)}`;
  const defaultBranchName = "main";
  let prNum = 0;

  await t.step("create branch", async () => {
    await createBranchFromDefault(
      testCommitterOctokit,
      testOrg,
      repoName,
      branchName,
    );
  });

  await t.step("commit update to README and open PR", async () => {
    await commitFileUpdateToBranch(
      testCommitterOctokit,
      testOrg,
      repoName,
      branchName,
      "README.md",
      "# README",
    );

    const { data: pullRequest } = await testCommitterOctokit.pulls.create({
      owner: testOrg,
      repo: repoName,
      head: branchName,
      base: defaultBranchName,
      title: "[automated-staging-test] Auto-approve happy path for README",
    });
    prNum = pullRequest.number;
  });

  await t.step("validate checks from Fensak Staging", async () => {
    const checkRun = await waitForFensakStagingCheck(
      testCommitterOctokit,
      testOrg,
      repoName,
      branchName,
    );
    assertEquals(checkRun.conclusion, "success");
  });

  await t.step("[cleanup] close PR", async () => {
    if (prNum) {
      await testCommitterOctokit.pulls.update({
        owner: testOrg,
        repo: repoName,
        pull_number: prNum,
        state: "closed",
      });
    }
  });

  await t.step("[cleanup] delete branch", async () => {
    await deleteBranch(
      testCommitterOctokit,
      testOrg,
      repoName,
      branchName,
    );
  });
});

/**
 * Wait for the Fensak Staging check to show up on the head commit of the given branch. This will timeout after 1
 * minute.
 */
async function waitForFensakStagingCheck(
  octokit: Octokit,
  owner: string,
  repoName: string,
  branchName: string,
): Promise<GitHubCheckRun> {
  const maxRetries = 60;
  const sleepBetweenRetries = 1000;

  const headSHA = await getHeadSHA(octokit, owner, repoName, branchName);
  for (let i = 0; i < maxRetries; i++) {
    const { data: checks } = await octokit.checks.listForRef({
      owner: owner,
      repo: repoName,
      ref: headSHA,
      app_id: stagingAppID,
      check_name: "smart review",
    });
    if (checks.total_count > 0 && checks.check_runs[0].status === "completed") {
      return checks.check_runs[0];
    }

    console.debug(
      `Fensak Staging check hasn't run yet on head commit on branch ${branchName} in ${owner}/${repoName}. Retrying after 1 second delay.`,
    );
    await sleep(sleepBetweenRetries);
  }

  throw new Error(
    `Timed out waiting for Fensak Staging check to complete on branch ${branchName} in ${owner}/${repoName}.`,
  );
}

function sleep(time: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, time));
}

/**
 * Get a random string of length s.
 */
function getRandomString(s: number) {
  if (s % 2 == 1) {
    throw new Deno.errors.InvalidData("Only even sizes are supported");
  }
  const buf = new Uint8Array(s / 2);
  crypto.getRandomValues(buf);
  let ret = "";
  for (let i = 0; i < buf.length; ++i) {
    ret += ("0" + buf[i].toString(16)).slice(-2);
  }
  return ret;
}
