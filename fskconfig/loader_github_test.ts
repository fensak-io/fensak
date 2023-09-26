import { assert, assertEquals } from "../test_deps.ts";
import { config, Octokit } from "../deps.ts";

import { RuleFnSourceLang } from "../udr/mod.ts";

import { loadConfigFromGitHub } from "./loader_github.ts";

const token = config.get("github.apiToken");
let octokit: Octokit;
if (token) {
  octokit = new Octokit({ auth: token });
} else {
  octokit = new Octokit();
}

Deno.test("loadConfigFromGitHub for fensak-test example repo", async () => {
  const cfg = await loadConfigFromGitHub(octokit, "fensak-test");
  assertEquals(cfg.gitSHA, "4c35fe73411fd4a57cd45b0621d63638536425fc");
  assertEquals(cfg.orgConfig, {
    repos: {
      "test-github-webhooks": {
        ruleFile: "subfolder/allow_readme_changes.js",
        ruleLang: RuleFnSourceLang.ES6,
      },
      "test-fensak-rules-engine": {
        ruleFile: "app_deploy_rule.ts",
        ruleLang: RuleFnSourceLang.Typescript,
      },
    },
  });

  // Test that the ruleLookup record contains rules for the expected rule functions.
  //
  // Ideally we can use the assertion functions to test this, but for some bizarre reason, even though the object
  // materializes, the assertion functions see that the object is undefined.
  const appDeployRule = cfg.ruleLookup["app_deploy_rule.ts"];
  if (!appDeployRule) {
    assert(false, "The rule app_deploy_rule.ts was not successfully compiled");
  }
  const allowReadmeChanges =
    cfg.ruleLookup["subfolder/allow_readme_changes.js"];
  if (!allowReadmeChanges) {
    assert(
      false,
      "The rule subfolder/allow_readme_changes.js was not successfully compiled",
    );
  }

  // TODO
  // add some basic testing for the compiled rule source
});
