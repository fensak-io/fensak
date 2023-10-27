// Copyright (c) Fensak, LLC.
// SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

import { logger } from "../logging/mod.ts";
import type { BitBucketEventPayload } from "../svcdata/mod.ts";

import { appInstalled } from "./installation.ts";

/**
 * Handles the given BitBucket event.
 *
 * @return A boolean indicating whether the operation needs to be retried.
 */
export async function handleBitBucketEvent(
  msg: BitBucketEventPayload,
): Promise<boolean> {
  logger.info(`[${msg.requestID}] Processing bitbucket ${msg.eventName} event`);

  let retry = false;
  switch (msg.eventName) {
    default:
      logger.debug(
        `[${msg.requestID}] Discarding bitbucket event ${msg.eventName}`,
      );
      return false;

    case "installed":
      retry = await appInstalled(msg.requestID, msg);
      break;
  }

  logger.info(`[${msg.requestID}] Processed bitbucket ${msg.eventName} event`);
  return retry;
}
