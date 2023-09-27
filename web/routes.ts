import { Context, GitHubWebhookEventName, Router, Status } from "../deps.ts";

import * as middlewares from "../middlewares/mod.ts";
import { enqueueMsg, MessageType } from "../svcdata/mod.ts";

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
