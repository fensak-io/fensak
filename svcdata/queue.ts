// Copyright (c) Fensak, LLC.
// SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1

import { GitHubWebhookEvent, GitHubWebhookEventName } from "../deps.ts";

import { mainKV } from "./svc.ts";

/**
 * The type of the message payload sent through the queue.
 * @property Unknown Unknown message.
 * @property GitHubEvent A GitHub event sent through as a webhook message.
 */
export enum MessageType {
  Unknown = 0,
  HealthCheck = 1,
  GitHubEvent = 10,
  BitBucketEvent = 20,
}

/**
 * A message payload for healthchecks.
 * @property requestID The request ID for the healthcheck.
 */
export interface HealthCheckPayload {
  requestID: string;
}

/**
 * A message payload that represents a GitHub event sent through as a webhook message.
 * @property requestID The webhook event request ID. This will be the delivery GUID.
 * @property eventName The webhook event name as provided by GitHub.
 * @property payload The webhook event request payload as provided by GitHub.
 */
export interface GitHubEventPayload {
  requestID: string;
  eventName: GitHubWebhookEventName;
  payload: GitHubWebhookEvent;
}

/**
 * A message payload that represents a BitBucket event sent through as a webhook message.
 * @property requestID The webhook event request ID. This will be the delivery GUID.
 * @property eventName The webhook event name as provided by BitBucket.
 * @property payload The webhook event request payload as provided by BitBucket.
 */
export interface BitBucketEventPayload {
  requestID: string;
  eventName: string;

  // deno-lint-ignore no-explicit-any
  payload: any;
}

/**
 * A message that can be sent through the KV queue for processing by a task worker.
 */
export interface Message {
  type: MessageType;
  payload: GitHubEventPayload | BitBucketEventPayload | HealthCheckPayload;
}

/**
 * Start a background event handler to process messages coming in through the queue on Deno KV.
 * @param handler A function to handle messages sent through the KV queue.
 */
export function listenQueue(
  handler: (msg: Message) => Promise<void>,
): void {
  // deno-lint-ignore no-explicit-any
  mainKV.listenQueue(async (msg: any): Promise<void> => {
    if (!Object.values(MessageType).includes(msg.type)) {
      throw new Error(`unknown message enqueued: ${JSON.stringify(msg)}`);
    }
    await handler(msg as Message);
  });
}

/**
 * Enqueue a message on the KV queue to be processed by a worker listening for events.
 * @param msg The message payload to be sent to the worker through the KV queue.
 */
export async function enqueueMsg(
  msg: Message,
  delayMS?: number,
): Promise<void> {
  if (delayMS) {
    await mainKV.enqueue(msg, { delay: delayMS });
  } else {
    await mainKV.enqueue(msg);
  }
}
