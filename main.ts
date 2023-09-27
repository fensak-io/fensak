import { loadTestGitHubOrg } from "./svcdata/mod.ts";
import { startWorker } from "./worker/mod.ts";
import { startWebServer } from "./web/mod.ts";

const testInstIDStr = Deno.env.get("TEST_FENSAK_GITHUB_INSTALLATION_ID");
if (testInstIDStr) {
  const testInstID = parseInt(testInstIDStr);
  await loadTestGitHubOrg(testInstID);
}

startWorker();
await startWebServer();
