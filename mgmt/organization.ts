// Copyright (c) Fensak, LLC.
// SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

import { Octokit } from "../deps.ts";

import { getGitHubOrgRecord } from "../svcdata/mod.ts";
import { isOrgManager } from "../ghstd/mod.ts";

export interface Organization {
  slug: string;
  app_is_installed: boolean;
  subscription_id: string | null;
}

/**
 * Filters down the given GitHub Orgs (identified by slug) based on whether the authenticated user of the Octokit client
 * is an admin of the org.
 */
export async function filterAllowedGitHubOrgsForAuthenticatedUser(
  octokit: Octokit,
  slugs: string[],
): Promise<Organization[]> {
  const orgData = await Promise.all(slugs.map((sl) => getGitHubOrgRecord(sl)));
  const allowedOrgs = await Promise.all(
    orgData.map(async (od): Promise<Organization | null> => {
      if (od.value == null) {
        return null;
      }

      const isAllowed = await isOrgManager(octokit, od.value.name);
      if (!isAllowed) {
        return null;
      }

      return {
        slug: od.value.name,
        app_is_installed: od.value.installationID != null,
        subscription_id: od.value.subscriptionID,
      };
    }),
  );
  const out: Organization[] = [];
  for (const o of allowedOrgs) {
    if (!o) {
      continue;
    }
    out.push(o);
  }
  return out;
}
