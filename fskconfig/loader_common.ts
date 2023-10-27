// Copyright (c) Fensak, LLC.
// SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

import { config, path } from "../deps.ts";

import type {
  BitBucketWorkspaceWithSubscription,
  GitHubOrgWithSubscription,
} from "../svcdata/mod.ts";

import { FensakConfigLoaderUserError } from "./errors.ts";

const enforceSubscriptionPlan = config.get(
  "activeSubscriptionPlanRequired",
);
const planRepoLimits = config.get("planRepoLimits");

export interface ITreeFile {
  path: string;
  sha: string;
  size: number;
  mode?: string;
  type?: string;
  url?: string;
}

export interface IGitFileInfo {
  filename: string;
  gitSHA: string;
  size: number;
  url?: string;
}

/**
 * Get config file name and sha in the repo by walking the repository tree.
 */
export function getConfigFinfo(
  repoTreeLookup: Record<string, ITreeFile>,
): IGitFileInfo | null {
  for (const fpath in repoTreeLookup) {
    const fpathBase = path.basename(fpath);
    const fpathExt = path.extname(fpathBase);
    if (fpathBase === `fensak${fpathExt}`) {
      const finfo = repoTreeLookup[fpath];
      return {
        filename: fpath,
        gitSHA: finfo.sha,
        size: finfo.size,
        url: finfo.url,
      };
    }
  }
  return null;
}

export function validateRepoLimits(
  ghorgOrWS: GitHubOrgWithSubscription | BitBucketWorkspaceWithSubscription,
  configRepoCount: number,
): void {
  const noActiveSubErr = new FensakConfigLoaderUserError(
    `\`${ghorgOrWS.name}\` does not have an active Fensak subscription plan`,
  );

  if (!enforceSubscriptionPlan) {
    // Allowing unlimited repos since we aren't enforcing subscription plans.
    return;
  }
  if (ghorgOrWS.subscription == null) {
    throw noActiveSubErr;
  }

  let maybeLimit = planRepoLimits[ghorgOrWS.subscription.planName];
  if (!maybeLimit) {
    maybeLimit = planRepoLimits[""];
  }

  let existingRepoCount = 0;
  for (const k in ghorgOrWS.subscription.repoCount) {
    if (k !== ghorgOrWS.name) {
      existingRepoCount += ghorgOrWS.subscription.repoCount[k];
    }
  }
  const totalRepoCount = configRepoCount + existingRepoCount;
  if (totalRepoCount > maybeLimit) {
    throw new FensakConfigLoaderUserError(
      `the config file for \`${ghorgOrWS.name}\` exceeds or causes the org to exceed the repo limit for the org (limit is ${maybeLimit})`,
    );
  }
}
