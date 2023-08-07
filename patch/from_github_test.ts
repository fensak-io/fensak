import { assertEquals, assertNotEquals } from "../test_deps.ts";
import { Octokit } from "../deps.ts";

import { IPatch, PatchOp } from "./patch.ts";
import { patchFromGitHubPullRequest } from "./from_github.ts";
import type { IGitHubRepository } from "./from_github.ts";

const octokit = new Octokit();
const testRepo: IGitHubRepository = {
  owner: "fensak-test",
  name: "test-fgo-rules-engine",
};

Deno.test("single file with modification", async () => {
  const pl = await patchFromGitHubPullRequest(octokit, testRepo, 1);
  assertEquals(pl.length, 1);
  assertEquals(pl[0].path, "appversions.json");
  assertEquals(pl[0].op, PatchOp.Modified);

  // TODO: verify patch hunks
});

Deno.test("single file with multiple modifications", async () => {
  const pl = await patchFromGitHubPullRequest(octokit, testRepo, 2);
  assertEquals(pl.length, 1);
  assertEquals(pl[0].path, "appversions.json");
  assertEquals(pl[0].op, PatchOp.Modified);

  // TODO: verify patch hunks
});

Deno.test("multiple file with modifications", async () => {
  const pl = await patchFromGitHubPullRequest(octokit, testRepo, 24);
  assertEquals(pl.length, 2);

  const seen: Record<string, null | IPatch> = {
    "appversions.json": null,
    "appversions.tfvars": null,
  };
  for (const p of pl) {
    switch (p.path) {
      case "appversions.tfvars":
      case "appversions.json":
        seen[p.path] = p;
        break;
      default:
        throw new Error(`unexpected file: ${p.path}`);
    }
    assertEquals(p.op, PatchOp.Modified);
  }
  assertNotEquals(seen["appversions.json"], null);
  assertNotEquals(seen["appversions.tfvars"], null);

  // TODO: verify patch hunks
});

Deno.test("new file added", async () => {
  const pl = await patchFromGitHubPullRequest(octokit, testRepo, 21);
  assertEquals(pl.length, 1);
  assertEquals(pl[0].path, "newconfig.json");
  assertEquals(pl[0].op, PatchOp.Insert);

  // TODO: verify patch hunks
});

Deno.test("file removed", async () => {
  const pl = await patchFromGitHubPullRequest(octokit, testRepo, 22);
  assertEquals(pl.length, 1);
  assertEquals(pl[0].path, "appversions.json");
  assertEquals(pl[0].op, PatchOp.Delete);

  // TODO: verify patch hunks
});
