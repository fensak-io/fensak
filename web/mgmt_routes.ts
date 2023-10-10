// Copyright (c) Fensak, LLC.
// SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

import { config, Context, oakCors, Octokit, Router, Status } from "../deps.ts";

import * as middlewares from "../middlewares/mod.ts";
import {
  filterAllowedGitHubOrgsForAuthenticatedUser,
  handleSubscriptionEvent,
} from "../mgmt/mod.ts";
import { getSubscription } from "../svcdata/mod.ts";

const corsOrigins = config.get("managementAPI.allowedCORSOrigins");

export function attachMgmtAPIRoutes(router: Router): void {
  const corsMW = oakCors({ origin: corsOrigins });

  router
    .post(
      "/hooks/mgmt",
      middlewares.assertMgmtEvent,
      handleMgmtEvent,
    )
    .options("/api/v1/organizations", corsMW)
    .get(
      "/api/v1/organizations",
      corsMW,
      middlewares.assertMgmtAPIToken,
      handleGetOrganizations,
    );
}

async function handleGetOrganizations(ctx: Context): Promise<void> {
  interface APIOrganization {
    slug: string;
    app_is_installed: boolean;
    subscription: APISubscription | null;
    is_main_org: boolean;
  }
  interface APISubscription {
    id: string;
    main_org_name: string;
  }

  const token = ctx.state.apiToken;
  const octokit = new Octokit({ auth: token });
  const slugs = ctx.request.url.searchParams.getAll("slugs");
  const allowedOrgs = await filterAllowedGitHubOrgsForAuthenticatedUser(
    octokit,
    slugs,
  );

  // Marshal the allowed orgs list for the API. This primarily handles pulling in the subscription object.
  const outData: APIOrganization[] = [];
  for (const o of allowedOrgs) {
    let subscription: APISubscription | null = null;
    let isMainOrg = false;
    if (o.subscription_id) {
      const maybeSubscription = await getSubscription(o.subscription_id);
      if (maybeSubscription.value) {
        subscription = {
          id: maybeSubscription.value.id,
          main_org_name: maybeSubscription.value.mainOrgName,
        };
        if (subscription.main_org_name == o.slug) {
          isMainOrg = true;
        }
      }
    }
    outData.push({
      slug: o.slug,
      app_is_installed: o.app_is_installed,
      subscription: subscription,
      is_main_org: isMainOrg,
    });
  }

  const out = {
    data: outData,
  };

  ctx.response.status = Status.OK;
  ctx.response.body = out;
}

async function handleMgmtEvent(ctx: Context): Promise<void> {
  const body = ctx.request.body({ type: "json" });
  const payload = await body.value;
  await handleSubscriptionEvent(payload);

  ctx.response.status = Status.NoContent;
}
