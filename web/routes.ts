// Copyright (c) Fensak, LLC.
// SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

import { Context, GitHubWebhookEventName, Router, Status } from "../deps.ts";

import { logger } from "../logging/mod.ts";
import * as middlewares from "../middlewares/mod.ts";
import { enqueueMsg, MessageType } from "../svcdata/mod.ts";
import { fastRejectEvent } from "../ghevent/mod.ts";
import { fastRejectEvent as fastRejectBitBucketEvent } from "../bbevent/mod.ts";

import { atlassianConnectJSON } from "./atlassian_connect.ts";

export function attachRoutes(router: Router): void {
  router
    .post("/hooks/gh", middlewares.assertGitHubWebhook, handleGitHubWebhooks)
    .get("/.well-known/atlassian-connect.json", atlassianConnectJSON)
    .post(
      "/hooks/bb/event",
      middlewares.assertBitBucketWebhook,
      handleBitBucketWebhooks,
    )
    .post("/hooks/bb/installed", handleBitBucketAppInstallation)
    .post(
      "/hooks/bb/uninstalled",
      middlewares.assertBitBucketWebhook,
      handleBitBucketAppInstallation,
    );
}

async function handleGitHubWebhooks(ctx: Context): Promise<void> {
  const ghEventName = ctx.request.headers.get("X-GitHub-Event");
  if (ghEventName == null) {
    ctx.response.status = Status.BadRequest;
    ctx.response.body = {
      status: Status.BadRequest,
      msg: "Missing event name header.",
    };
    return;
  }
  const ghEventID = ctx.request.headers.get("X-GitHub-Delivery");
  if (ghEventID == null) {
    ctx.response.status = Status.BadRequest;
    ctx.response.body = {
      status: Status.BadRequest,
      msg: "Missing event ID header.",
    };
    return;
  }

  const eventName = ghEventName as GitHubWebhookEventName;
  const body = ctx.request.body({ type: "json" });
  const payload = await body.value;
  if (fastRejectEvent(eventName, payload)) {
    logger.debug(
      `[${ghEventID}] Rejecting github event because of fast filter`,
    );
    ctx.response.status = Status.NoContent;
    return;
  }

  await enqueueMsg({
    type: MessageType.GitHubEvent,
    payload: {
      requestID: ghEventID,
      eventName: eventName,
      payload: payload,
    },
  });

  ctx.response.status = Status.NoContent;
}

async function handleBitBucketWebhooks(ctx: Context): Promise<void> {
  const bbEventName = ctx.request.headers.get("X-Event-Key");
  if (bbEventName == null) {
    logger.debug("Rejecting bitbucket event for missing event name");
    ctx.response.status = Status.BadRequest;
    ctx.response.body = {
      status: Status.BadRequest,
      msg: "Missing event name header.",
    };
    return;
  }
  const bbEventID = ctx.request.headers.get("X-Request-UUID");
  if (bbEventID == null) {
    logger.debug("Rejecting bitbucket event for missing event ID");
    ctx.response.status = Status.BadRequest;
    ctx.response.body = {
      status: Status.BadRequest,
      msg: "Missing event ID header.",
    };
    return;
  }

  const body = ctx.request.body({ type: "json" });
  const payload = await body.value;
  const data = payload.data;

  if (fastRejectBitBucketEvent(bbEventName, data)) {
    logger.debug(
      `[${bbEventID}] Rejecting bitbucket event because of fast filter`,
    );
    ctx.response.status = Status.NoContent;
    return;
  }

  await enqueueMsg({
    type: MessageType.BitBucketEvent,
    payload: {
      requestID: bbEventID,
      eventName: bbEventName,
      payload: data,
      // comes from assertBitBucketWebhook middleware
      verifiedClaims: ctx.state.bitbucket.verifiedClaims,
    },
  });

  ctx.response.status = Status.NoContent;
}

async function handleBitBucketAppInstallation(ctx: Context): Promise<void> {
  const body = ctx.request.body({ type: "json" });
  const payload = await body.value;

  // Make sure all the expected fields are set
  if (
    !payload.principal ||
    !payload.principal.username ||
    !payload.eventType ||
    !payload.clientKey ||
    !payload.publicKey ||
    !payload.key ||
    !payload.baseApiUrl ||
    (payload.eventType !== "installed" && payload.eventType !== "uninstalled")
  ) {
    logger.debug(
      `Rejecting bitbucket event for malformed payload: ${
        JSON.stringify(payload)
      }`,
    );
    ctx.response.status = Status.BadRequest;
    ctx.response.body = {
      status: Status.BadRequest,
      msg: "Payload is malformed.",
    };
    return;
  }

  const eventID = `${payload.principal.username}:${payload.eventType}`;

  await enqueueMsg({
    type: MessageType.BitBucketEvent,
    payload: {
      requestID: eventID,
      eventName: payload.eventType,
      payload: payload,
      // comes from assertBitBucketWebhook middleware
      verifiedClaims: ctx.state.bitbucket?.verifiedClaims,
    },
  });

  ctx.response.status = Status.NoContent;
}
