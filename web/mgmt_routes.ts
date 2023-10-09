// Copyright (c) Fensak, LLC.
// SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

import { config, Context, oakCors, Router, Status } from "../deps.ts";

import * as middlewares from "../middlewares/mod.ts";
import { filterAllowedOrgsForUser } from "../mgmt/mod.ts";

const corsOrigins = config.get("managementAPI.allowedCORSOrigins");

export function attachMgmtAPIRoutes(router: Router): void {
  const corsMW = oakCors({ origin: corsOrigins });

  router
    .options("/api/v1/organizations", corsMW)
    .get(
      "/api/v1/organizations",
      corsMW,
      middlewares.assertAPIToken,
      handleGetOrganizations,
    );
}

async function handleGetOrganizations(ctx: Context): Promise<void> {
  const authedUser = ctx.state.apiAuthedUser;
  const slugs = ctx.request.url.searchParams.getAll("slugs");

  const out = {
    data: await filterAllowedOrgsForUser(authedUser, slugs),
  };

  ctx.response.status = Status.OK;
  ctx.response.body = out;
}
