// Copyright (c) Fensak, LLC.
// SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

import { logger } from "../logging/mod.ts";
import {
  BitBucketWorkspace,
  getBitBucketWorkspace,
  getBitBucketWorkspaceByClientKey,
  removeSecurityContextForBitBucketWorkspace,
  storeBitBucketWorkspace,
} from "../svcdata/mod.ts";
import type { BitBucketSecurityContext } from "../svcdata/mod.ts";

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
  // deno-lint-ignore no-explicit-any
  payload: any,
): Promise<boolean> {
  const name = payload.principal.username;
  const securityCtx: BitBucketSecurityContext = {
    key: payload.key,
    clientKey: payload.clientKey,
    publicKey: payload.publicKey,
    sharedSecret: payload.sharedSecret,
    baseApiUrl: payload.baseApiUrl,
  };

  let bbws: BitBucketWorkspace;
  let maybeBBWS = await getBitBucketWorkspace(name);
  if (maybeBBWS.value !== null) {
    // Make sure the existing security context is removed if exists.
    await removeSecurityContextForBitBucketWorkspace(maybeBBWS);

    // Update the existing BBWS reference to avoid consistency errors.
    maybeBBWS = await getBitBucketWorkspace(name);
    // NOTE: This check is not necessary, but is useful to make the compiler happy
    if (maybeBBWS.value === null) {
      throw new Error("impossible condition");
    }

    bbws = { ...maybeBBWS.value };
    bbws.securityContext = securityCtx;
  } else {
    bbws = {
      name: payload.principal.username,
      subscriptionID: null,
      securityContext: securityCtx,
    };
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

/**
 * Processes an app uninstalled event that comes in through BitBucket.
 *
 * @return A boolean indicating whether the operation needs to be retried.
 */
export async function appUninstalled(
  requestID: string,
  // deno-lint-ignore no-explicit-any
  payload: any,
): Promise<boolean> {
  const clientKey = payload.clientKey;
  const [_n, maybeBBWS] = await getBitBucketWorkspaceByClientKey(clientKey);
  if (!maybeBBWS || !maybeBBWS.value) {
    logger.debug(
      `[${requestID}] Ignoring uninstall BitBucket app event: already uninstalled.`,
    );
    return false;
  }
  await removeSecurityContextForBitBucketWorkspace(maybeBBWS);
  return false;
}
