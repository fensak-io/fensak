import { config, Octokit } from "../deps.ts";

const token = config.get("github.apiToken");
let octokitRestTestClt: Octokit;
if (token) {
  octokitRestTestClt = new Octokit({ auth: token });
} else {
  octokitRestTestClt = new Octokit();
}

export { octokitRestTestClt };
