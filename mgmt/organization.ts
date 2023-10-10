// Copyright (c) Fensak, LLC.
// SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

import { getGitHubOrgRecord } from "../svcdata/mod.ts";
import { octokitFromInstallation } from "../ghauth/mod.ts";
import { isOrgManager } from "../ghstd/mod.ts";

export interface Organization {
  slug: string;
  subscription_id: string | null;
}

export async function filterAllowedOrgsForUser(
  user: string,
  slugs: string[],
): Promise<Organization[]> {
  const orgData = await Promise.all(slugs.map((sl) => getGitHubOrgRecord(sl)));
  const allowedOrgs = await Promise.all(
    orgData.map(async (od): Promise<Organization | null> => {
      if (od.value == null || od.value.installationID == null) {
        return null;
      }

      const clt = octokitFromInstallation(od.value.installationID);
      const isAllowed = await isOrgManager(clt, user, od.value.name);
      if (!isAllowed) {
        return null;
      }

      return {
        slug: od.value.name,
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
