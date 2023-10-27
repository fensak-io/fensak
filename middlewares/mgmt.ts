// Copyright (c) Fensak, LLC.
// SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

import { config, Context, Status } from "../deps.ts";
import type { Middleware, Next } from "../deps.ts";

import { octokitFromOauthApp } from "../ghauth/mod.ts";
import { verifyMgmtEvent } from "../mgmt/mod.ts";
import { logger } from "../logging/mod.ts";

import { returnUnauthorizedResp } from "./common_resps.ts";

const githubOauthClientID = config.get("github.oauthApp.clientID");

export enum APITokenSource {
  GitHub = 0,
}

export const assertMgmtEvent: Middleware = async (
  ctx: Context,
  next: Next,
): Promise<void> => {
  const fskSig = ctx.request.headers.get("X-Fsk-Signature-256");
  if (fskSig == null) {
    returnInvalidFskEventHook(ctx);
    return;
  }

  const body = ctx.request.body({ type: "text" });
  const bodyText = await body.value;
  const isValid = await verifyMgmtEvent(bodyText, fskSig);
  if (!isValid) {
    returnInvalidFskEventHook(ctx);
    return;
  }

  await next();
};

export const assertMgmtAPIToken: Middleware = async (
  ctx: Context,
  next: Next,
): Promise<void> => {
  const auth = ctx.request.headers.get("Authorization");
  if (!auth || !auth.startsWith("Bearer ")) {
    logger.debug(`Authorization header missing or is not bearer`);
    returnUnauthorizedResp(ctx);
    return;
  }

  const token = auth.replace(/^Bearer /, "");
  if (!token.startsWith("gho_")) {
    logger.debug("API token doesn't start with gho");
    returnUnauthorizedResp(ctx);
    return;
  }

  const octokit = octokitFromOauthApp();
  let resp;
  try {
    resp = await octokit.apps.checkToken({
      client_id: githubOauthClientID,
      access_token: token,
    });
  } catch (e) {
    logger.debug(`Error checking token: ${e}`);
    returnUnauthorizedResp(ctx);
    return;
  }
  if (!resp.data.user) {
    logger.debug("Token data doesn't have a user");
    returnUnauthorizedResp(ctx);
    return;
  }

  ctx.state.apiAuthedUser = resp.data.user.login;
  ctx.state.apiToken = token;
  ctx.state.apiTokenSource = APITokenSource.GitHub;

  await next();
};

function returnInvalidFskEventHook(ctx: Context): void {
  const respStatus = Status.Forbidden;
  ctx.response.status = respStatus;
  ctx.response.body = {
    status: respStatus,
    msg: "Could not verify fensak signature.",
  };
}
