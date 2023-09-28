import { handleGitHubEvent } from "../ghevent/mod.ts";
import {
  enqueueMsg,
  listenQueue,
  Message,
  MessageType,
} from "../svcdata/mod.ts";
import type { GitHubEventPayload } from "../svcdata/mod.ts";

const retryDelay = 5 * 1000; // 5 seconds

export function startWorker(): void {
  listenQueue(handler);
}

async function handler(msg: Message): Promise<void> {
  let retry = false;
  switch (msg.type) {
    case MessageType.Unknown:
      console.log(
        `Received unknown message: ${msg.payload}. Ignoring message.`,
      );
      return;

    case MessageType.GitHubEvent:
      retry = await handleGitHubEvent(msg.payload as GitHubEventPayload);
      break;
  }

  if (retry) {
    console.warn("Retrying task with delay");
    await enqueueMsg(msg, retryDelay);
  }
}
