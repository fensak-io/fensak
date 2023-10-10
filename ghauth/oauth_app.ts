// Copyright (c) Fensak, LLC.
// SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

import { config, Octokit, octokitCreateOAuthAppAuth } from "../deps.ts";

const githubOauthClientID = config.get("github.oauthApp.clientID");
const githubOauthClientSecret = config.get("github.oauthApp.clientSecret");

/**
 * Create a new Octokit rest client that is authenticated as the Oauth App itself.
 */
export function octokitFromOauthApp(): Octokit {
  const authCfg = {
    clientType: "oauth-app",
    clientId: githubOauthClientID,
    clientSecret: githubOauthClientSecret,
  };
  return new Octokit({
    authStrategy: octokitCreateOAuthAppAuth,
    auth: authCfg,
  });
}
