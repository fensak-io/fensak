import { assertEquals, assertExists } from "../test_deps.ts";
import { octokitFromInstallation } from "./app.ts";

Deno.test("github auth as installation", async () => {
  const testInstIDStr = Deno.env.get("TEST_FENSAK_GITHUB_INSTALLATION_ID");
  assertExists(testInstIDStr);
  const testInstID = parseInt(testInstIDStr);
  const octokit = await octokitFromInstallation(testInstID);
  const { data: repo } = await octokit.repos.get({
    owner: "fensak-test",
    repo: "test-github-webhooks",
  });
  assertEquals(repo.default_branch, "main");
});
