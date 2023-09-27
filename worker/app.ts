import { handleGitHubEvent } from "../ghevent/mod.ts";
import { listenQueue, Message, MessageType } from "../svcdata/mod.ts";
import type { GitHubEventPayload } from "../svcdata/mod.ts";

export function startWorker(): void {
  listenQueue(handler);
}

async function handler(msg: Message): Promise<void> {
  switch (msg.type) {
    case MessageType.Unknown:
      console.log(
        `Received unknown message: ${msg.payload}. Ignoring message.`,
      );
      return;

    case MessageType.GitHubEvent:
      await handleGitHubEvent(msg.payload as GitHubEventPayload);
      return;
  }
}
