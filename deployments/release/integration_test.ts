// Copyright (c) Fensak, LLC.
// SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

/**
 * Integration test suite.
 * This test suite is intended to target the staging environment by making commits and PRs on `fensak-test` and
 * verifying the resulting checks.
 *
 * This suite is meant to run on PRs to the `release` branch, prior to deployment to prod.
 */

import { assertEquals } from "../../test_deps.ts";
import {
  base64,
  GitHubComponents,
  Octokit,
  octokitCreateAppAuth,
} from "../../deps.ts";

import {
  commitFileUpdateToBranch,
  createBranchFromDefault,
  deleteBranch,
  getHeadSHA,
} from "../../ghstd/mod.ts";
import { getRandomString, sleep } from "../../xtd/mod.ts";

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

const stagingAppIDRaw = Deno.env.get("FENSAK_STAGING_GITHUB_APP_ID");
if (!stagingAppIDRaw) {
  throw new Error(
    "FENSAK_STAGING_GITHUB_APP_ID is required for integration testing",
  );
}
const stagingAppID = parseInt(stagingAppIDRaw);

const fensakOpsUserToken = Deno.env.get("FENSAK_TEST_OPS_USER_API_KEY");
if (!fensakOpsUserToken) {
  throw new Error(
    "FENSAK_TEST_OPS_USER_API_KEY is required for integration testing",
  );
}
const fensakOpsUserOctokit = new Octokit({ auth: fensakOpsUserToken });

const fensakOpsAdminToken = Deno.env.get("FENSAK_TEST_ADMIN_USER_API_KEY");
if (!fensakOpsAdminToken) {
  throw new Error(
    "FENSAK_TEST_ADMIN_USER_API_KEY is required for integration testing",
  );
}
const fensakOpsAdminOctokit = new Octokit({ auth: fensakOpsAdminToken });

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
    expectCheckConclusion(checkRun, "success");
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

Deno.test("manual review required for config update", async (t) => {
  const repoName = "test-fensak-automated-readme-only";
  const branchName = `test/update-config-${getRandomString(6)}`;
  const defaultBranchName = "main";
  const previousCheckRuns: number[] = [];
  let prNum = 0;

  await t.step("create branch", async () => {
    await createBranchFromDefault(
      testCommitterOctokit,
      testOrg,
      repoName,
      branchName,
    );
  });

  await t.step("commit update to conf.json and open PR", async () => {
    await commitFileUpdateToBranch(
      testCommitterOctokit,
      testOrg,
      repoName,
      branchName,
      "conf.json",
      '{\n  "my-config": false\n}',
    );

    const { data: pullRequest } = await testCommitterOctokit.pulls.create({
      owner: testOrg,
      repo: repoName,
      head: branchName,
      base: defaultBranchName,
      title:
        "[automated-staging-test] Manual review required for conf.json update",
    });
    prNum = pullRequest.number;
  });

  await t.step("validate check failed from Fensak Staging", async () => {
    const checkRun = await waitForFensakStagingCheck(
      testCommitterOctokit,
      testOrg,
      repoName,
      branchName,
      previousCheckRuns,
    );
    previousCheckRuns.push(checkRun.id);
    expectCheckConclusion(checkRun, "action_required");
  });

  await t.step(
    "approve with untrusted user and validate check failed from Fensak Staging",
    async () => {
      await approvePR(
        fensakOpsUserOctokit,
        testOrg,
        repoName,
        prNum,
      );

      const checkRun = await waitForFensakStagingCheck(
        testCommitterOctokit,
        testOrg,
        repoName,
        branchName,
        previousCheckRuns,
      );
      previousCheckRuns.push(checkRun.id);
      expectCheckConclusion(checkRun, "action_required");
    },
  );

  await t.step(
    "approve with trusted user and validate check passes from Fensak Staging",
    async () => {
      await approvePR(
        fensakOpsAdminOctokit,
        testOrg,
        repoName,
        prNum,
      );

      const checkRun = await waitForFensakStagingCheck(
        testCommitterOctokit,
        testOrg,
        repoName,
        branchName,
        previousCheckRuns,
      );
      previousCheckRuns.push(checkRun.id);
      expectCheckConclusion(checkRun, "success");
    },
  );

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

Deno.test("failed required rule fails check", async (t) => {
  const repoName = "test-fensak-automated-appdeploy";
  const branchName = `test/update-config-${getRandomString(6)}`;
  const defaultBranchName = "main";
  const previousCheckRuns: number[] = [];
  let prNum = 0;

  await t.step("create branch", async () => {
    await createBranchFromDefault(
      testCommitterOctokit,
      testOrg,
      repoName,
      branchName,
    );
  });

  await t.step("commit update to appversions.json and open PR", async () => {
    await commitFileUpdateToBranch(
      testCommitterOctokit,
      testOrg,
      repoName,
      branchName,
      "appversions.json",
      '{\n  "coreapp": "v0.1.0",\n  "subapp": "v1.2.0",\n  "logapp": "v100.1.0"\n}',
    );

    const { data: pullRequest } = await testCommitterOctokit.pulls.create({
      owner: testOrg,
      repo: repoName,
      head: branchName,
      base: defaultBranchName,
      title: "[automated-staging-test] Failed required review fails check",
    });
    prNum = pullRequest.number;
  });

  await t.step("validate check failed from Fensak Staging", async () => {
    const checkRun = await waitForFensakStagingCheck(
      testCommitterOctokit,
      testOrg,
      repoName,
      branchName,
      previousCheckRuns,
    );
    previousCheckRuns.push(checkRun.id);
    expectCheckConclusion(checkRun, "action_required");
  });

  await t.step(
    "approve with trusted user and validate check still fails from Fensak Staging",
    async () => {
      await approvePR(
        fensakOpsAdminOctokit,
        testOrg,
        repoName,
        prNum,
      );

      const checkRun = await waitForFensakStagingCheck(
        testCommitterOctokit,
        testOrg,
        repoName,
        branchName,
        previousCheckRuns,
      );
      previousCheckRuns.push(checkRun.id);
      expectCheckConclusion(checkRun, "action_required");
    },
  );

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

Deno.test("passed required rule and passed automerge passes check", async (t) => {
  const repoName = "test-fensak-automated-appdeploy";
  const branchName = `feature/update-config-${getRandomString(6)}`;
  const defaultBranchName = "main";
  const previousCheckRuns: number[] = [];
  let prNum = 0;

  await t.step("create branch", async () => {
    await createBranchFromDefault(
      testCommitterOctokit,
      testOrg,
      repoName,
      branchName,
    );
  });

  await t.step("commit update to appversions.json and open PR", async () => {
    await commitFileUpdateToBranch(
      testCommitterOctokit,
      testOrg,
      repoName,
      branchName,
      "appversions.json",
      '{\n  "coreapp": "v0.1.0",\n  "subapp": "v1.2.0",\n  "logapp": "v100.1.0"\n}\n',
    );

    const { data: pullRequest } = await testCommitterOctokit.pulls.create({
      owner: testOrg,
      repo: repoName,
      head: branchName,
      base: defaultBranchName,
      title:
        "[automated-staging-test] Passed required rule can pass automerge check",
    });
    prNum = pullRequest.number;
  });

  await t.step("validate check passed from Fensak Staging", async () => {
    const checkRun = await waitForFensakStagingCheck(
      testCommitterOctokit,
      testOrg,
      repoName,
      branchName,
      previousCheckRuns,
    );
    previousCheckRuns.push(checkRun.id);
    expectCheckConclusion(checkRun, "success");
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

Deno.test("passed required rule and failed automerge requires review", async (t) => {
  const repoName = "test-fensak-automated-appdeploy";
  const branchName = `feature/update-config-${getRandomString(6)}`;
  const defaultBranchName = "main";
  const previousCheckRuns: number[] = [];
  let prNum = 0;

  await t.step("create branch", async () => {
    await createBranchFromDefault(
      testCommitterOctokit,
      testOrg,
      repoName,
      branchName,
    );
  });

  await t.step("commit update to appversions.json and open PR", async () => {
    await commitFileUpdateToBranch(
      testCommitterOctokit,
      testOrg,
      repoName,
      branchName,
      "appversions.json",
      '{\n  "coreapp": "v0.2.0",\n  "subapp": "v1.1.0",\n  "logapp": "v100.1.0"\n}',
    );

    const { data: pullRequest } = await testCommitterOctokit.pulls.create({
      owner: testOrg,
      repo: repoName,
      head: branchName,
      base: defaultBranchName,
      title:
        "[automated-staging-test] Passed required rule but failed automerge check requires reviews",
    });
    prNum = pullRequest.number;
  });

  await t.step("validate check failed from Fensak Staging", async () => {
    const checkRun = await waitForFensakStagingCheck(
      testCommitterOctokit,
      testOrg,
      repoName,
      branchName,
      previousCheckRuns,
    );
    previousCheckRuns.push(checkRun.id);
    expectCheckConclusion(checkRun, "action_required");
  });

  await t.step(
    "approve with trusted user and validate check still passes from Fensak Staging",
    async () => {
      await approvePR(
        fensakOpsAdminOctokit,
        testOrg,
        repoName,
        prNum,
      );

      const checkRun = await waitForFensakStagingCheck(
        testCommitterOctokit,
        testOrg,
        repoName,
        branchName,
        previousCheckRuns,
      );
      previousCheckRuns.push(checkRun.id);
      expectCheckConclusion(checkRun, "success");
    },
  );

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
 * Wait for the Fensak Staging check to show up on the head commit of the given branch. This will timeout after
 * 3 minutes. 3 minutes feels very long, but unfortunately sometimes GitHub has significant delays in the webhooks so it
 * makes sense to wait that long.
 */
async function waitForFensakStagingCheck(
  octokit: Octokit,
  owner: string,
  repoName: string,
  branchName: string,
  previousCheckRuns?: number[],
): Promise<GitHubCheckRun> {
  const maxRetries = 60;
  const sleepBetweenRetries = 3000;

  const headSHA = await getHeadSHA(octokit, owner, repoName, branchName);
  for (let i = 0; i < maxRetries; i++) {
    const { data: checks } = await octokit.checks.listForRef({
      owner: owner,
      repo: repoName,
      ref: headSHA,
      app_id: stagingAppID,
      check_name: "smart review",
      filter: "latest",
    });
    const checksToConsider = [];
    for (const c of checks.check_runs) {
      if (previousCheckRuns && previousCheckRuns.includes(c.id)) {
        // ignore checks that ran before
        continue;
      }

      checksToConsider.push(c);
    }

    if (
      checksToConsider.length === 1 &&
      checksToConsider[0].status === "completed"
    ) {
      return checksToConsider[0];
    } else if (checksToConsider.length > 1) {
      throw new Error(
        `Unexpectedly found more than one check for Fensak Staging on commit ${headSHA} in ${owner}/${repoName}`,
      );
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

/**
 * Approve PR as the authenticated user.
 */
async function approvePR(
  octokit: Octokit,
  owner: string,
  repoName: string,
  prNum: number,
): Promise<void> {
  await octokit.pulls.createReview({
    owner: owner,
    repo: repoName,
    pull_number: prNum,
    event: "APPROVE",
  });
}

function expectCheckConclusion(
  checkRun: GitHubCheckRun,
  expectedConclusion: string,
): void {
  assertEquals(
    checkRun.conclusion,
    expectedConclusion,
    `Unexpected check conclusion ${checkRun.conclusion}:\n${checkRun.output.title}\n${checkRun.output.summary}\n${checkRun.output.text}`,
  );
}
