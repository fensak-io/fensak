// Copyright (c) Fensak, LLC.
// SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

import { Octokit } from "../deps.ts";

/**
 * Checks whether the given GitHub user has the ability to manage the given Org.
 */
export async function isOrgManager(
  octokit: Octokit,
  user: string,
  org: string,
): Promise<boolean> {
  try {
    const { data } = await octokit.orgs.getMembershipForUser({
      org: org,
      username: user,
    });
    return data.role === "admin";
  } catch (_e) {
    // TODO: make sure it is 404
    return false;
  }
}
