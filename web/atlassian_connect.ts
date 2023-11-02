// Copyright (c) Fensak, LLC.
// SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

import { config, Context, Status } from "../deps.ts";

import { getBitBucketAppKey } from "../bbstd/mod.ts";

const appEnv = config.get("env");
const appURL = config.get("appURL");
const dashboardAppURL = config.get("dashboardAppURL");
const oauthConsumerID = config.get("bitbucket.oauthConsumerID");

/**
 * The handler function for serving the Atlassian Connect App descriptor.
 * Refer to https://developer.atlassian.com/cloud/bitbucket/app-descriptor/ for more information.
 */
export function atlassianConnectJSON(ctx: Context): void {
  let name = "Fensak App (Test)";
  switch (appEnv) {
    case "stage":
      name = "Fensak App (Staging)";
      break;

    case "prod":
      name = "Fensak App";
      break;
  }
  const key = getBitBucketAppKey();

  const eventsToSubscribe = [
    "pullrequest:approved",
    "pullrequest:unapproved",
    "pullrequest:rejected",
    "pullrequest:changes_request_created",
    "pullrequest:created",
    "repo:push",
  ];
  const webhooks = [];
  for (const ev of eventsToSubscribe) {
    webhooks.push({
      event: ev,
      url: "/hooks/bb/event",
    });
  }

  const cfg = {
    key,
    name,
    description:
      "This app allows you to implement branch protection on your GitOps workflows without compromise.",
    vendor: {
      name: "Fensak",
      url: "https://fensak.io",
    },
    links: {
      homepage: "https://fensak.io",
      source: "https://github.com/fensak-io/fensak",
      documentation: "https://docs.fensak.io/docs/",
      support: "https://github.com/orgs/fensak-io/discussions",
    },
    baseUrl: appURL,
    authentication: {
      type: "jwt",
    },
    lifecycle: {
      installed: "/hooks/bb/installed",
      uninstalled: "/hooks/bb/uninstalled",
    },
    scopes: [
      // Needed to read the repo contents for creating the patch data for the rules.
      "repository",
      // Needed to read the pull request metadata for creating the patch data for the rules.
      "pullrequest",
      // Needed to add self to webhooks on the repositories being watched.
      "webhook",
    ],
    contexts: ["account"],
    modules: {
      webhooks,
      postInstallRedirect: {
        key: "postinstallredirect",
        url: dashboardAppURL,
      },
      oauthConsumer: {
        clientId: oauthConsumerID,
      },
    },
  };

  ctx.response.status = Status.OK;
  ctx.response.body = cfg;
}
