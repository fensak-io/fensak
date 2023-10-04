// Copyright (c) Fensak, LLC.
// SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

/**
 * Release sanity check test suite.
 * This test suite is intended to run checks against github that are easier to write in Deno than in bash.
 *
 * This suite is meant to run on PRs to the `release` branch, prior to deployment to prod.
 */

import { assertEquals } from "../../test_deps.ts";
import { Octokit, Status } from "../../deps.ts";

import { getHeadSHA } from "../../ghstd/mod.ts";
import { sleep } from "../../xtd/mod.ts";

const fensakOrg = "fensak-io";
const fensakRepo = "fensak";
const fensakRepoDefaultBranch = "main";
const fensakAdminToken = Deno.env.get("FENSAK_GITHUB_TOKEN");
if (!fensakAdminToken) {
  throw new Error(
    "FENSAK_GITHUB_TOKEN is required for release sanity check testing",
  );
}
const fensakAdminOctokit = new Octokit({ auth: fensakAdminToken });

Deno.test("sanity check fensak-stage on Deno Deploy is up to date and healthy", async () => {
  await waitForDenoDeploy(fensakAdminOctokit);

  const respNotFound = await fetch(
    "https://fensak-stage.deno.dev/route-does-not-exist",
  );
  if (respNotFound.body) {
    await respNotFound.body.cancel();
  }
  assertEquals(respNotFound.status, Status.NotFound);

  const resp = await fetch("https://fensak-stage.deno.dev/healthz");
  if (resp.body) {
    await resp.body.cancel();
  }
  assertEquals(resp.status, Status.OK);
});

/**
 * Wait for the Deno Deploy check for deploying fensak-stage to show up on the head commit of the main branch. This
 * will timeout after 1 minute.
 */
async function waitForDenoDeploy(octokit: Octokit): Promise<void> {
  const maxRetries = 60;
  const sleepBetweenRetries = 1000;

  const headSHA = await getHeadSHA(
    octokit,
    fensakOrg,
    fensakRepo,
    fensakRepoDefaultBranch,
  );
  for (let i = 0; i < maxRetries; i++) {
    const { data: checks } = await octokit.checks.listForRef({
      owner: fensakOrg,
      repo: fensakRepo,
      ref: headSHA,
      check_name: "deploystage",
      filter: "latest",
    });
    let stageDeploymentCheck;
    for (const c of checks.check_runs) {
      if (!c.app) {
        continue;
      }

      if (c.app.name === "GitHub Actions") {
        stageDeploymentCheck = c;
        break;
      }
    }
    if (stageDeploymentCheck && stageDeploymentCheck.conclusion === "success") {
      return;
    }

    console.debug(
      `Deploy fensak-stage job hasn't run yet on head commit on branch ${fensakRepoDefaultBranch} in ${fensakOrg}/${fensakRepo}. Retrying after 1 second delay.`,
    );
    await sleep(sleepBetweenRetries);
  }

  throw new Error(
    `Timed out waiting for Deno Deploy fensak-stage check to complete on branch ${fensakRepoDefaultBranch} in ${fensakOrg}/${fensakRepo}.`,
  );
}
