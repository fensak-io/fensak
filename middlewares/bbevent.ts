// Copyright (c) Fensak, LLC.
// SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

import { Context, jwt } from "../deps.ts";
import type { Middleware, Next } from "../deps.ts";

import { logger } from "../logging/mod.ts";
import { getBitBucketWorkspaceByClientKey } from "../svcdata/mod.ts";

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

  // Stage 1
  // Retrieve the existing security context for the BitBucket workspace using the iss key in the JWT.
  // This security context will be used to validate the JWT in stage 2.
  const [_h, payloadRaw, _s] = jwt.decode(bbjwt);
  // deno-lint-ignore no-explicit-any
  const payload = payloadRaw as any;
  const [_n, maybeBBWS] = await getBitBucketWorkspaceByClientKey(payload.iss);
  if (!maybeBBWS || !maybeBBWS.value) {
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

  // Stage 2
  // Turn the raw shared secret into a CryptoKey object and validate the JWT from BitBucket.
  const encoder = new TextEncoder();
  const keyBuf = encoder.encode(securityCtx.sharedSecret);
  const key = await crypto.subtle.importKey(
    "raw",
    keyBuf,
    { name: "HMAC", hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
  // deno-lint-ignore no-explicit-any
  let verifiedClaims: any;
  try {
    verifiedClaims = await jwt.verify(bbjwt, key);
  } catch (e) {
    logger.error(`Could not verify bitbucket jwt: ${e}`);
    returnUnauthorizedResp(ctx);
    return;
  }

  // TODO: Validate QSH

  // At this point the JWT was validated, so continue with the request
  ctx.state.bitbucket = { verifiedClaims };
  await next();
};
