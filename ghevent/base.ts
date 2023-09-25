import { config, GitHubWebhooks } from "../deps.ts";

const secret = config.get("github.webhookSecret");

export const githubWebhooks = new GitHubWebhooks({ secret });
