// Copyright (c) Fensak, LLC.
// SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

import { logger } from "../logging/mod.ts";
import {
  BitBucketWorkspace,
  getBitBucketWorkspace,
  storeBitBucketWorkspace,
} from "../svcdata/mod.ts";
import type {
  BitBucketEventPayload,
  BitBucketSecurityContext,
} from "../svcdata/mod.ts";

/**
 * Processes an app installed event that comes in through BitBucket.
 *
 * TODO
 * Implement allowlist for workspaces
 *
 * @return A boolean indicating whether the operation needs to be retried.
 */
export async function appInstalled(
  requestID: string,
  msg: BitBucketEventPayload,
): Promise<boolean> {
  const clientKey = msg.payload.clientKey;
  const securityCtx: BitBucketSecurityContext = {
    key: msg.payload.key,
    clientKey: msg.payload.clientKey,
    publicKey: msg.payload.publicKey,
    sharedSecret: msg.payload.sharedSecret,
    baseApiUrl: msg.payload.baseApiUrl,
  };
  const bbws: BitBucketWorkspace = {
    name: msg.payload.principal.username,
    subscriptionID: null,
    securityContext: securityCtx,
  };

  const maybeBBWS = await getBitBucketWorkspace(clientKey);
  if (maybeBBWS.value !== null) {
    logger.info(
      `[${requestID}] Ignoring bitbucket app installation event since already installed.`,
    );
    return false;
  }

  const ok = await storeBitBucketWorkspace(bbws, maybeBBWS);
  if (!ok) {
    logger.error(
      `[${requestID}] Consistency error while storing bitbucket workspace. Retrying event.`,
    );
    return true;
  }

  return false;
}
