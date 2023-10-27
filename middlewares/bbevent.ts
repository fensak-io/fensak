// Copyright (c) Fensak, LLC.
// SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

import { Context, jwt } from "../deps.ts";
import type { Middleware, Next } from "../deps.ts";

import { logger } from "../logging/mod.ts";
import { getBitBucketWorkspace } from "../svcdata/mod.ts";

import { returnUnauthorizedResp } from "./common_resps.ts";

export const assertBitBucketWebhook: Middleware = async (
  ctx: Context,
  next: Next,
): Promise<void> => {
  let bbjwt = "";
  const qpJWT = ctx.request.url.searchParams.get("jwt");
  if (qpJWT) {
    bbjwt = qpJWT;
  } else {
    const auth = ctx.request.headers.get("Authorization");
    if (!auth || !auth.startsWith("JWT ")) {
      logger.debug("Authorization header missing or is not jwt");
      returnUnauthorizedResp(ctx);
      return;
    }
    bbjwt = auth.replace(/^JWT /, "");
  }

  const [_h, payload, _s] = jwt.decode(bbjwt);
  const maybeBBWS = await getBitBucketWorkspace(payload.iss);
  if (!maybeBBWS.value) {
    logger.debug(`No BitBucket workspace record for ${payload.iss}`);
    returnUnauthorizedResp(ctx);
    return;
  }
  const securityCtx = maybeBBWS.value.securityContext;
  if (!securityCtx) {
    logger.debug(`No BitBucket security context for ${payload.iss}`);
    returnUnauthorizedResp(ctx);
    return;
  }

  try {
    await jwt.verify(bbjwt, securityCtx.sharedSecret);
  } catch (e) {
    logger.error(`Could not verify bitbucket jwt: ${e}`);
    returnUnauthorizedResp(ctx);
    return;
  }

  // TODO: Validate QSH

  // At this point the JWT was validated, so continue with the request
  await next();
};
