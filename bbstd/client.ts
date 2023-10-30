// Copyright (c) Fensak, LLC.
// SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

import { config, reng } from "../deps.ts";

import type {
  BitBucketWorkspace,
  BitBucketWorkspaceWithSubscription,
} from "../svcdata/mod.ts";

const appEnv = config.get("env");

export function getBitBucketAppKey(): string {
  let key = "fensak-app-test";
  switch (appEnv) {
    case "stage":
      key = "fensak-app-stage";
      break;

    case "prod":
      key = "fensak-app";
      break;
  }
  return key;
}

export function bitbucketFromWorkspace(
  ws: BitBucketWorkspace | BitBucketWorkspaceWithSubscription,
): reng.BitBucket {
  if (ws.securityContext === null) {
    throw new Error(
      `Can not initialize bitbucket client for workspace ${ws.name}: no security context`,
    );
  }

  return new reng.BitBucket({
    baseUrl: ws.securityContext.baseApiUrl,
    securityContext: ws.securityContext,
  });
}
