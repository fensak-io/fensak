// Copyright (c) Fensak, LLC.
// SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

import { Context, Status } from "../deps.ts";

export function returnUnauthorizedResp(ctx: Context): void {
  const respStatus = Status.Forbidden;
  ctx.response.status = respStatus;
  ctx.response.body = {
    status: respStatus,
    msg: "Unauthorized.",
  };
}
