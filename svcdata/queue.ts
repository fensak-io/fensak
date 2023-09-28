import { GitHubWebhookEvent, GitHubWebhookEventName } from "../deps.ts";

import { mainKV } from "./svc.ts";

/**
 * The type of the message payload sent through the queue.
 * @property Unknown Unknown message.
 * @property GitHubEvent A GitHub event sent through as a webhook message.
 */
export enum MessageType {
  Unknown = 0,
  GitHubEvent = 10,
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
 * A message that can be sent through the KV queue for processing by a task worker.
 */
export interface Message {
  type: MessageType;
  payload: GitHubEventPayload;
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
    switch (msg.type) {
      default:
        throw new Error(`unknown message enqueued: ${msg}`);

      case MessageType.Unknown:
      case MessageType.GitHubEvent:
        await handler(msg as Message);
        break;
    }
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
