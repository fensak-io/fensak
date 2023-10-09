// Copyright (c) Fensak, LLC.
// SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

import { config, Context, Status } from "../deps.ts";
import type { Middleware, Next } from "../deps.ts";

import { octokitFromOauthApp } from "../ghauth/mod.ts";
import { logger } from "../logging/mod.ts";

const githubOauthClientID = config.get("github.oauthApp.clientID");

export enum APITokenSource {
  GitHub = 0,
}

export const assertAPIToken: Middleware = async (
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
  ctx.state.apiTokenSource = APITokenSource.GitHub;

  await next();
};

function returnUnauthorizedResp(ctx: Context): void {
  const respStatus = Status.Forbidden;
  ctx.response.status = respStatus;
  ctx.response.body = {
    status: respStatus,
    msg: "Unauthorized.",
  };
}
