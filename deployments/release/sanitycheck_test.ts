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

Deno.test("sanity check fensak-stage on Deno Deploy is up to date", async () => {
  await waitForDenoDeploy(fensakAdminOctokit);

  const respNotFound = await fetch(
    "https://fensak-stage.deno.dev/route-does-not-exist",
  );
  assertEquals(respNotFound.status, Status.NotFound);

  const resp = await fetch("https://fensak-stage.deno.dev/healthz");
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
    const { data: deps } = await octokit.repos.listDeployments({
      owner: fensakOrg,
      repo: fensakRepo,
      sha: headSHA,
    });
    let fensakStageDeployment;
    for (const d of deps) {
      if (typeof d.payload === "string") {
        continue;
      }

      if (
        d.payload.project_name === "fensak-stage" &&
        d.environment === "Production"
      ) {
        fensakStageDeployment = d;
        break;
      }
    }
    if (fensakStageDeployment) {
      const { data: statuses } = await octokit.repos.listDeploymentStatuses({
        owner: fensakOrg,
        repo: fensakRepo,
        deployment_id: fensakStageDeployment.id,
      });
      // ASSUMPTION
      // The returned statuses is sorted by newest first, so we just check the first one.
      // If it is successful, then the environment is deployed.
      if (statuses.length > 0 && statuses[0].state === "success") {
        return;
      }
    }

    console.debug(
      `Deno Deploy fensak-stage hasn't run yet on head commit on branch ${fensakRepoDefaultBranch} in ${fensakOrg}/${fensakRepo}. Retrying after 1 second delay.`,
    );
    await sleep(sleepBetweenRetries);
  }

  throw new Error(
    `Timed out waiting for Deno Deploy fensak-stage check to complete on branch ${fensakRepoDefaultBranch} in ${fensakOrg}/${fensakRepo}.`,
  );
}
