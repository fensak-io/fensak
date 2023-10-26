// Copyright (c) Fensak, LLC.
// SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

import {
  config,
  Context,
  oakCors,
  Octokit,
  random,
  Router,
  Status,
} from "../deps.ts";
import type { RouteParams, RouterContext } from "../deps.ts";

import * as middlewares from "../middlewares/mod.ts";
import {
  filterAllowedGitHubOrgsForAuthenticatedUser,
  handleSubscriptionEvent,
} from "../mgmt/mod.ts";
import {
  enqueueMsg,
  FensakConfigSource,
  getComputedFensakConfig,
  getSubscription,
  MessageType,
  mustGetGitHubOrgWithSubscription,
  waitForHealthCheckResult,
} from "../svcdata/mod.ts";
import type { GitHubOrgWithSubscription } from "../svcdata/mod.ts";
import { isOrgManager } from "../ghstd/mod.ts";

interface APIOrganization {
  slug: string;
  app_is_installed: boolean;
  dotfensak_ready: boolean;
  subscription: APISubscription | null;
  is_main_org: boolean;
}
interface APISubscription {
  id: string;
  main_org_name: string;
  plan_name: string;
  cancelled_at: number;
}

const corsOrigins = config.get("managementAPI.allowedCORSOrigins");

export function attachMgmtAPIRoutes(router: Router): void {
  const corsMW = oakCors({ origin: corsOrigins });

  router
    .get("/healthz", healthCheck)
    .get("/sentry-test", testSentry)
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
    )
    .options("/api/v1/organizations/:orgid", corsMW)
    .get(
      "/api/v1/organizations/:orgid",
      corsMW,
      middlewares.assertMgmtAPIToken,
      handleGetOneOrganization,
    );
}

async function healthCheck(ctx: Context): Promise<void> {
  const requestID = random.getRandomString(6);
  await enqueueMsg({
    type: MessageType.HealthCheck,
    payload: {
      requestID: requestID,
    },
  });
  const result = await waitForHealthCheckResult(requestID);
  if (!result) {
    ctx.response.status = Status.InternalServerError;
    ctx.response.body = {
      status: Status.InternalServerError,
      msg: "timed out waiting for worker health result",
    };
    return;
  }

  ctx.response.status = Status.OK;
  ctx.response.body = {
    status: Status.OK,
    msg: "system ok",
  };
}

function testSentry(_ctx: Context): void {
  throw new Error("Test error to ensure sentry is working");
}

async function handleGetOrganizations(ctx: Context): Promise<void> {
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
          plan_name: maybeSubscription.value.planName,
          cancelled_at: maybeSubscription.value.cancelledAt,
        };
        if (subscription.main_org_name == o.slug) {
          isMainOrg = true;
        }
      }
    }
    outData.push({
      slug: o.slug,
      app_is_installed: o.app_is_installed,
      dotfensak_ready: o.dotfensak_ready,
      subscription: subscription,
      is_main_org: isMainOrg,
    });
  }

  ctx.response.status = Status.OK;
  ctx.response.body = { data: outData };
}

async function handleGetOneOrganization(
  // deno-lint-ignore no-explicit-any
  ctx: RouterContext<string, RouteParams<string>, any>,
): Promise<void> {
  let ghorg: GitHubOrgWithSubscription;
  try {
    ghorg = await mustGetGitHubOrgWithSubscription(ctx.params.orgid);
  } catch (_e) {
    ctx.response.status = Status.NotFound;
    return;
  }

  const token = ctx.state.apiToken;
  const octokit = new Octokit({ auth: token });
  const isAllowed = await isOrgManager(octokit, ghorg.name);
  if (!isAllowed) {
    ctx.response.status = Status.NotFound;
    return;
  }

  const maybeCfg = await getComputedFensakConfig(
    FensakConfigSource.GitHub,
    ghorg.name,
  );

  let apis: APISubscription | null = null;
  let isMainOrg = false;
  if (ghorg.subscription) {
    apis = {
      id: ghorg.subscription.id,
      main_org_name: ghorg.subscription.mainOrgName,
      plan_name: ghorg.subscription.planName,
      cancelled_at: ghorg.subscription.cancelledAt,
    };
    isMainOrg = ghorg.name == ghorg.subscription.mainOrgName;
  }
  const apio: APIOrganization = {
    slug: ghorg.name,
    app_is_installed: ghorg.installationID != null,
    dotfensak_ready: maybeCfg != null,
    subscription: apis,
    is_main_org: isMainOrg,
  };
  ctx.response.status = Status.OK;
  ctx.response.body = { data: apio };
}

async function handleMgmtEvent(ctx: Context): Promise<void> {
  const body = ctx.request.body({ type: "json" });
  const payload = await body.value;
  await handleSubscriptionEvent(payload);

  ctx.response.status = Status.NoContent;
}
