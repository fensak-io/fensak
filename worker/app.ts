// Copyright (c) Fensak, LLC.
// SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

import { config } from "../deps.ts";

import { logger, lokiTransport } from "../logging/mod.ts";
import { handleGitHubEvent } from "../ghevent/mod.ts";
import {
  enqueueMsg,
  listenQueue,
  Message,
  MessageType,
  storeHealthCheckResult,
} from "../svcdata/mod.ts";
import type { GitHubEventPayload, HealthCheckPayload } from "../svcdata/mod.ts";

const retryDelay = 5 * 1000; // 5 seconds
const lokiEnabled = config.get("logging.loki.enabled");

export function startWorker(): void {
  listenQueue(handler);
}

async function handler(msg: Message): Promise<void> {
  try {
    await runHandler(msg);
  } finally {
    if (lokiEnabled) {
      await lokiTransport.flush();
    }
  }
}

async function runHandler(msg: Message): Promise<void> {
  let retry = false;
  switch (msg.type) {
    case MessageType.Unknown:
      logger.info(
        `Received unknown message: ${msg.payload}. Ignoring message.`,
      );
      return;

    case MessageType.HealthCheck:
      await handleHealthCheck(msg.payload as HealthCheckPayload);
      return;

    case MessageType.GitHubEvent:
      retry = await handleGitHubEvent(msg.payload as GitHubEventPayload);
      break;
  }

  if (retry) {
    logger.warn("Retrying task with delay");
    await enqueueMsg(msg, retryDelay);
  }
}

async function handleHealthCheck(payload: HealthCheckPayload): Promise<void> {
  logger.debug(`Received healthcheck for request ${payload.requestID}`);
  await storeHealthCheckResult(payload.requestID);
}
