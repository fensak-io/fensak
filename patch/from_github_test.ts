import { assertEquals, assertNotEquals } from "../test_deps.ts";
import { Octokit } from "../deps.ts";

import { IPatch, LineOp, PatchOp } from "./patch_types.ts";
import { patchFromGitHubPullRequest } from "./from_github.ts";
import type { IGitHubRepository } from "./from_github.ts";

const octokit = new Octokit();
const testRepo: IGitHubRepository = {
  owner: "fensak-test",
  name: "test-fgo-rules-engine",
};

Deno.test("single file with modification", async () => {
  const patches = await patchFromGitHubPullRequest(octokit, testRepo, 1);
  const pl = patches.patchList;
  assertEquals(pl.length, 1);
  assertEquals(pl[0].path, "appversions.json");
  assertEquals(pl[0].op, PatchOp.Modified);

  const diffs = pl[0].diff;
  assertEquals(diffs.length, 1);
  assertEquals(diffs[0], {
    originalStart: 1,
    originalLength: 5,
    updatedStart: 1,
    updatedLength: 5,
    diffOperations: [{
      op: LineOp.Untouched,
      text: "{",
      newText: "",
    }, {
      op: LineOp.Untouched,
      text: `  "coreapp": "v0.1.0",`,
      newText: "",
    }, {
      op: LineOp.Modified,
      text: `  "subapp": "v1.1.0",`,
      newText: `  "subapp": "v1.2.0",`,
    }, {
      op: LineOp.Untouched,
      text: `  "logapp": "v100.1.0"`,
      newText: "",
    }, {
      op: LineOp.Untouched,
      text: "}",
      newText: "",
    }],
  });
});

Deno.test("single file with multiple modifications", async () => {
  const patches = await patchFromGitHubPullRequest(octokit, testRepo, 2);
  const pl = patches.patchList;
  assertEquals(pl.length, 1);
  assertEquals(pl[0].path, "appversions.json");
  assertEquals(pl[0].op, PatchOp.Modified);

  const diffs = pl[0].diff;
  assertEquals(diffs.length, 1);
  assertEquals(diffs[0], {
    originalStart: 1,
    originalLength: 5,
    updatedStart: 1,
    updatedLength: 5,
    diffOperations: [{
      op: LineOp.Untouched,
      text: "{",
      newText: "",
    }, {
      op: LineOp.Untouched,
      text: `  "coreapp": "v0.1.0",`,
      newText: "",
    }, {
      op: LineOp.Modified,
      text: `  "subapp": "v1.1.0",`,
      newText: `  "subapp": "v1.2.0",`,
    }, {
      op: LineOp.Modified,
      text: `  "logapp": "v100.1.0"`,
      newText: `  "logapp": "v100.2.0"`,
    }, {
      op: LineOp.Untouched,
      text: "}",
      newText: "",
    }],
  });
});

Deno.test("multiple file with modifications", async () => {
  const patches = await patchFromGitHubPullRequest(octokit, testRepo, 24);
  const pl = patches.patchList;
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

  if (seen["appversions.json"] == null) {
    throw new Error("impossible");
  }
  if (seen["appversions.tfvars"] == null) {
    throw new Error("impossible");
  }

  const jsonDiff = seen["appversions.json"].diff;
  assertEquals(jsonDiff.length, 1);
  assertEquals(jsonDiff[0], {
    originalStart: 1,
    originalLength: 5,
    updatedStart: 1,
    updatedLength: 5,
    diffOperations: [{
      op: LineOp.Untouched,
      text: "{",
      newText: "",
    }, {
      op: LineOp.Untouched,
      text: `  "coreapp": "v0.1.0",`,
      newText: "",
    }, {
      op: LineOp.Modified,
      text: `  "subapp": "v1.1.0",`,
      newText: `  "subapp": "v1.2.0",`,
    }, {
      op: LineOp.Untouched,
      text: `  "logapp": "v100.1.0"`,
      newText: "",
    }, {
      op: LineOp.Untouched,
      text: "}",
      newText: "",
    }],
  });

  const tfvarsDiff = seen["appversions.tfvars"].diff;
  assertEquals(tfvarsDiff.length, 1);
  assertEquals(tfvarsDiff[0], {
    originalStart: 1,
    originalLength: 3,
    updatedStart: 1,
    updatedLength: 3,
    diffOperations: [{
      op: LineOp.Untouched,
      text: `coreapp_version = "v0.1.0"`,
      newText: "",
    }, {
      op: LineOp.Modified,
      text: `subapp_version  = "v1.1.0"`,
      newText: `subapp_version  = "v1.2.0"`,
    }, {
      op: LineOp.Untouched,
      text: `logapp_version  = "v100.1.0"`,
      newText: "",
    }],
  });
});

Deno.test("new file added", async () => {
  const patches = await patchFromGitHubPullRequest(octokit, testRepo, 21);
  const pl = patches.patchList;
  assertEquals(pl.length, 1);
  assertEquals(pl[0].path, "newconfig.json");
  assertEquals(pl[0].op, PatchOp.Insert);

  const diffs = pl[0].diff;
  assertEquals(diffs.length, 1);
  assertEquals(diffs[0], {
    originalStart: 0,
    originalLength: 0,
    updatedStart: 1,
    updatedLength: 3,
    diffOperations: [{
      op: LineOp.Insert,
      text: "{",
      newText: "",
    }, {
      op: LineOp.Insert,
      text: `  "greeting": "hello world"`,
      newText: "",
    }, {
      op: LineOp.Insert,
      text: "}",
      newText: "",
    }],
  });
});

Deno.test("file removed", async () => {
  const patches = await patchFromGitHubPullRequest(octokit, testRepo, 22);
  const pl = patches.patchList;
  assertEquals(pl.length, 1);
  assertEquals(pl[0].path, "appversions.json");
  assertEquals(pl[0].op, PatchOp.Delete);

  const diffs = pl[0].diff;
  assertEquals(diffs.length, 1);
  assertEquals(diffs[0], {
    originalStart: 1,
    originalLength: 5,
    updatedStart: 0,
    updatedLength: 0,
    diffOperations: [{
      op: LineOp.Delete,
      text: "{",
      newText: "",
    }, {
      op: LineOp.Delete,
      text: `  "coreapp": "v0.1.0",`,
      newText: "",
    }, {
      op: LineOp.Delete,
      text: `  "subapp": "v1.1.0",`,
      newText: "",
    }, {
      op: LineOp.Delete,
      text: `  "logapp": "v100.1.0"`,
      newText: "",
    }, {
      op: LineOp.Delete,
      text: "}",
      newText: "",
    }],
  });
});
