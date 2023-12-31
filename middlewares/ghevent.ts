// Copyright (c) Fensak, LLC.
// SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

import { Context, Status } from "../deps.ts";
import type { Middleware, Next } from "../deps.ts";
import { githubWebhooks } from "../ghauth/mod.ts";

const assertGitHubWebhook: Middleware = async (
  ctx: Context,
  next: Next,
): Promise<void> => {
  const ghSig = ctx.request.headers.get("X-Hub-Signature-256");
  if (ghSig == null) {
    returnInvalidGHHook(ctx);
    return;
  }

  const body = ctx.request.body({ type: "text" });
  const bodyText = await body.value;
  const isValid = await githubWebhooks.verify(bodyText, ghSig);
  if (!isValid) {
    returnInvalidGHHook(ctx);
    return;
  }

  await next();
};

function returnInvalidGHHook(ctx: Context): void {
  const respStatus = Status.Forbidden;
  ctx.response.status = respStatus;
  ctx.response.body = {
    status: respStatus,
    msg: "Could not verify github signature.",
  };
}

export { assertGitHubWebhook };
