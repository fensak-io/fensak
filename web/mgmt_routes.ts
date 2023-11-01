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
  filterAllowedBitBucketWorkspacesForAuthenticatedUser,
  filterAllowedGitHubOrgsForAuthenticatedUser,
  getWorkspacePermissionLookup,
  handleSubscriptionEvent,
} from "../mgmt/mod.ts";
import type { Account } from "../mgmt/mod.ts";
import {
  enqueueMsg,
  FensakConfigSource,
  getComputedFensakConfig,
  getSubscription,
  MessageType,
  mustGetBitBucketWorkspaceWithSubscription,
  mustGetGitHubOrgWithSubscription,
  waitForHealthCheckResult,
} from "../svcdata/mod.ts";
import type {
  BitBucketWorkspaceWithSubscription,
  GitHubOrgWithSubscription,
} from "../svcdata/mod.ts";
import { isOrgManager } from "../ghstd/mod.ts";

interface APIAccount {
  source: "github" | "bitbucket";
  slug: string;
  app_is_installed: boolean;
  dotfensak_ready: boolean;
  subscription: APISubscription | null;
  is_main_account: boolean;
}
interface APISubscription {
  id: string;
  main_account_source: "github" | "bitbucket";
  main_account_name: string;
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
    .options("/api/v1/accounts", corsMW)
    .get(
      "/api/v1/accounts",
      corsMW,
      middlewares.assertMgmtAPIToken,
      handleGetAccounts,
    )
    .options("/api/v1/accounts/:acctid", corsMW)
    .get(
      "/api/v1/accounts/:acctid",
      corsMW,
      middlewares.assertMgmtAPIToken,
      handleGetOneAccount,
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

async function handleGetAccounts(ctx: Context): Promise<void> {
  const token = ctx.state.apiToken;
  const slugs = ctx.request.url.searchParams.getAll("slugs");
  let allowedAccounts: Account[];
  switch (ctx.state.apiTokenSource) {
    default:
      throw new Error(
        `Unknown mgmt api token source ${ctx.state.apiTokenSource}`,
      );

    case middlewares.APITokenSource.GitHub: {
      const octokit = new Octokit({ auth: token });
      allowedAccounts = await filterAllowedGitHubOrgsForAuthenticatedUser(
        octokit,
        slugs,
      );
      break;
    }

    case middlewares.APITokenSource.BitBucket: {
      allowedAccounts =
        await filterAllowedBitBucketWorkspacesForAuthenticatedUser(
          token,
          slugs,
        );
    }
  }

  // Marshal the allowed orgs list for the API. This primarily handles pulling in the subscription object.
  const outData: APIAccount[] = [];
  for (const ows of allowedAccounts) {
    let subscription: APISubscription | null = null;
    let isMainAccount = false;
    if (ows.subscription_id) {
      const maybeSubscription = await getSubscription(ows.subscription_id);
      if (maybeSubscription.value) {
        subscription = {
          id: maybeSubscription.value.id,
          main_account_source: maybeSubscription.value.mainOrgSource ||
            ows.source,
          main_account_name: maybeSubscription.value.mainOrgName,
          plan_name: maybeSubscription.value.planName,
          cancelled_at: maybeSubscription.value.cancelledAt,
        };
        if (subscription.main_account_name == ows.slug) {
          isMainAccount = true;
        }
      }
    }
    outData.push({
      source: ows.source,
      slug: ows.slug,
      app_is_installed: ows.app_is_installed,
      dotfensak_ready: ows.dotfensak_ready,
      subscription: subscription,
      is_main_account: isMainAccount,
    });
  }

  ctx.response.status = Status.OK;
  ctx.response.body = { data: outData };
}

async function handleGetOneAccount(
  // deno-lint-ignore no-explicit-any
  ctx: RouterContext<string, RouteParams<string>, any>,
): Promise<void> {
  const token = ctx.state.apiToken;
  switch (ctx.state.apiTokenSource) {
    default:
      throw new Error(
        `Unknown mgmt api token source ${ctx.state.apiTokenSource}`,
      );

    case middlewares.APITokenSource.GitHub: {
      let ghorg: GitHubOrgWithSubscription;
      try {
        ghorg = await mustGetGitHubOrgWithSubscription(ctx.params.acctid);
      } catch (_e) {
        ctx.response.status = Status.NotFound;
        return;
      }

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
      let isMainAccount = false;
      if (ghorg.subscription) {
        apis = {
          id: ghorg.subscription.id,
          main_account_source: "github",
          main_account_name: ghorg.subscription.mainOrgName,
          plan_name: ghorg.subscription.planName,
          cancelled_at: ghorg.subscription.cancelledAt,
        };
        isMainAccount = ghorg.name == ghorg.subscription.mainOrgName;
      }
      const apia: APIAccount = {
        source: "github",
        slug: ghorg.name,
        app_is_installed: ghorg.installationID != null,
        dotfensak_ready: maybeCfg != null,
        subscription: apis,
        is_main_account: isMainAccount,
      };
      ctx.response.status = Status.OK;
      ctx.response.body = { data: apia };
      break;
    }

    case middlewares.APITokenSource.BitBucket: {
      let ws: BitBucketWorkspaceWithSubscription;
      try {
        ws = await mustGetBitBucketWorkspaceWithSubscription(ctx.params.acctid);
      } catch (_e) {
        ctx.response.status = Status.NotFound;
        return;
      }

      const wsl = await getWorkspacePermissionLookup(token);
      const perm = wsl[ws.name];
      if (perm !== "owner") {
        ctx.response.status = Status.NotFound;
        return;
      }

      const maybeCfg = await getComputedFensakConfig(
        FensakConfigSource.BitBucket,
        ws.name,
      );

      let apis: APISubscription | null = null;
      let isMainAccount = false;
      if (ws.subscription) {
        apis = {
          id: ws.subscription.id,
          main_account_source: "bitbucket",
          main_account_name: ws.subscription.mainOrgName,
          plan_name: ws.subscription.planName,
          cancelled_at: ws.subscription.cancelledAt,
        };
        isMainAccount = ws.name == ws.subscription.mainOrgName;
      }
      const apia: APIAccount = {
        source: "bitbucket",
        slug: ws.name,
        app_is_installed: ws.securityContext != null,
        dotfensak_ready: maybeCfg != null,
        subscription: apis,
        is_main_account: isMainAccount,
      };
      ctx.response.status = Status.OK;
      ctx.response.body = { data: apia };
      break;
    }
  }
}

async function handleMgmtEvent(ctx: Context): Promise<void> {
  const body = ctx.request.body({ type: "json" });
  const payload = await body.value;
  await handleSubscriptionEvent(payload);

  ctx.response.status = Status.NoContent;
}
