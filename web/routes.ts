// Copyright (c) Fensak, LLC.
// SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

import { Context, GitHubWebhookEventName, Router, Status } from "../deps.ts";

import * as middlewares from "../middlewares/mod.ts";
import {
  enqueueMsg,
  MessageType,
  waitForHealthCheckResult,
} from "../svcdata/mod.ts";
import { getRandomString } from "../xtd/mod.ts";

export function attachRoutes(router: Router): void {
  router
    .get("/healthz", healthCheck)
    .post("/hooks/gh", middlewares.assertGitHubWebhook, handleGitHubWebhooks);
}

async function healthCheck(ctx: Context): Promise<void> {
  const requestID = getRandomString(6);
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

  const body = ctx.request.body({ type: "json" });
  const payload = await body.value;
  await enqueueMsg({
    type: MessageType.GitHubEvent,
    payload: {
      requestID: ghEventID,
      eventName: ghEventName as GitHubWebhookEventName,
      payload: payload,
    },
  });

  ctx.response.status = Status.NoContent;
}
