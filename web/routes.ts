// Copyright (c) Fensak, LLC.
// SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

import { Context, GitHubWebhookEventName, Router, Status } from "../deps.ts";

import { logger } from "../logging/mod.ts";
import * as middlewares from "../middlewares/mod.ts";
import { enqueueMsg, MessageType } from "../svcdata/mod.ts";
import { fastRejectEvent } from "../ghevent/mod.ts";

export function attachRoutes(router: Router): void {
  router
    .post("/hooks/gh", middlewares.assertGitHubWebhook, handleGitHubWebhooks);
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
    logger.debug(`[${ghEventID}] Rejecting event because of fast filter`);
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
