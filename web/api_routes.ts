// Copyright (c) Fensak, LLC.
// SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

import { Context, Router, Status } from "../deps.ts";

import type { Organization } from "../apidata/mod.ts";
import * as middlewares from "../middlewares/mod.ts";
import { getGitHubOrgRecord } from "../svcdata/mod.ts";
import { octokitFromInstallation } from "../ghauth/mod.ts";
import { isOrgManager } from "../ghstd/mod.ts";

export function attachAPIRoutes(router: Router): void {
  router
    .get(
      "/api/v1/organizations",
      middlewares.assertAPIToken,
      handleGetOrganizations,
    );
}

async function handleGetOrganizations(ctx: Context): Promise<void> {
  interface respType {
    data: Organization[];
  }

  const authedUser = ctx.state.apiAuthedUser;
  const slugs = ctx.request.url.searchParams.getAll("slugs");

  const out: respType = { data: [] };
  const orgData = await Promise.all(slugs.map((sl) => getGitHubOrgRecord(sl)));
  const allowedOrgs = await Promise.all(
    orgData.map(async (od): Promise<Organization | null> => {
      if (od.value == null || od.value.installationID == null) {
        return null;
      }

      const clt = octokitFromInstallation(od.value.installationID);
      const isAllowed = await isOrgManager(clt, authedUser, od.value.name);
      if (!isAllowed) {
        return null;
      }

      return {
        slug: od.value.name,
        subscription_id: od.value.name,
      };
    }),
  );
  for (const o of allowedOrgs) {
    if (!o) {
      continue;
    }
    out.data.push(o);
  }

  ctx.response.status = Status.OK;
  ctx.response.body = out;
}
