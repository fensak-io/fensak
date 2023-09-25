import { GitHubWebhooks } from "../deps.ts";

const rawSecret = Deno.env.get("FENSAK_GITHUB_WEBHOOK_SECRET");
let secret = "";
if (rawSecret) {
  secret = rawSecret;
}

export const githubWebhooks = new GitHubWebhooks({ secret });
